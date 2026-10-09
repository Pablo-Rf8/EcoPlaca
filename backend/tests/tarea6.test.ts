import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Request, RequestHandler, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import pool from '../src/config/database';
import { crearCategoria, eliminarCategoria, obtenerCategoria, actualizarCategoria } from '../src/controllers/categorias.controller';
import { crearCentro, desactivarCentro } from '../src/controllers/centros.controller';
import { allowedOrigins, validateRuntimeEnvironment } from '../src/config/env';
import { migrate } from '../src/scripts/migrate';
import { seed } from '../src/scripts/seed';
import { calculateAvoidedCo2 } from '../src/utils/carbonCalculator.util';

const envKeys = ['NODE_ENV', 'CORS_ORIGINS', 'JWT_SECRET', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD',
  'SEED_ADMIN_NOMBRE', 'SEED_CENTRO_NOMBRE', 'SEED_CENTRO_DIRECCION', 'SEED_CENTRO_CIUDAD'];
const original = new Map(envKeys.map(key => [key, process.env[key]]));
afterEach((): void => {
  mock.restoreAll();
  for (const [key, value] of original) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function invoke(handler: RequestHandler, body: unknown = {}, id: string = '1'): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject): void => {
    let status: number = 200;
    const response = { locals: { rol: 'DONOR' },
      status(value: number): unknown { status = value; return response; },
      json(value: unknown): unknown { resolve({ status, body: value }); return response; }
    } as unknown as Response;
    handler({ body, params: { id } } as unknown as Request, response, reject);
  });
}
function connection(execute: (sql: string, args?: unknown[]) => Promise<unknown[]>): {
  conn: PoolConnection; state: { committed: boolean; rolledBack: boolean; released: boolean }
} {
  const state = { committed: false, rolledBack: false, released: false };
  const conn = { execute, query: execute, beginTransaction: async (): Promise<void> => {},
    commit: async (): Promise<void> => { state.committed = true; },
    rollback: async (): Promise<void> => { state.rolledBack = true; },
    release: (): void => { state.released = true; }, destroy: (): void => { state.released = true; }
  } as unknown as PoolConnection;
  mock.method(pool, 'getConnection', async () => conn);
  return { conn, state };
}
const category = { codigo: 'RAEE-TEST', nombre: 'Prueba', descripcion: null, factorCo2Kg: 40 };

test('category IDs and required fields are validated before querying', async () => {
  const query = mock.method(pool, 'execute', async (): Promise<never> => { throw new Error('Unexpected SQL'); });
  assert.equal((await invoke(obtenerCategoria, {}, 'abc')).status, 400);
  assert.equal((await invoke(crearCategoria, { ...category, factorCo2Kg: -1 })).status, 400);
  assert.equal(query.mock.callCount(), 0);
});
test('category not found returns 404', async () => {
  mock.method(pool, 'execute', async () => [[], []]);
  assert.equal((await invoke(obtenerCategoria)).status, 404);
});
test('duplicate category returns 409 and rolls back', async () => {
  const { state } = connection(async () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); });
  assert.equal((await invoke(crearCategoria, category)).status, 409);
  assert.equal(state.rolledBack, true); assert.equal(state.committed, false);
});
test('referenced category cannot be deleted', async () => {
  const { state } = connection(async () => [[{ id: 1 }], []]);
  assert.equal((await invoke(eliminarCategoria)).status, 409);
  assert.equal(state.rolledBack, true);
});
test('unreferenced category deletion commits', async () => {
  let deleted = false;
  const { state } = connection(async sql => {
    if (sql.includes('UNION ALL')) return [[], []];
    if (sql.startsWith('DELETE')) { deleted = true; return [{ affectedRows: 1 }, []]; }
    return [[{ id: 1 }], []];
  });
  assert.equal((await invoke(eliminarCategoria)).status, 200);
  assert.equal(deleted, true); assert.equal(state.committed, true);
});
test('category factor update recalculates device carbon inside the transaction', async () => {
  let updatedDevices = false;
  connection(async sql => {
    if (sql.includes('> 999999.99')) return [[], []];
    if (sql.startsWith('UPDATE dispositivos')) updatedDevices = true;
    return [[{ id: 1, ...category, createdAt: new Date() }], []];
  });
  assert.equal((await invoke(actualizarCategoria, category)).status, 200);
  assert.equal(updatedDevices, true);
  assert.equal(calculateAvoidedCo2(2, 'CAT-UNKNOWN', 40), 80);
});
test('invalid centre categories roll back all inserted centre data', async () => {
  const { state } = connection(async sql =>
    sql.startsWith('INSERT') ? [{ insertId: 7 }, []] : [[], []]);
  assert.equal((await invoke(crearCentro, {
    nombre: 'Centro', direccion: 'Zona 1', ciudad: 'Guatemala', capacidadKg: 100, categoriasIds: [999]
  })).status, 400);
  assert.equal(state.rolledBack, true); assert.equal(state.committed, false);
});
test('centre deactivation keeps its category relations', async () => {
  let deactivated = false;
  connection(async sql => {
    if (sql.includes('FROM ordenes_transferencia')) return [[], []];
    if (sql.startsWith('UPDATE')) { deactivated = true; return [{ affectedRows: 1 }, []]; }
    if (sql.includes('FROM centros_categorias')) return [[{ centroId: 1, categoriaId: 4 }], []];
    return [[{ id: 1, nombre: 'Centro', direccion: 'Zona 1', ciudad: 'Guatemala', telefono: null,
      capacidadKg: '100.00', activo: 0, createdAt: new Date() }], []];
  });
  const result = await invoke(desactivarCentro);
  const data = (result.body as { data: { activo: boolean; categoriasIds: number[] } }).data;
  assert.equal(result.status, 200); assert.equal(data.activo, false);
  assert.deepEqual(data.categoriasIds, [4]); assert.equal(deactivated, true);
});
test('production CORS requires explicit HTTPS origins and a sufficiently long JWT secret', () => {
  process.env.NODE_ENV = 'production'; delete process.env.CORS_ORIGINS;
  assert.throws(allowedOrigins, /CORS_ORIGINS/);
  process.env.CORS_ORIGINS = 'http://frontend.example.com';
  assert.throws(allowedOrigins, /HTTPS/);
  process.env.CORS_ORIGINS = 'https://frontend.example.com,https://admin.example.com';
  assert.deepEqual(allowedOrigins(), ['https://frontend.example.com', 'https://admin.example.com']);
  process.env.JWT_SECRET = 'short'; assert.throws(validateRuntimeEnvironment, /32/);
  process.env.JWT_SECRET = 'x'.repeat(32); assert.doesNotThrow(validateRuntimeEnvironment);
});
test('migration is safe to repeat and skips enum alterations already applied', async () => {
  const queries: string[] = [];
  connection(async (sql: string) => {
    queries.push(sql);
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }], []];
    if (sql.includes('information_schema')) return [[{ tipo: "enum('ENTREGADO','COMPLETADA')" }], []];
    return [[], []];
  });
  await migrate(); await migrate();
  assert.equal(queries.filter(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS')).length, 14);
  assert.equal(queries.some(sql => /DROP DATABASE|DROP TABLE|TRUNCATE|USE ecoplaca_db/i.test(sql)), false);
  assert.equal(queries.some(sql => sql.startsWith('ALTER TABLE')), false);
});
test('seed can repeat without adding duplicates or resetting existing credentials', async () => {
  for (const key of envKeys.filter(key => key.startsWith('SEED_'))) delete process.env[key];
  process.env.SEED_ADMIN_EMAIL = 'existing@example.com'; process.env.SEED_ADMIN_PASSWORD = 'NewPasswordOnlyForValidation!';
  const queries: string[] = [];
  connection(async (sql: string, args?: unknown[]) => {
    queries.push(sql);
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }], []];
    if (sql.includes('FROM roles')) return [[{ id: args?.[0], nombre: args?.[1] }], []];
    if (sql.includes('FROM usuarios')) return [[{ rol_id: 1 }], []];
    return [[{ id: 1 }], []];
  });
  await seed(); await seed();
  assert.equal(queries.some(sql => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
});

test('inventory cannot delete another donor device', async () => {
  const { eliminarDispositivo } = await import('../src/controllers/inventario.controller');
  let deleted = false;
  connection(async sql => {
    if (sql.startsWith('DELETE')) deleted = true;
    return [[{ id: 1, donante_id: 99, estado_disponibilidad: 'DISPONIBLE' }], []];
  });
  const handler: RequestHandler = (req, res, next) => {
    (req as Request & { usuario?: { id: number } }).usuario = { id: 5 };
    return eliminarDispositivo(req, res, next);
  };
  assert.equal((await invoke(handler)).status, 403); assert.equal(deleted, false);
});
test('inventory preserves devices with transfer history', async () => {
  const { eliminarDispositivo } = await import('../src/controllers/inventario.controller');
  let deleted = false;
  connection(async sql => {
    if (sql.startsWith('DELETE')) deleted = true;
    return [[{ id: 1, donante_id: 5, estado_disponibilidad: 'DISPONIBLE' }], []];
  });
  const handler: RequestHandler = (req, res, next) => {
    (req as Request & { usuario?: { id: number } }).usuario = { id: 5 };
    return eliminarDispositivo(req, res, next);
  };
  assert.equal((await invoke(handler)).status, 409); assert.equal(deleted, false);
});
