import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import pool from '../src/config/database';
import { authController } from '../src/controllers/auth.controller';
import { crearDispositivo } from '../src/controllers/publicaciones.controller';
import { actualizarCentro, desactivarCentro } from '../src/controllers/centros.controller';
import { getMetricas } from '../src/controllers/dashboard.controller';
import { decimal } from '../src/utils/crud.util';
import { validarDispositivoDTO } from '../src/utils/dispositivo-validation.util';
import { AuthRequest } from '../src/middleware/auth.middleware';
import { errorHandler } from '../src/middleware/error.middleware';

const originalExpiration = process.env.JWT_EXPIRES_IN;
const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  mock.restoreAll();
  if (originalExpiration === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = originalExpiration;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function response(): { res: Response; status: () => number; body: () => unknown } {
  let status = 200;
  let body: unknown;
  const res = {
    locals: { rol: 'ADMIN' },
    status(code: number): unknown { status = code; return res; },
    json(value: unknown): unknown { body = value; return res; },
    setHeader(): unknown { return res; }
  } as unknown as Response;
  return { res, status: () => status, body: () => body };
}

function request(body: unknown = {}): AuthRequest {
  return { body, params: { id: '1' }, usuario: { id: 5, email: 'donor@example.com', rolId: 2, nombre: 'Donante' } } as unknown as AuthRequest;
}

const next: NextFunction = error => { if (error) throw error; };
const device = { titulo: 'Placa de prueba', categoriaId: 1, centroAcopioId: 1, estadoFuncional: 'REPARABLE', pesoKg: 0.01 };

function connection(execute: (sql: string, args?: unknown[]) => Promise<unknown[]>): {
  committed: () => boolean; rolledBack: () => boolean;
} {
  let committed = false;
  let rolledBack = false;
  const conn = { execute, beginTransaction: async () => {},
    commit: async () => { committed = true; }, rollback: async () => { rolledBack = true; },
    release: () => {}, destroy: () => {}
  } as unknown as PoolConnection;
  mock.method(pool, 'getConnection', async () => conn);
  return { committed: () => committed, rolledBack: () => rolledBack };
}

function invoke(handler: RequestHandler, body: unknown = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = response();
    output.res.json = () => { resolve(output.status()); return output.res; };
    handler(request(body) as Request, output.res, reject);
  });
}

test('positive SQL decimals reject values that round to zero', () => {
  for (const value of [1e-9, 0.001, 0.009]) {
    assert.throws(() => decimal(value, 'pesoKg', 9999.99), /positivo/);
  }
  assert.equal(decimal(0.01, 'pesoKg', 9999.99), 0.01);
  assert.equal(decimal(0.1 + 0.2, 'pesoKg', 9999.99), 0.3);
});

test('publication refuses weights below 0.01 kg without opening a transaction', async () => {
  const acquired = mock.method(pool, 'getConnection', async (): Promise<never> => { throw new Error('Must not connect'); });
  const output = response();
  await crearDispositivo(request({ ...device, pesoKg: 1e-9 }), output.res, error => {
    if (error) throw error;
  });
  assert.equal(output.status(), 400);
  assert.equal(acquired.mock.callCount(), 0);
});

test('inventory edits reject weights that become zero in MySQL', () => {
  assert.throws(() => validarDispositivoDTO({ ...device, pesoKg: 1e-9 }), /positivo/);
});

test('optional whitespace fields can be cleared during inventory editing', () => {
  const body = validarDispositivoDTO({ ...device, marca: '  ', modelo: '\t', notas: '\n ' });
  assert.equal(body.marca, undefined);
  assert.equal(body.modelo, undefined);
  assert.equal(body.notas, undefined);
});

test('dashboard adds the rounded CO2 saved per device', async () => {
  // Two recovered boards of 0.01 kg at factor 35.5 each save 0.36 kg, totalling 0.72.
  let sqlText = '';
  mock.method(pool, 'execute', async (sql: string) => {
    sqlText = sql;
    return [[{ tipo: 'RAEE', clave: 'RAEE-MB', valor: '0.02', factorCo2: '35.50', co2EvitadoKg: '0.72' },
      { tipo: 'TRANSFERENCIA', clave: 'COMPLETADA', valor: 2, factorCo2: null, co2EvitadoKg: null }], []];
  });
  const output = response();
  await getMetricas(request(), output.res, next);
  const result = output.body() as { data: { totalKgRecuperados: number; co2EvitadoKg: number; transferenciasPorEstado: { COMPLETADA: number } } };
  assert.equal(result.data.totalKgRecuperados, 0.02);
  assert.equal(result.data.co2EvitadoKg, 0.72);
  assert.equal(result.data.transferenciasPorEstado.COMPLETADA, 2);
  assert.match(sqlText, /SUM\(d\.co2_evitado_kg\)/);
});

test('login rejects password suffixes beyond BCrypt 72-byte boundary', async () => {
  const queried = mock.method(pool, 'query', async () => [[], []]);
  const output = response();
  await authController.login(request({ email: 'donor@example.com', password: 'a'.repeat(72) + 'different suffix' }), output.res, next);
  assert.equal(output.status(), 400);
  assert.equal(queried.mock.callCount(), 0);
});

test('login uses the configured token lifetime while accepting an exact 72-byte password', async () => {
  process.env.JWT_EXPIRES_IN = '15m';
  const password = 'á'.repeat(36);
  const passwordHash = await bcrypt.hash(password, 4);
  mock.method(pool, 'query', async () => [[{
    id: 5, rol_id: 2, rol_nombre: 'DONOR', nombre_completo: 'Donante', email: 'donor@example.com',
    activo: true, password_hash: passwordHash
  }], []]);
  const output = response();
  await authController.login(request({ email: ' DONOR@example.com ', password }), output.res, next);
  assert.equal(output.status(), 200);
  const result = output.body() as { data: { token: string } };
  const payload = jwt.verify(result.data.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  assert.equal(payload.exp! - payload.iat!, 900);
  assert.equal(payload.id, 5);
});

test('login database failures go to the central error handler', async () => {
  const failure = new Error('SQL failure containing internal schema details');
  mock.method(pool, 'query', async () => { throw failure; });
  const output = response();
  let received: unknown;
  await authController.login(request({ email: 'donor@example.com', password: 'validPassword' }), output.res, error => { received = error; });
  assert.equal(received, failure);
  assert.equal(output.body(), undefined);
});

test('registration database failures go to the central error handler', async () => {
  const failure = new Error('SQL failure containing internal schema details');
  mock.method(pool, 'query', async () => { throw failure; });
  const output = response();
  let received: unknown;
  await authController.register(request({ nombreCompleto: 'Donante de prueba', email: 'donor@example.com', password: 'validPassword' }), output.res,
    error => { received = error; });
  assert.equal(received, failure);
  assert.equal(output.body(), undefined);
});

test('a centre with an active transfer cannot be deactivated', async () => {
  let updated = false;
  const state = connection(async sql => {
    if (sql.includes('FROM ordenes_transferencia')) return [[{ id: 8 }], []];
    if (sql.startsWith('UPDATE')) { updated = true; return [{ affectedRows: 1 }, []]; }
    if (sql.includes('FROM centros_categorias')) return [[], []];
    return [[{ id: 1, capacidadKg: '100.00', activo: true }], []];
  });
  assert.equal(await invoke(desactivarCentro), 409);
  assert.equal(updated, false);
  assert.equal(state.committed(), false);
  assert.equal(state.rolledBack(), true);
});

test('a destination keeps categories needed by active incoming transfers', async () => {
  let deleted = false;
  const state = connection(async sql => {
    if (sql.includes('ordenes_transferencia')) return [[{ id: 8 }], []];
    if (sql.includes('FROM dispositivos')) return [[], []];
    if (sql.startsWith('DELETE')) { deleted = true; return [{ affectedRows: 1 }, []]; }
    if (sql.includes('FROM centros_categorias')) return [[], []];
    return [[{ id: 1, capacidadKg: '100.00', activo: true }], []];
  });
  assert.equal(await invoke(actualizarCentro, {
    nombre: 'Destino', direccion: 'Zona 1', ciudad: 'Guatemala', capacidadKg: 100, categoriasIds: []
  }), 409);
  assert.equal(deleted, false);
  assert.equal(state.committed(), false);
  assert.equal(state.rolledBack(), true);
});

for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
  test(`the central handler converts ${code} into a retryable conflict`, () => {
    mock.method(console, 'error', () => {});
    const output = response();
    errorHandler(Object.assign(new Error('Internal SQL lock failure'), { code }),
      { method: 'POST', originalUrl: '/api/dispositivos' } as Request, output.res, next);
    assert.equal(output.status(), 409);
    const result = output.body() as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.equal(result.error, 'Conflicto concurrente. Intenta nuevamente.');
  });
}

test('production lock conflicts keep the retry message without exposing SQL or stack details', () => {
  process.env.NODE_ENV = 'production';
  mock.method(console, 'error', () => {});
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const output = response();
    errorHandler(Object.assign(new Error('SQL UPDATE private_schema.usuarios secret_column'), { code }),
      { method: 'POST', originalUrl: '/api/transferencias' } as Request, output.res, next);
    assert.equal(output.status(), 409);
    const result = output.body() as { error: string; stack?: string };
    assert.equal(result.error, 'Conflicto concurrente. Intenta nuevamente.');
    assert.equal(result.stack, undefined);
    assert.doesNotMatch(JSON.stringify(result), /private_schema|secret_column|SQL UPDATE/);
  }
});
