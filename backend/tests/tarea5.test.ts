import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import pool from '../src/config/database';
import { AuthRequest } from '../src/middleware/auth.middleware';
import { crearDispositivo } from '../src/controllers/publicaciones.controller';
import { misOrdenes } from '../src/controllers/transferencias.controller';

afterEach((): void => mock.restoreAll());
function response(rol: string): { res: Response; status: () => number; body: () => unknown } {
  let code: number = 200; let body: unknown;
  const res = { locals: { rol }, status(value: number): unknown { code = value; return res; },
    json(value: unknown): unknown { body = value; return res; } } as unknown as Response;
  return { res, status: (): number => code, body: (): unknown => body };
}
function request(body: unknown = {}): AuthRequest {
  return { usuario: { id: 5, email: 'user@example.com', rolId: 2, nombre: 'Nuevo usuario' },
    body, query: { tecnicoId: 999 } } as unknown as AuthRequest;
}
const propagate = (error?: unknown): void => { if (error) throw error; };

test('mis-ordenes filters TECHNICIAN by JWT id and ignores supplied technician id', async () => {
  let sqlText: string = ''; let parameters: unknown[] = [];
  mock.method(pool, 'execute', async (sql: string, args: unknown[]) => {
    sqlText = sql; parameters = args; return [[], []];
  });
  await misOrdenes(request(), response('TECHNICIAN').res, propagate);
  assert.match(sqlText, /WHERE o.tecnico_id = \?/);
  assert.deepEqual(parameters, [5]);
});
test('ADMIN lists all orders without technician filter', async () => {
  let sqlText: string = ''; let parameters: unknown[] = [];
  mock.method(pool, 'execute', async (sql: string, args: unknown[]) => {
    sqlText = sql; parameters = args; return [[], []];
  });
  await misOrdenes(request(), response('ADMIN').res, propagate);
  assert.doesNotMatch(sqlText, /WHERE o.tecnico_id/);
  assert.deepEqual(parameters, []);
});
test('publication validates positive weight before acquiring a connection', async () => {
  let acquired = false;
  mock.method(pool, 'getConnection', async () => { acquired = true; throw new Error('Should not connect'); });
  const output = response('DONOR');
  await crearDispositivo(request({ titulo: 'CPU nuevo', categoriaId: 1, centroAcopioId: 1,
    estadoFuncional: 'OPERATIVO', pesoKg: 0 }), output.res, propagate);
  assert.equal(output.status(), 400); assert.equal(acquired, false);
});
test('publication assigns donor from JWT and commits a category-compatible device', async () => {
  let parameters: unknown[] = []; let committed = false; let released = false;
  const connection = {
    beginTransaction: async (): Promise<void> => {},
    execute: async (sql: string, args: unknown[]): Promise<unknown[]> => {
      if (sql.startsWith('SELECT id')) return [[{ id: 1, codigo: 'RAEE-MB', nombre: 'Placas' }], []];
      if (sql.includes('FROM centros_acopio')) return [[{ id: 1, nombre: 'Central' }], []];
      parameters = args; return [{ insertId: 100 }, []];
    },
    commit: async (): Promise<void> => { committed = true; },
    rollback: async (): Promise<void> => {},
    release: (): void => { released = true; }
  } as unknown as PoolConnection;
  mock.method(pool, 'getConnection', async () => connection);
  const output = response('DONOR');
  await crearDispositivo(request({ titulo: 'CPU nuevo', categoriaId: 1, centroAcopioId: 1,
    estadoFuncional: 'OPERATIVO', pesoKg: 1, donanteId: 999 }), output.res, propagate);
  assert.equal(output.status(), 201); assert.equal(parameters[3], 5);
  assert.equal(parameters[10], 35.5); assert.equal(committed, true); assert.equal(released, true);
});
test('incompatible centre rolls back publication and returns conflict', async () => {
  let rolledBack = false; let committed = false;
  const connection = {
    beginTransaction: async (): Promise<void> => {},
    execute: async (sql: string): Promise<unknown[]> =>
      sql.startsWith('SELECT id') ? [[{ id: 1, codigo: 'RAEE-MB', nombre: 'Placas' }], []] : [[], []],
    commit: async (): Promise<void> => { committed = true; },
    rollback: async (): Promise<void> => { rolledBack = true; },
    release: (): void => {}
  } as unknown as PoolConnection;
  mock.method(pool, 'getConnection', async () => connection);
  const output = response('DONOR');
  await crearDispositivo(request({ titulo: 'CPU nuevo', categoriaId: 1, centroAcopioId: 2,
    estadoFuncional: 'OPERATIVO', pesoKg: 1 }), output.res, propagate);
  assert.equal(output.status(), 409); assert.equal(rolledBack, true); assert.equal(committed, false);
});
