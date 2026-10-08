# EcoPlaca — Tarea 6 implementada

Archivos creados y modificados directamente en C:\EcoPlaca. Código completo y rutas exactas incluidos abajo.

## CRUDs y autorización

| Recurso | Lecturas | Creación/edición | Baja |
| --- | --- | --- | --- |
| Categorías | GET /api/categorias y /:id públicos | POST y PUT /:id, ADMIN | DELETE /:id, ADMIN; 409 si hay dispositivos o relaciones con centros |
| Centros | GET /api/centros y /:id públicos | POST y PUT /:id, ADMIN | PATCH /:id/desactivar, ADMIN; conserva historial y relaciones |
| Dispositivos | GET /api/dispositivos y /:id públicos | POST y PUT /:id, DONOR o ADMIN | DELETE /:id, DONOR propietario o ADMIN; solo DISPONIBLE y sin historial |

Se añadieron PUT y DELETE de dispositivos porque faltaban para completar el tercer CRUD de RF 08. En PUT/DELETE se verifica la propiedad o rol ADMIN, se bloquea el dispositivo durante la transacción y se conserva el historial de transferencias.

Las escrituras de categorías y centros requieren authenticateToken y authorizeRoles('ADMIN').
PUT es actualización completa. Campos de categoría: codigo, nombre, descripcion opcional, factorCo2Kg.
Campos de centro: nombre, direccion, ciudad, telefono opcional, capacidadKg, categoriasIds.
categoriasIds acepta una lista de IDs únicos, incluso vacía; las relaciones M:N se actualizan en la misma transacción.
No se permite retirar categorías de hardware DISPONIBLE/RESERVADO ubicado en el centro.
Errores tipados: 400 para validaciones, 404 si falta el registro y 409 para duplicados, vínculos o concurrencia.

El factor de CO₂ configurado en categorías se usa en publicaciones y dashboard. Al editarlo, se recalculan los valores de dispositivos relacionados en la misma transacción, verificando límites de DECIMAL.

## Producción

CORS usa CORS_ORIGINS, separado por comas, sin rutas ni barra final. Ejemplo de configuración:
CORS_ORIGINS=https://frontend.example.com,https://admin.example.com

En desarrollo, si no se define, permite http://localhost:4200. En producción exige orígenes HTTPS explícitos.
Permite Authorization y Content-Type para JWT. Ver [documentación oficial de CORS para Express](https://expressjs.com/en/resources/middleware/cors/).

Las credenciales DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME vienen del entorno; se quitaron las credenciales predeterminadas del pool.
JWT_SECRET es obligatorio y en producción requiere al menos 32 caracteres. No se cambió el archivo .env real.
El backend verifica conectividad antes de escuchar HTTP y cierra el servidor/pool ante SIGTERM o SIGINT.

Antes de desplegar:
1. Crear la base MySQL indicada por DB_NAME, con el usuario y permisos apropiados. El script no crea la base ni usuarios de MySQL.
2. Configurar las variables de backend/.env.example mediante el entorno del proveedor o un .env privado. Establecer NODE_ENV=production, CORS_ORIGINS y JWT_SECRET.
3. Configurar SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear un ADMIN si no existe. No hay contraseña predeterminada. Si existe, el seed conserva su contraseña; no promueve ni reactiva usuarios.
4. Opcionalmente configurar SEED_CENTRO_NOMBRE, SEED_CENTRO_DIRECCION y SEED_CENTRO_CIUDAD con datos reales. Sin los tres campos no crea un centro inicial.
5. Compilar antes de usar los scripts de producción.

Comandos desde backend/:
```sh
npm run build
npm run db:migrate
npm run db:seed
npm start
```

O, tras compilar, ejecutar:
```sh
npm run deploy
```

deploy ejecuta db:prepare (migración + seed) y solo arranca si termina correctamente.
Los scripts son TypeScript en src/scripts y se ejecutan compilados desde dist/scripts, por lo que no requieren ts-node en producción.
Empaquetar backend/dist, backend/package.json, sus dependencias de producción y DB/migrations conservando la estructura del monorrepositorio.
docker-compose.yml y DB/ecoplaca_DB.sql anteriores son recursos de desarrollo; deploy usa únicamente las migraciones nuevas y el seed TypeScript.

## Migraciones y seed

001_schema.sql contiene solo CREATE TABLE IF NOT EXISTS de las siete tablas InnoDB.
migrate.ts verifica los ENUM en information_schema antes de aplicar 002; si ENTREGADO/COMPLETADA ya existen, omite los ALTER.
002 usa la base configurada en DB_NAME, sin USE de un nombre fijo.
Migración y seed comparten un bloqueo GET_LOCK para evitar dos preparaciones simultáneas.
No hay DROP DATABASE, TRUNCATE, sobrescritura de contraseñas ni limpieza de datos en el despliegue.
El seed crea roles 1/2/3 y categorías faltantes por código; conserva las existentes. Rechaza IDs de roles que contradigan el contrato.
El centro opcional se crea solo si no existe con el mismo nombre/dirección/ciudad; un centro existente conserva sus categorías y estado.

Los DDL de MySQL hacen commits implícitos; por eso las migraciones usan operaciones repetibles y comprobación de estado, en lugar de prometer rollback conjunto del esquema. El seed sí usa una transacción de datos. Ver [documentación de MySQL](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html).

## Validación

- TypeScript backend con --noEmit y build a dist: aprobados.
- Pruebas backend Tareas 5 y 6: 18 aprobadas.
- Incluye validación, registros inexistentes, duplicados, eliminación con referencias, desactivación de centros, actualización de factores, CORS de producción, repetición de migración/seed, propiedad del dispositivo y conservación del historial.
- Pruebas con MySQL simulado. No se ejecutaron migraciones, seed ni CRUD contra una base real, ni se desplegó el proyecto.
- backend/api.http incluye lecturas, creación, edición, eliminación/desactivación y casos 401/403/404/409. El login de ADMIN debe usar la cuenta y contraseña reales configuradas para el seed, no las credenciales antiguas de demostración.

## Código completo

## backend/src/utils/crud.util.ts  ```typescript import { Request, RequestHandler, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { sendError } from './response.util';
export class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function crudHandler(action: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next): void => {
    action(req, res).catch((error: unknown): void => {
      if (error instanceof HttpError) { sendError(res, error.message, error.status); return; }
      const code: unknown = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
      if (code === 'ER_DUP_ENTRY') { sendError(res, 'El código o nombre ya está registrado', 409); return; }
      if (code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_NO_REFERENCED_ROW_2') {
        sendError(res, 'La operación entra en conflicto con datos relacionados', 409); return;
      }
      if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') {
        sendError(res, 'Conflicto concurrente. Intenta nuevamente.', 409); return;
      }
      next(error);
    });
  };
}
export async function inTransaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
  let connection: PoolConnection | undefined = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result: T = await action(connection);
    await connection.commit();
    return result;
  } catch (error: unknown) {
    try { await connection.rollback(); }
    catch { connection.destroy(); connection = undefined; }
    throw error;
  } finally { connection?.release(); }
}
export function parseId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError('ID inválido', 400);
  }
  return Number(value);
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError('Cuerpo JSON inválido', 400);
  return value as Record<string, unknown>;
}
export function text(body: Record<string, unknown>, key: string, max: number): string {
  const value: unknown = body[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpError(`${key} es obligatorio y admite hasta ${max} caracteres`, 400);
  }
  return value.trim();
}
export function optionalText(body: Record<string, unknown>, key: string, max: number): string | null {
  if (body[key] === undefined || body[key] === null || body[key] === '') return null;
  return text(body, key, max);
}
export function decimal(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max
      || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new HttpError(`${name} debe ser positivo, máximo ${max} y tener hasta 2 decimales`, 400);
  }
  return value;
}
 ``` 
## backend/src/models/categoria.model.ts  ```typescript export interface CategoriaRAEE {
  id: number; codigo: string; nombre: string; descripcion: string | null; factorCo2Kg: number; createdAt: Date;
}
export interface CategoriaDTO { codigo: string; nombre: string; descripcion: string | null; factorCo2Kg: number; }
 ``` 
## backend/src/models/centro.model.ts  ```typescript export interface CentroAcopio {
  id: number; nombre: string; direccion: string; ciudad: string; telefono: string | null;
  capacidadKg: number; activo: boolean; categoriasIds: number[]; createdAt: Date;
}
export interface CentroDTO {
  nombre: string; direccion: string; ciudad: string; telefono: string | null; capacidadKg: number; categoriasIds: number[];
}
 ``` 
## backend/src/controllers/categorias.controller.ts  ```typescript import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/database';
import { CategoriaDTO, CategoriaRAEE } from '../models/categoria.model';
import { HttpError, crudHandler, decimal, inTransaction, optionalText, parseId, record, text } from '../utils/crud.util';
import { sendSuccess } from '../utils/response.util';
interface CategoriaRow extends RowDataPacket {
  id: number; codigo: string; nombre: string; descripcion: string | null; factorCo2Kg: number | string; createdAt: Date;
}
const fields: string = 'id, codigo, nombre, descripcion, factor_co2_kg AS factorCo2Kg, created_at AS createdAt';
function categoria(row: CategoriaRow): CategoriaRAEE { return { ...row, factorCo2Kg: Number(row.factorCo2Kg) }; }
function dto(value: unknown): CategoriaDTO {
  const body = record(value);
  const codigo: string = text(body, 'codigo', 20).toUpperCase();
  if (!/^RAEE-[A-Z0-9-]+$/.test(codigo)) throw new HttpError('codigo debe comenzar por RAEE- y usar letras, números o guiones', 400);
  return { codigo, nombre: text(body, 'nombre', 100), descripcion: optionalText(body, 'descripcion', 5000),
    factorCo2Kg: decimal(body['factorCo2Kg'], 'factorCo2Kg', 999999.99) };
}
export const listarCategorias = crudHandler(async (_req, res): Promise<void> => {
  const [rows] = await pool.execute<CategoriaRow[]>(`SELECT ${fields} FROM categorias_raee ORDER BY nombre`);
  sendSuccess(res, rows.map(categoria));
});
export const obtenerCategoria = crudHandler(async (req, res): Promise<void> => {
  const [rows] = await pool.execute<CategoriaRow[]>(`SELECT ${fields} FROM categorias_raee WHERE id = ?`, [parseId(req.params.id)]);
  if (!rows[0]) throw new HttpError('Categoría no encontrada', 404);
  sendSuccess(res, categoria(rows[0]));
});
export const crearCategoria = crudHandler(async (req, res): Promise<void> => {
  const body = dto(req.body);
  const result: CategoriaRAEE = await inTransaction(async connection => {
    const [insert] = await connection.execute<ResultSetHeader>(
      'INSERT INTO categorias_raee (codigo, nombre, descripcion, factor_co2_kg) VALUES (?, ?, ?, ?)',
      [body.codigo, body.nombre, body.descripcion, body.factorCo2Kg]);
    const [rows] = await connection.execute<CategoriaRow[]>(`SELECT ${fields} FROM categorias_raee WHERE id = ?`, [insert.insertId]);
    return categoria(rows[0]);
  });
  sendSuccess(res, result, 'Categoría creada', 201);
});
export const actualizarCategoria = crudHandler(async (req, res): Promise<void> => {
  const id: number = parseId(req.params.id); const body = dto(req.body);
  const result = await inTransaction(async connection => {
    const [current] = await connection.execute<CategoriaRow[]>('SELECT id FROM categorias_raee WHERE id = ? FOR UPDATE', [id]);
    if (!current[0]) throw new HttpError('Categoría no encontrada', 404);
    await connection.execute('UPDATE categorias_raee SET codigo = ?, nombre = ?, descripcion = ?, factor_co2_kg = ? WHERE id = ?',
      [body.codigo, body.nombre, body.descripcion, body.factorCo2Kg, id]);
    const [overflow] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM dispositivos WHERE categoria_id = ? AND ROUND(peso_kg * ?, 2) > 999999.99 LIMIT 1', [id, body.factorCo2Kg]);
    if (overflow.length) throw new HttpError('El factor excede el impacto máximo de un dispositivo vinculado', 400);
    await connection.execute('UPDATE dispositivos SET co2_evitado_kg = ROUND(peso_kg * ?, 2) WHERE categoria_id = ?', [body.factorCo2Kg, id]);
    const [rows] = await connection.execute<CategoriaRow[]>(`SELECT ${fields} FROM categorias_raee WHERE id = ?`, [id]);
    return categoria(rows[0]);
  });
  sendSuccess(res, result, 'Categoría actualizada');
});
export const eliminarCategoria = crudHandler(async (req, res): Promise<void> => {
  const id: number = parseId(req.params.id);
  await inTransaction(async connection => {
    const [current] = await connection.execute<RowDataPacket[]>('SELECT id FROM categorias_raee WHERE id = ? FOR UPDATE', [id]);
    if (!current[0]) throw new HttpError('Categoría no encontrada', 404);
    const [references] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM dispositivos WHERE categoria_id = ? UNION ALL SELECT centro_id AS id FROM centros_categorias WHERE categoria_id = ?',
      [id, id]);
    if (references.length) throw new HttpError('La categoría está vinculada a dispositivos o centros; no se puede eliminar', 409);
    await connection.execute('DELETE FROM categorias_raee WHERE id = ?', [id]);
  });
  sendSuccess(res, { id }, 'Categoría eliminada');
});
 ``` 
## backend/src/controllers/centros.controller.ts  ```typescript import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { CentroAcopio, CentroDTO } from '../models/centro.model';
import { HttpError, crudHandler, decimal, inTransaction, optionalText, parseId, record, text } from '../utils/crud.util';
import { sendSuccess } from '../utils/response.util';
interface CentroRow extends RowDataPacket {
  id: number; nombre: string; direccion: string; ciudad: string; telefono: string | null;
  capacidadKg: number | string; activo: number | boolean; createdAt: Date;
}
interface RelationRow extends RowDataPacket { centroId: number; categoriaId: number; }
const fields: string = 'id, nombre, direccion, ciudad, telefono, capacidad_kg AS capacidadKg, activo, created_at AS createdAt';
function dto(value: unknown): CentroDTO {
  const body = record(value); const ids: unknown = body['categoriasIds'];
  if (!Array.isArray(ids) || ids.length > 100 || !ids.every((id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
      || new Set(ids).size !== ids.length) throw new HttpError('categoriasIds debe ser una lista de IDs positivos únicos (máximo 100)', 400);
  return { nombre: text(body, 'nombre', 150), direccion: text(body, 'direccion', 255),
    ciudad: text(body, 'ciudad', 100), telefono: optionalText(body, 'telefono', 30),
    capacidadKg: decimal(body['capacidadKg'], 'capacidadKg', 99999999.99), categoriasIds: ids };
}
async function read(connection: PoolConnection, id?: number): Promise<CentroAcopio[]> {
  const [centers] = await connection.execute<CentroRow[]>(
    `SELECT ${fields} FROM centros_acopio ${id === undefined ? '' : 'WHERE id = ?'} ORDER BY nombre`, id === undefined ? [] : [id]);
  const [relations] = await connection.execute<RelationRow[]>(
    `SELECT centro_id AS centroId, categoria_id AS categoriaId FROM centros_categorias ${id === undefined ? '' : 'WHERE centro_id = ?'} ORDER BY categoria_id`,
    id === undefined ? [] : [id]);
  return centers.map((row: CentroRow): CentroAcopio => ({ ...row, capacidadKg: Number(row.capacidadKg),
    activo: Boolean(row.activo), categoriasIds: relations.filter(r => r.centroId === row.id).map(r => r.categoriaId) }));
}
async function writeCategories(connection: PoolConnection, id: number, ids: number[]): Promise<void> {
  if (ids.length) {
    const [categories] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM categorias_raee WHERE id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`, ids);
    if (categories.length !== ids.length) throw new HttpError('Una o más categorías no existen', 400);
  }
  const [devices] = await connection.execute<RowDataPacket[]>(
    `SELECT id FROM dispositivos WHERE centro_acopio_id = ? AND estado_disponibilidad IN ('DISPONIBLE','RESERVADO')
     ${ids.length ? 'AND categoria_id NOT IN (' + ids.map(() => '?').join(',') + ')' : ''} LIMIT 1`, [id, ...ids]);
  if (devices.length) throw new HttpError('No puedes retirar categorías de dispositivos disponibles o reservados en este centro', 409);
  await connection.execute('DELETE FROM centros_categorias WHERE centro_id = ?', [id]);
  for (const categoryId of ids) {
    await connection.execute('INSERT INTO centros_categorias (centro_id, categoria_id) VALUES (?, ?)', [id, categoryId]);
  }
}
export const listarCentros = crudHandler(async (_req, res): Promise<void> => {
  sendSuccess(res, await inTransaction(connection => read(connection)));
});
export const obtenerCentro = crudHandler(async (req, res): Promise<void> => {
  const id: number = parseId(req.params.id);
  const centers = await inTransaction(connection => read(connection, id));
  if (!centers[0]) throw new HttpError('Centro no encontrado', 404);
  sendSuccess(res, centers[0]);
});
export const crearCentro = crudHandler(async (req, res): Promise<void> => {
  const body = dto(req.body);
  const result = await inTransaction(async connection => {
    const [insert] = await connection.execute<ResultSetHeader>(
      'INSERT INTO centros_acopio (nombre, direccion, ciudad, telefono, capacidad_kg, activo) VALUES (?, ?, ?, ?, ?, TRUE)',
      [body.nombre, body.direccion, body.ciudad, body.telefono, body.capacidadKg]);
    await writeCategories(connection, insert.insertId, body.categoriasIds);
    return (await read(connection, insert.insertId))[0];
  });
  sendSuccess(res, result, 'Centro creado', 201);
});
export const actualizarCentro = crudHandler(async (req, res): Promise<void> => {
  const id: number = parseId(req.params.id); const body = dto(req.body);
  const result = await inTransaction(async connection => {
    const [centers] = await connection.execute<RowDataPacket[]>('SELECT id FROM centros_acopio WHERE id = ? FOR UPDATE', [id]);
    if (!centers[0]) throw new HttpError('Centro no encontrado', 404);
    await writeCategories(connection, id, body.categoriasIds);
    await connection.execute('UPDATE centros_acopio SET nombre = ?, direccion = ?, ciudad = ?, telefono = ?, capacidad_kg = ? WHERE id = ?',
      [body.nombre, body.direccion, body.ciudad, body.telefono, body.capacidadKg, id]);
    return (await read(connection, id))[0];
  });
  sendSuccess(res, result, 'Centro actualizado');
});
export const desactivarCentro = crudHandler(async (req, res): Promise<void> => {
  const id: number = parseId(req.params.id);
  const result = await inTransaction(async connection => {
    const [centers] = await connection.execute<RowDataPacket[]>('SELECT id FROM centros_acopio WHERE id = ? FOR UPDATE', [id]);
    if (!centers[0]) throw new HttpError('Centro no encontrado', 404);
    await connection.execute('UPDATE centros_acopio SET activo = FALSE WHERE id = ?', [id]);
    return (await read(connection, id))[0];
  });
  sendSuccess(res, result, 'Centro desactivado');
});
 ``` 
## backend/src/routes/categorias.routes.ts  ```typescript import { Router } from 'express';
import { listarCategorias, obtenerCategoria, crearCategoria, actualizarCategoria, eliminarCategoria } from '../controllers/categorias.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';
const router: Router = Router();
router.get('/', listarCategorias);
router.get('/:id', obtenerCategoria);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), crearCategoria);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), actualizarCategoria);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), eliminarCategoria);
export default router;
 ``` 
## backend/src/routes/centros.routes.ts  ```typescript import { Router } from 'express';
import { listarCentros, obtenerCentro, crearCentro, actualizarCentro, desactivarCentro } from '../controllers/centros.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';
const router: Router = Router();
router.get('/', listarCentros);
router.get('/:id', obtenerCentro);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), crearCentro);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), actualizarCentro);
router.patch('/:id/desactivar', authenticateToken, authorizeRoles('ADMIN'), desactivarCentro);
export default router;
 ``` 
## backend/src/config/env.ts  ```typescript import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
export function requiredEnv(key: string): string {
  const value: string | undefined = process.env[key];
  if (!value?.trim()) throw new Error(`Falta la variable de entorno ${key}`);
  return value;
}
export function allowedOrigins(): string[] {
  const configured: string | undefined = process.env.CORS_ORIGINS;
  if (!configured?.trim()) {
    if (process.env.NODE_ENV === 'production') throw new Error('CORS_ORIGINS es obligatorio en producción');
    return ['http://localhost:4200'];
  }
  const origins: string[] = configured.split(',').map(value => value.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password
        || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      throw new Error('CORS_ORIGINS debe contener orígenes completos sin rutas; en producción usa HTTPS');
    }
  }
  return origins;
}
export function validateRuntimeEnvironment(): void {
  const secret = requiredEnv('JWT_SECRET');
  if (process.env.NODE_ENV === 'production' && secret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  allowedOrigins();
}
 ``` 
## backend/src/config/database.ts  ```typescript import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { requiredEnv } from './env';
const port: number = Number(process.env.DB_PORT ?? '3306');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT inválido');
export const databaseOptions: PoolOptions = {
  host: requiredEnv('DB_HOST'), port, user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'), database: requiredEnv('DB_NAME'),
  charset: 'utf8mb4', waitForConnections: true, connectionLimit: 10, queueLimit: 0
};
export const pool: Pool = mysql.createPool(databaseOptions);
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    try { await connection.ping(); } finally { connection.release(); }
    return true;
  } catch (error: unknown) {
    console.error('No se pudo conectar a MySQL:', error instanceof Error ? error.message : 'Error desconocido');
    return false;
  }
}
export default pool;
 ``` 
## backend/src/app.ts  ```typescript import express, { Application } from 'express';
import cors from 'cors';
import { allowedOrigins } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import indexRoutes from './routes/index.routes';
const app: Application = express();
const origins: string[] = allowedOrigins();
app.use(cors({
  origin(origin, callback): void {
    if (!origin || origins.includes(origin)) callback(null, true);
    else callback(Object.assign(new Error('Origen no permitido por CORS'), { status: 403 }));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, maxAge: 600
}));
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use('/api', indexRoutes);
app.use((req, res): void => {
  res.status(404).json({ success: false, error: `Ruta no encontrada: [${req.method}] ${req.originalUrl}` });
});
app.use(errorHandler);
export default app;
 ``` 
## backend/src/server.ts  ```typescript import app from './app';
import pool, { testConnection } from './config/database';
import { validateRuntimeEnvironment } from './config/env';
async function start(): Promise<void> {
  validateRuntimeEnvironment();
  const port: number = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido');
  if (!await testConnection()) throw new Error('MySQL no está disponible; se canceló el inicio');
  const server = app.listen(port, (): void => console.log(`EcoPlaca API escuchando en puerto ${port}`));
  server.on('error', (error: Error): void => {
    console.error('Error al iniciar HTTP:', error.message); void pool.end(); process.exitCode = 1;
  });
  const shutdown = (): void => {
    const timer = setTimeout((): never => process.exit(1), 10000); timer.unref();
    server.close((): void => {
      void pool.end().then((): void => { clearTimeout(timer); process.exitCode = 0; })
        .catch((): void => { clearTimeout(timer); process.exitCode = 1; });
    });
  };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
start().catch((error: unknown): void => {
  console.error('No se pudo iniciar EcoPlaca:', error instanceof Error ? error.message : 'Error desconocido');
  void pool.end(); process.exitCode = 1;
});
 ``` 
## backend/src/scripts/database-lock.ts  ```typescript import { createHash } from 'node:crypto';
import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { requiredEnv } from '../config/env';
export async function withDatabaseLock<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
  let connection: PoolConnection | undefined = await pool.getConnection();
  const name: string = 'ecoplaca:' + createHash('sha256').update(requiredEnv('DB_NAME')).digest('hex').slice(0, 40);
  let acquired: boolean = false;
  try {
    const [rows] = await connection.execute<(RowDataPacket & { acquired: number | null })[]>(
      'SELECT GET_LOCK(?, 30) AS acquired', [name]);
    if (rows[0]?.acquired !== 1) throw new Error('No se pudo adquirir el bloqueo de preparación de base de datos');
    acquired = true;
    return await action(connection);
  } finally {
    if (acquired) {
      try { await connection.execute('SELECT RELEASE_LOCK(?)', [name]); }
      catch { connection.destroy(); connection = undefined; }
    }
    connection?.release();
  }
}
 ``` 
## backend/src/scripts/migrate.ts  ```typescript import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { withDatabaseLock } from './database-lock';
// Las siete tablas se crean si faltan. No ejecuta ecoplaca_DB.sql ni DROP DATABASE.
export async function migrate(): Promise<void> {
  const directory: string = path.resolve(__dirname, '../../../DB/migrations');
  const schema: string = await readFile(path.join(directory, '001_schema.sql'), 'utf8');
  const upgrades: string = await readFile(path.join(directory, '002_transferencias_dashboard.sql'), 'utf8');
  await withDatabaseLock(async connection => {
    const statements: string[] = schema.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    if (statements.length !== 7 || statements.some(s => !/^CREATE TABLE IF NOT EXISTS /i.test(s))) {
      throw new Error('001_schema.sql debe contener únicamente las siete tablas con CREATE TABLE IF NOT EXISTS');
    }
    for (const statement of statements) await connection.query(statement);
    const alterations: string[] = upgrades.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    const expected = [
      { table: 'dispositivos', column: 'estado_disponibilidad', state: 'ENTREGADO' },
      { table: 'ordenes_transferencia', column: 'estado', state: 'COMPLETADA' }
    ];
    if (alterations.length !== expected.length) throw new Error('Migración de estados inesperada');
    for (const [index, target] of expected.entries()) {
      if (!alterations[index].startsWith('ALTER TABLE ' + target.table + ' MODIFY ' + target.column)) {
        throw new Error('Sentencia de migración inesperada');
      }
      const [rows] = await connection.execute<(RowDataPacket & { tipo: string })[]>(
        'SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [target.table, target.column]);
      if (!rows[0]) throw new Error('Falta la columna ' + target.table + '.' + target.column);
      if (!rows[0].tipo.includes("'" + target.state + "'")) await connection.query(alterations[index]);
    }
  });
  console.log('Migraciones verificadas; los datos existentes se conservaron.');
}
if (require.main === module) {
  migrate().catch((error: unknown): void => {
    console.error('Falló la migración:', error instanceof Error ? error.message : 'Error desconocido'); process.exitCode = 1;
  }).finally(async (): Promise<void> => { await pool.end(); });
}
 ``` 
## backend/src/scripts/seed.ts  ```typescript import bcrypt from 'bcryptjs';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/database';
import { withDatabaseLock } from './database-lock';
const categories: ReadonlyArray<{ codigo: string; nombre: string; factor: number }> = [
  { codigo: 'RAEE-MB', nombre: 'Tarjetas Madre y Circuitos PCB', factor: 35.5 },
  { codigo: 'RAEE-PSU', nombre: 'Fuentes de Poder', factor: 18.2 },
  { codigo: 'RAEE-RAM', nombre: 'Módulos de Memoria RAM', factor: 65 },
  { codigo: 'RAEE-STO', nombre: 'Almacenamiento HDD y SSD', factor: 42 },
  { codigo: 'RAEE-GPU', nombre: 'Tarjetas Gráficas', factor: 55.8 },
  { codigo: 'RAEE-CPU', nombre: 'Microprocesadores', factor: 80 },
  { codigo: 'RAEE-DISP', nombre: 'Pantallas y Monitores', factor: 22.4 }
];
export async function seed(): Promise<void> {
  const email: string | undefined = process.env.SEED_ADMIN_EMAIL?.trim();
  const password: string | undefined = process.env.SEED_ADMIN_PASSWORD;
  const adminName: string = process.env.SEED_ADMIN_NOMBRE?.trim() || 'Administrador EcoPlaca';
  if ((email || password) && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150
      || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || adminName.length > 150)) {
    throw new Error('Configura SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD de 12 caracteres mínimo y 72 bytes máximo');
  }
  const centerName = process.env.SEED_CENTRO_NOMBRE?.trim();
  const address = process.env.SEED_CENTRO_DIRECCION?.trim();
  const city = process.env.SEED_CENTRO_CIUDAD?.trim();
  if ((centerName || address || city) && (!centerName || !address || !city || centerName.length > 150
      || address.length > 255 || city.length > 100)) throw new Error('Completa los tres datos SEED_CENTRO con longitudes válidas');
  await withDatabaseLock(async connection => {
    await connection.beginTransaction();
    try {
      for (const [index, name] of ['ADMIN', 'DONOR', 'TECHNICIAN'].entries()) {
        const id: number = index + 1;
        const [rows] = await connection.execute<(RowDataPacket & { id: number; nombre: string })[]>(
          'SELECT id, nombre FROM roles WHERE id = ? OR nombre = ? FOR UPDATE', [id, name]);
        if (rows.length && (rows.length !== 1 || rows[0].id !== id || rows[0].nombre !== name)) {
          throw new Error('Los IDs de roles existentes no corresponden al contrato 1/2/3. No se modificaron.');
        }
        if (!rows.length) await connection.execute('INSERT INTO roles (id, nombre) VALUES (?, ?)', [id, name]);
      }
      for (const category of categories) {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM categorias_raee WHERE codigo = ? FOR UPDATE', [category.codigo]);
        if (!rows.length) await connection.execute(
          'INSERT INTO categorias_raee (codigo, nombre, factor_co2_kg) VALUES (?, ?, ?)',
          [category.codigo, category.nombre, category.factor]);
      }
      if (email && password) {
        const [users] = await connection.execute<(RowDataPacket & { rol_id: number })[]>(
          'SELECT rol_id FROM usuarios WHERE email = ? FOR UPDATE', [email]);
        if (users[0] && users[0].rol_id !== 1) throw new Error('SEED_ADMIN_EMAIL pertenece a una cuenta sin rol ADMIN');
        if (!users.length) {
          const hash: string = await bcrypt.hash(password, 12);
          await connection.execute('INSERT INTO usuarios (rol_id, nombre_completo, email, password_hash) VALUES (1, ?, ?, ?)',
            [adminName, email, hash]);
        }
      }
      if (centerName && address && city) {
        const [centers] = await connection.execute<(RowDataPacket & { id: number })[]>(
          'SELECT id FROM centros_acopio WHERE nombre = ? AND direccion = ? AND ciudad = ? FOR UPDATE', [centerName, address, city]);
        if (!centers.length) {
          const [insert] = await connection.execute<ResultSetHeader>(
            'INSERT INTO centros_acopio (nombre, direccion, ciudad) VALUES (?, ?, ?)', [centerName, address, city]);
          for (const category of categories) {
            await connection.execute(
              'INSERT INTO centros_categorias (centro_id, categoria_id) SELECT ?, id FROM categorias_raee WHERE codigo = ?',
              [insert.insertId, category.codigo]);
          }
        }
      }
      await connection.commit();
    } catch (error: unknown) {
      try { await connection.rollback(); } catch { connection.destroy(); }
      throw error;
    }
  });
  console.log('Seed completado. No se sobrescribieron usuarios ni datos existentes.');
}
if (require.main === module) {
  seed().catch((error: unknown): void => {
    console.error('Falló el seed:', error instanceof Error ? error.message : 'Error desconocido'); process.exitCode = 1;
  }).finally(async (): Promise<void> => { await pool.end(); });
}
 ``` 
## backend/.env.example  ```dotenv PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3308
DB_USER=
DB_PASSWORD=
DB_NAME=ecoplaca_db
JWT_SECRET=
JWT_EXPIRES_IN=7d
# Orígenes separados por coma, sin / final. Producción requiere HTTPS.
CORS_ORIGINS=http://localhost:4200
# Bootstrap ADMIN opcional, sin contraseñas predeterminadas; solo crea si no existe.
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NOMBRE=Administrador EcoPlaca
# Centro inicial opcional: completa los tres campos o deja todos vacíos.
SEED_CENTRO_NOMBRE=
SEED_CENTRO_DIRECCION=
SEED_CENTRO_CIUDAD=
 ``` 
## backend/src/routes/index.routes.ts  ```typescript import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import dispositivosRoutes from './dispositivos.routes';
import transferenciasRoutes from './transferencias.routes';
import dashboardRoutes from './dashboard.routes';
import categoriasRoutes from './categorias.routes';
import centrosRoutes from './centros.routes';

const router = Router();

// Endpoint de salud
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', app: 'EcoPlaca API' });
});

// Enrutadores de módulos
router.use('/auth', authRoutes);
router.use('/dispositivos', dispositivosRoutes);
router.use('/transferencias', transferenciasRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/categorias', categoriasRoutes);
router.use('/centros', centrosRoutes);

export default router;
 ``` 
## backend/src/utils/carbonCalculator.util.ts  ```typescript /**
 * Factores de emisión aproximados (kg CO2eq por kg de material/componente recuperado)
 * Basados en análisis de ciclo de vida (LCA) de hardware y directivas RAEE
 */
export const CATEGORY_CARBON_FACTORS: Record<string, number> = {
  'CAT-MB': 35.5,   // Placas Madre / Motherboards (metales pesados, sustratos PCB complejos)
  'CAT-PSU': 18.2,  // Fuentes de Poder (cobre, transformadores, disipadores de aluminio)
  'CAT-RAM': 65.0,  // Memorias RAM (alta densidad de semiconductores de silicio y oro)
  'CAT-STO': 42.0,  // Discos duros y SSDs
  'CAT-GPU': 55.8,  // Tarjetas Gráficas (chips de alta potencia, cobre y silicio)
  'CAT-CPU': 80.0,  // Procesadores (proceso de fabricación intensivo en carbono)
  'CAT-DISP': 22.4, // Pantallas / Monitores
  'DEFAULT': 25.0   // Factor promedio para componentes mixtos
};

/**
 * Calcula la huella de carbono estimada evitada al reutilizar o reacondicionar una pieza
 * @param weightKg Peso físico del componente en kilogramos
 * @param categoryCode Código de la categoría RAEE
 * @returns kg de CO2 equivalente evitados (redondeado a 2 decimales)
 */
export function calculateAvoidedCo2(weightKg: number, categoryCode: string = 'DEFAULT', factorOverride?: number): number {
  if (weightKg <= 0) return 0;
  const factor: number = factorOverride ?? CATEGORY_CARBON_FACTORS[categoryCode] ?? CATEGORY_CARBON_FACTORS['DEFAULT'];
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('Factor de CO2 inválido');
  const co2Avoided = weightKg * factor;
  return Math.round(co2Avoided * 100) / 100;
}

/**
 * Calcula métricas equivalentes tangibles para comprensión ciudadana y reportes ambientales
 */
export function calculateTangibleEquivalents(totalCo2AvoidedKg: number, totalWeightDivertedKg: number) {
  return {
    co2AvoidedKg: Math.round(totalCo2AvoidedKg * 100) / 100,
    divertedWeightKg: Math.round(totalWeightDivertedKg * 100) / 100,
    treesEquivalent: Math.round((totalCo2AvoidedKg / 21.77) * 10) / 10, // Árboles absorbiendo CO2 durante 1 año (~21.77 kg/año)
    carKmEquivalent: Math.round(totalCo2AvoidedKg * 4.16), // Km de automóvil de combustión estándar evitados (~0.24 kg CO2/km)
    smartphoneCharges: Math.round(totalCo2AvoidedKg * 121.6), // Cargas completas de smartphones evitadas
  };
}
 ``` 
## backend/src/controllers/publicaciones.controller.ts  ```typescript import { randomUUID } from 'node:crypto';
import { NextFunction, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateDispositivoDTO, Dispositivo, EstadoFuncional } from '../models/dispositivo.model';
import { calculateAvoidedCo2 } from '../utils/carbonCalculator.util';
import { sendError, sendSuccess } from '../utils/response.util';

interface CategoriaRow extends RowDataPacket { id: number; codigo: string; nombre: string; factor_co2_kg?: string | number; }
interface CentroRow extends RowDataPacket { id: number; nombre: string; ciudad: string; categoriaId: number; }
function idValido(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function textoOpcional(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === 'string' && value.trim().length <= max);
}

export async function opcionesPublicacion(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const [categorias] = await pool.execute<CategoriaRow[]>(
      'SELECT id, codigo, nombre FROM categorias_raee ORDER BY nombre');
    const [centros] = await pool.execute<CentroRow[]>(
      `SELECT c.id, c.nombre, c.ciudad, cc.categoria_id AS categoriaId
       FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.activo = TRUE ORDER BY c.nombre, cc.categoria_id`);
    sendSuccess(res, { categorias, centros });
  } catch (error: unknown) { next(error); }
}

export async function crearDispositivo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.usuario) { sendError(res, 'Autenticación requerida', 401); return; }
  const body: Partial<CreateDispositivoDTO> | null = req.body;
  const estados: EstadoFuncional[] = ['OPERATIVO', 'REPARABLE', 'DESGUACE_RECICLAJE'];
  if (!body || typeof body.titulo !== 'string' || body.titulo.trim().length < 3 || body.titulo.trim().length > 150
      || !idValido(body.categoriaId) || !idValido(body.centroAcopioId)
      || typeof body.pesoKg !== 'number' || !Number.isFinite(body.pesoKg) || body.pesoKg <= 0 || body.pesoKg > 9999.99
      || Math.abs(body.pesoKg * 100 - Math.round(body.pesoKg * 100)) > 0.000001
      || !body.estadoFuncional || !estados.includes(body.estadoFuncional)
      || !textoOpcional(body.marca, 100) || !textoOpcional(body.modelo, 100)
      || !textoOpcional(body.numeroSerie, 100) || !textoOpcional(body.notas, 5000)
      || (body.especificaciones !== undefined && (typeof body.especificaciones !== 'object'
        || body.especificaciones === null || Array.isArray(body.especificaciones)))) {
    sendError(res, 'Datos inválidos: título de 3 a 150 caracteres, categoría, centro, condición y peso positivo con hasta 2 decimales', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  let transaction: boolean = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction(); transaction = true;
    const [categories] = await connection.execute<CategoriaRow[]>(
      'SELECT id, codigo, nombre, factor_co2_kg FROM categorias_raee WHERE id = ? FOR UPDATE', [body.categoriaId]);
    if (!categories[0]) {
      await connection.rollback(); transaction = false;
      sendError(res, 'Categoría no encontrada', 404); return;
    }
    const [centers] = await connection.execute<CentroRow[]>(
      `SELECT c.id, c.nombre FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.id = ? AND c.activo = TRUE AND cc.categoria_id = ? FOR UPDATE`,
      [body.centroAcopioId, body.categoriaId]);
    if (!centers[0]) {
      await connection.rollback(); transaction = false;
      sendError(res, 'El centro debe estar activo y admitir la categoría seleccionada', 409); return;
    }
    const codigo: string = `RAEE-${new Date().getUTCFullYear()}-${randomUUID()}`;
    const factor = categories[0].factor_co2_kg;
    const co2: number = calculateAvoidedCo2(body.pesoKg, categories[0].codigo.replace(/^RAEE-/, 'CAT-'),
      factor === undefined ? undefined : Number(factor));
    if (co2 > 999999.99) {
      await connection.rollback(); transaction = false;
      sendError(res, 'El impacto calculado supera el límite de almacenamiento del dispositivo', 400); return;
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO dispositivos (codigo_trazabilidad, titulo, categoria_id, donante_id,
       centro_acopio_id, marca, modelo, numero_serie, estado_funcional, estado_disponibilidad,
       peso_kg, co2_evitado_kg, especificaciones, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPONIBLE', ?, ?, ?, ?)`,
      [codigo, body.titulo.trim(), body.categoriaId, req.usuario.id, body.centroAcopioId,
       body.marca?.trim() || null, body.modelo?.trim() || null, body.numeroSerie?.trim() || null,
       body.estadoFuncional, body.pesoKg, co2, body.especificaciones ? JSON.stringify(body.especificaciones) : null,
       body.notas?.trim() || null]);
    await connection.commit(); transaction = false;
    const device: Dispositivo = {
      id: result.insertId, codigoTrazabilidad: codigo, titulo: body.titulo.trim(),
      categoriaId: body.categoriaId, categoriaNombre: categories[0].nombre, donanteId: req.usuario.id,
      centroAcopioId: body.centroAcopioId, centroAcopioNombre: centers[0].nombre,
      marca: body.marca?.trim(), modelo: body.modelo?.trim(), numeroSerie: body.numeroSerie?.trim(),
      estadoFuncional: body.estadoFuncional, estadoDisponibilidad: 'DISPONIBLE',
      pesoKg: body.pesoKg, co2EvitadoKg: co2, notas: body.notas?.trim(),
      especificaciones: body.especificaciones, createdAt: new Date()
    };
    sendSuccess(res, device, 'Hardware publicado correctamente', 201);
  } catch (error: unknown) {
    if (connection && transaction) {
      try { await connection.rollback(); } catch { connection.destroy(); connection = undefined; }
    }
    next(error);
  } finally { connection?.release(); }
}
 ``` 
## backend/src/controllers/dashboard.controller.ts  ```typescript import { NextFunction, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { EstadoTransferencia } from '../models/transferencia.model';
import { calculateAvoidedCo2 } from '../utils/carbonCalculator.util';
import { sendSuccess } from '../utils/response.util';

interface MetricaRow extends RowDataPacket {
  tipo: 'RAEE' | 'TRANSFERENCIA';
  clave: string;
  valor: string | number;
  factorCo2: string | number | null;
}

export async function getMetricas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Una sola sentencia obtiene métricas coherentes sin multiplicar pesos por órdenes.
    const [rows] = await pool.execute<MetricaRow[]>(
      `SELECT 'RAEE' AS tipo, c.codigo AS clave, SUM(d.peso_kg) AS valor, c.factor_co2_kg AS factorCo2
       FROM dispositivos d JOIN categorias_raee c ON c.id = d.categoria_id
       WHERE d.estado_disponibilidad IN ('ENTREGADO', 'RECICLADO') GROUP BY c.id, c.codigo, c.factor_co2_kg
       UNION ALL
       SELECT 'TRANSFERENCIA' AS tipo, estado AS clave, COUNT(*) AS valor, NULL AS factorCo2
       FROM ordenes_transferencia GROUP BY estado`
    );
    let totalKgRecuperados: number = 0;
    let co2EvitadoKg: number = 0;
    const transferenciasPorEstado: Record<EstadoTransferencia, number> = {
      PENDIENTE: 0, EN_TRANSITO: 0, RECIBIDO: 0, CANCELADO: 0, COMPLETADA: 0
    };
    for (const row of rows) {
      const value: number = Number(row.valor);
      if (row.tipo === 'RAEE') {
        totalKgRecuperados += value;
        co2EvitadoKg += calculateAvoidedCo2(value, row.clave.replace(/^RAEE-/, 'CAT-'), row.factorCo2 === null ? undefined : Number(row.factorCo2));
      } else if (Object.prototype.hasOwnProperty.call(transferenciasPorEstado, row.clave)) {
        transferenciasPorEstado[row.clave as EstadoTransferencia] = value;
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, { totalKgRecuperados: Math.round(totalKgRecuperados * 100) / 100,
      co2EvitadoKg: Math.round(co2EvitadoKg * 100) / 100, transferenciasPorEstado });
  } catch (error: unknown) {
    next(error);
  }
}
 ``` 
## backend/src/utils/dispositivo-validation.util.ts  ```typescript import { CreateDispositivoDTO, EstadoFuncional } from '../models/dispositivo.model';
import { HttpError, decimal, optionalText, record, text } from './crud.util';
export interface ValidatedDispositivoDTO extends CreateDispositivoDTO { centroAcopioId: number; estadoFuncional: EstadoFuncional; }
export function validarDispositivoDTO(value: unknown): ValidatedDispositivoDTO {
  const body = record(value);
  const title: string = text(body, 'titulo', 150);
  if (title.length < 3) throw new HttpError('titulo debe tener al menos 3 caracteres', 400);
  const category: unknown = body['categoriaId']; const center: unknown = body['centroAcopioId'];
  if (typeof category !== 'number' || !Number.isSafeInteger(category) || category <= 0
      || typeof center !== 'number' || !Number.isSafeInteger(center) || center <= 0) {
    throw new HttpError('categoriaId y centroAcopioId deben ser IDs positivos', 400);
  }
  const state: unknown = body['estadoFuncional'];
  if (typeof state !== 'string' || !['OPERATIVO', 'REPARABLE', 'DESGUACE_RECICLAJE'].includes(state)) {
    throw new HttpError('estadoFuncional inválido', 400);
  }
  return { titulo: title, categoriaId: category, centroAcopioId: center,
    estadoFuncional: state as EstadoFuncional, pesoKg: decimal(body['pesoKg'], 'pesoKg', 9999.99),
    marca: optionalText(body, 'marca', 100) ?? undefined, modelo: optionalText(body, 'modelo', 100) ?? undefined,
    numeroSerie: optionalText(body, 'numeroSerie', 100) ?? undefined, notas: optionalText(body, 'notas', 5000) ?? undefined,
    especificaciones: body['especificaciones'] === undefined ? undefined : record(body['especificaciones']) };
}
 ``` 
## backend/src/controllers/inventario.controller.ts  ```typescript import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { AuthRequest } from '../middleware/auth.middleware';
import { Dispositivo, EstadoDisponibilidad } from '../models/dispositivo.model';
import { HttpError, crudHandler, inTransaction, parseId } from '../utils/crud.util';
import { validarDispositivoDTO } from '../utils/dispositivo-validation.util';
import { calculateAvoidedCo2 } from '../utils/carbonCalculator.util';
import { sendSuccess } from '../utils/response.util';
interface DeviceRow extends RowDataPacket { id: number; donante_id: number; estado_disponibilidad: EstadoDisponibilidad; }
interface CategoryRow extends RowDataPacket { codigo: string; factor_co2_kg: number | string; }
interface ViewRow extends RowDataPacket, Omit<Dispositivo, 'pesoKg' | 'co2EvitadoKg'> { pesoKg: number | string; co2EvitadoKg: number | string; }
async function editable(connection: PoolConnection, id: number, userId: number, admin: boolean): Promise<void> {
  const [rows] = await connection.execute<DeviceRow[]>(
    'SELECT id, donante_id, estado_disponibilidad FROM dispositivos WHERE id = ? FOR UPDATE', [id]);
  if (!rows[0]) throw new HttpError('Dispositivo no encontrado', 404);
  if (!admin && rows[0].donante_id !== userId) throw new HttpError('Solo el donante propietario o ADMIN puede editar este dispositivo', 403);
  const [orders] = await connection.execute<RowDataPacket[]>(
    'SELECT id FROM ordenes_transferencia WHERE dispositivo_id = ? LIMIT 1 FOR UPDATE', [id]);
  if (rows[0].estado_disponibilidad !== 'DISPONIBLE' || orders.length) {
    throw new HttpError('Solo se puede editar o eliminar hardware disponible sin historial de transferencias', 409);
  }
}
export const actualizarDispositivo = crudHandler(async (req, res): Promise<void> => {
  const user = (req as AuthRequest).usuario;
  if (!user) throw new HttpError('Autenticación requerida', 401);
  const id: number = parseId(req.params.id); const body = validarDispositivoDTO(req.body);
  const result: Dispositivo = await inTransaction(async connection => {
    await editable(connection, id, user.id, res.locals.rol === 'ADMIN');
    const [categories] = await connection.execute<CategoryRow[]>(
      'SELECT codigo, factor_co2_kg FROM categorias_raee WHERE id = ? FOR UPDATE', [body.categoriaId]);
    if (!categories[0]) throw new HttpError('Categoría no encontrada', 404);
    const [centers] = await connection.execute<RowDataPacket[]>(
      `SELECT c.id FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.id = ? AND c.activo = TRUE AND cc.categoria_id = ? FOR UPDATE`, [body.centroAcopioId, body.categoriaId]);
    if (!centers[0]) throw new HttpError('El centro debe estar activo y admitir la categoría', 409);
    const carbon: number = calculateAvoidedCo2(body.pesoKg, categories[0].codigo, Number(categories[0].factor_co2_kg));
    if (carbon > 999999.99) throw new HttpError('El impacto calculado supera el límite de almacenamiento', 400);
    await connection.execute(
      `UPDATE dispositivos SET titulo = ?, categoria_id = ?, centro_acopio_id = ?, marca = ?, modelo = ?,
       numero_serie = ?, estado_funcional = ?, peso_kg = ?, co2_evitado_kg = ?, especificaciones = ?, notas = ? WHERE id = ?`,
      [body.titulo, body.categoriaId, body.centroAcopioId, body.marca ?? null, body.modelo ?? null,
       body.numeroSerie ?? null, body.estadoFuncional, body.pesoKg, carbon,
       body.especificaciones ? JSON.stringify(body.especificaciones) : null, body.notas ?? null, id]);
    const [rows] = await connection.execute<ViewRow[]>(
      `SELECT id, codigo_trazabilidad AS codigoTrazabilidad, titulo, categoria_id AS categoriaId,
       donante_id AS donanteId, centro_acopio_id AS centroAcopioId, marca, modelo, numero_serie AS numeroSerie,
       estado_funcional AS estadoFuncional, estado_disponibilidad AS estadoDisponibilidad,
       peso_kg AS pesoKg, co2_evitado_kg AS co2EvitadoKg, especificaciones, notas, created_at AS createdAt,
       updated_at AS updatedAt FROM dispositivos WHERE id = ?`, [id]);
    return { ...rows[0], pesoKg: Number(rows[0].pesoKg), co2EvitadoKg: Number(rows[0].co2EvitadoKg) };
  });
  sendSuccess(res, result, 'Dispositivo actualizado');
});
export const eliminarDispositivo = crudHandler(async (req, res): Promise<void> => {
  const user = (req as AuthRequest).usuario;
  if (!user) throw new HttpError('Autenticación requerida', 401);
  const id: number = parseId(req.params.id);
  await inTransaction(async connection => {
    await editable(connection, id, user.id, res.locals.rol === 'ADMIN');
    await connection.execute('DELETE FROM dispositivos WHERE id = ?', [id]);
  });
  sendSuccess(res, { id }, 'Dispositivo eliminado');
});
 ``` 
## backend/tests/tarea6.test.ts  ```typescript import { test, afterEach, mock } from 'node:test';
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
 ``` 
## backend/src/routes/dispositivos.routes.ts  ```typescript import { Router } from 'express';
import { actualizarDispositivo, eliminarDispositivo } from '../controllers/inventario.controller';
import { dispositivosController } from '../controllers/dispositivos.controller';
import { crearDispositivo, opcionesPublicacion } from '../controllers/publicaciones.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';
const router: Router = Router();
router.get('/', dispositivosController.getDispositivos);
router.get('/opciones-publicacion', authenticateToken, authorizeRoles('DONOR', 'ADMIN'), opcionesPublicacion);
router.get('/:id', dispositivosController.getDispositivoById);
router.post('/', authenticateToken, authorizeRoles('DONOR', 'ADMIN'), crearDispositivo);
router.patch('/:id/estado', authenticateToken, authorizeRoles('ADMIN'), dispositivosController.updateEstado);
router.put('/:id', authenticateToken, authorizeRoles('DONOR', 'ADMIN'), actualizarDispositivo);
router.delete('/:id', authenticateToken, authorizeRoles('DONOR', 'ADMIN'), eliminarDispositivo);
export default router;
 ``` 
## backend/package.json  ```json {
    "name":  "ecoplaca-backend",
    "version":  "1.0.0",
    "description":  "Backend API para EcoPlaca - Gestión circular y trazabilidad de RAEE",
    "main":  "dist/server.js",
    "scripts":  {
                    "dev":  "ts-node-dev --respawn --transpile-only src/server.ts",
                    "build":  "rimraf dist \u0026\u0026 tsc",
                    "start":  "node dist/server.js",
                    "db:migrate":  "node dist/scripts/migrate.js",
                    "db:seed":  "node dist/scripts/seed.js",
                    "db:prepare":  "npm run db:migrate \u0026\u0026 npm run db:seed",
                    "deploy":  "npm run db:prepare \u0026\u0026 npm start"
                },
    "keywords":  [
                     "ecoplaca",
                     "raee",
                     "circular-economy",
                     "express",
                     "typescript",
                     "mysql"
                 ],
    "author":  "EcoPlaca Team",
    "license":  "MIT",
    "dependencies":  {
                         "bcryptjs":  "^2.4.3",
                         "cors":  "^2.8.5",
                         "dotenv":  "^16.4.7",
                         "express":  "^4.21.2",
                         "jsonwebtoken":  "^9.0.2",
                         "mysql2":  "^3.12.0"
                     },
    "devDependencies":  {
                            "@types/bcryptjs":  "^2.4.6",
                            "@types/cors":  "^2.8.17",
                            "@types/express":  "^5.0.0",
                            "@types/jsonwebtoken":  "^9.0.9",
                            "@types/node":  "^22.13.4",
                            "rimraf":  "^6.0.1",
                            "ts-node-dev":  "^2.0.0",
                            "typescript":  "^5.7.3"
                        }
} ``` 
## backend/api.http  ```http @baseUrl = http://localhost:3000/api
@contentType = application/json
@dispositivoTransferenciaId = 2

### 1. Health Check (Verificación de estado)
GET {{baseUrl}}/health
Accept: {{contentType}}

### 2. Autenticación - Login de Administrador
# @name loginAdmin
POST {{baseUrl}}/auth/login
Content-Type: {{contentType}}

{
  "email": "admin@ecoplaca.org",
  "password": "ecoplaca2026"
}

### Guardar token JWT recibido
@authToken = {{loginAdmin.response.body.data.token}}

### 3. Autenticación - Registro de nuevo usuario
POST {{baseUrl}}/auth/register
Content-Type: {{contentType}}

{
  "nombreCompleto": "Mario Taller de Reparación",
  "email": "mario.taller@ejemplo.com",
  "password": "ecoplaca2026",
  "rolId": 3,
  "telefono": "+52 33 9988 1122",
  "direccion": "Av. Vallarta 1500, Guadalajara"
}

### 4. Consultar Perfil con Token
GET {{baseUrl}}/auth/perfil
Authorization: Bearer {{authToken}}
Accept: {{contentType}}

### 5. Listar todos los dispositivos catalogados
GET {{baseUrl}}/dispositivos
Accept: {{contentType}}

### 6. Filtrar dispositivos disponibles y en estado funcional reparable
GET {{baseUrl}}/dispositivos?estado=DISPONIBLE&estadoFuncional=REPARABLE
Accept: {{contentType}}

### 7. Buscar dispositivos por texto libre
GET {{baseUrl}}/dispositivos?busqueda=Ryzen
Accept: {{contentType}}

### 8. Obtener detalle de un dispositivo por ID
GET {{baseUrl}}/dispositivos/1
Accept: {{contentType}}

### 9. Catalogar un nuevo dispositivo RAEE
POST {{baseUrl}}/dispositivos
Content-Type: {{contentType}}

{
  "titulo": "Placa Madre Gigabyte B550 AORUS Elite AX V2",
  "categoriaId": 1,
  "donanteId": 2,
  "centroAcopioId": 1,
  "marca": "Gigabyte",
  "modelo": "B550 AORUS Elite AX V2",
  "numeroSerie": "SN-GB550-99812",
  "estadoFuncional": "REPARABLE",
  "pesoKg": 1.10,
  "especificaciones": {
    "socket": "AM4",
    "chipset": "AMD B550",
    "formato": "ATX"
  },
  "notas": "Donada con BIOS corrupta. Requiere reprogramación de chip SPI Flash."
}

### 10. Actualizar estado de un dispositivo
PATCH {{baseUrl}}/dispositivos/1/estado
Authorization: Bearer {{authToken}}
Content-Type: {{contentType}}

{
  "estadoDisponibilidad": "RESERVADO",
  "estadoFuncional": "REPARABLE",
  "notas": "Apartado para taller de estudiantes de bachillerato técnico."
}

### 11. Login del técnico responsable
# @name loginTecnico
POST {{baseUrl}}/auth/login
Content-Type: {{contentType}}

{
  "email": "laura.tecnico@ecoplaca.org",
  "password": "ecoplaca2026"
}

@tecnicoToken = {{loginTecnico.response.body.data.token}}

### 12. Métricas antes de la entrega (200)
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoToken}}

### 13. Solicitar transferencia (201, dispositivo RESERVADO)
# Usar un dispositivo DISPONIBLE sin órdenes activas; el dispositivo seed 2 cumple.
# @name solicitarTransferencia
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "centroDestinoId": 2,
  "motivo": "Recuperación para taller de reparación"
}

@transferenciaId = {{solicitarTransferencia.response.body.data.id}}

### 14. Reservar nuevamente el mismo dispositivo (409)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "centroDestinoId": 2,
  "motivo": "Segunda solicitud que debe rechazarse"
}

### 15. Confirmar entrega física (200, COMPLETADA y ENTREGADO)
PATCH {{baseUrl}}/transferencias/{{transferenciaId}}/completar
Authorization: Bearer {{tecnicoToken}}

### 16. Repetir confirmación (409, métricas sin duplicación)
PATCH {{baseUrl}}/transferencias/{{transferenciaId}}/completar
Authorization: Bearer {{tecnicoToken}}

### 17. Métricas después de la entrega (200)
# Con el dispositivo seed 2: incremento de 1.60 kg y 29.12 kg CO2.
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoToken}}

### 18. Solicitud inválida (400)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": -1,
  "motivo": ""
}

### 19. Dashboard sin JWT (401)
GET {{baseUrl}}/dashboard/metricas

### 20. Administrador solicita como técnico (403)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{authToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "motivo": "Solicitud con rol no autorizado"
}

### TAREA 5 - Ciclo completo con usuarios y hardware nuevos
# Ejecutar en este orden. Cambia los IDs de categoría/centro según opciones-publicacion.
### Registro de donante nuevo
# @name registroDonanteT5
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "nombreCompleto": "Donante Evaluacion Tarea 5",
  "email": "donante.t5.{{$timestamp}}@example.com",
  "password": "EcoPlacaDemo2026!",
  "rolId": 2
}

### Login del donante recién creado
# @name loginDonanteT5
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{registroDonanteT5.response.body.data.email}}",
  "password": "EcoPlacaDemo2026!"
}

@donanteT5Token = {{loginDonanteT5.response.body.data.token}}

### Categorías y centros reales
GET {{baseUrl}}/dispositivos/opciones-publicacion
Authorization: Bearer {{donanteT5Token}}

### Publicar hardware nuevo (201)
# @name publicarHardwareT5
POST {{baseUrl}}/dispositivos
Authorization: Bearer {{donanteT5Token}}
Content-Type: application/json

{
  "titulo": "Placa madre nueva para evaluación",
  "categoriaId": 1,
  "centroAcopioId": 1,
  "marca": "ASUS",
  "modelo": "Placa de evaluación",
  "numeroSerie": "T5-{{$timestamp}}",
  "estadoFuncional": "REPARABLE",
  "pesoKg": 1.25,
  "notas": "Hardware publicado durante el recorrido completo."
}

@hardwareT5Id = {{publicarHardwareT5.response.body.data.id}}

### Registro de técnico nuevo
# @name registroTecnicoT5
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "nombreCompleto": "Tecnico Evaluacion Tarea 5",
  "email": "tecnico.t5.{{$timestamp}}@example.com",
  "password": "EcoPlacaDemo2026!",
  "rolId": 3
}

### Login del técnico recién creado
# @name loginTecnicoT5
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{registroTecnicoT5.response.body.data.email}}",
  "password": "EcoPlacaDemo2026!"
}

@tecnicoT5Token = {{loginTecnicoT5.response.body.data.token}}

### Métricas antes de entrega
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoT5Token}}

### Reserva del hardware nuevo
# @name reservaT5
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoT5Token}}
Content-Type: application/json

{
  "dispositivoId": {{hardwareT5Id}},
  "motivo": "Reparación durante la evaluación de principio a fin"
}

@ordenT5Id = {{reservaT5.response.body.data.id}}

### Mis órdenes del técnico
GET {{baseUrl}}/transferencias/mis-ordenes
Authorization: Bearer {{tecnicoT5Token}}

### Confirmar recepción física solo después de recibir el hardware (200)
PATCH {{baseUrl}}/transferencias/{{ordenT5Id}}/completar
Authorization: Bearer {{tecnicoT5Token}}

### Verificar hardware ENTREGADO
GET {{baseUrl}}/dispositivos/{{hardwareT5Id}}

### Verificar orden COMPLETADA
GET {{baseUrl}}/transferencias/mis-ordenes
Authorization: Bearer {{tecnicoT5Token}}

### Métricas tras entrega (incremento esperado: 1.25 kg y 44.38 kg CO2 con RAEE-MB)
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoT5Token}}

### Repetir entrega (409, no duplica impacto)
PATCH {{baseUrl}}/transferencias/{{ordenT5Id}}/completar
Authorization: Bearer {{tecnicoT5Token}}

### Donante intenta listar órdenes (403)
GET {{baseUrl}}/transferencias/mis-ordenes
Authorization: Bearer {{donanteT5Token}}

### Publicación sin JWT (401)
POST {{baseUrl}}/dispositivos
Content-Type: application/json

{ "titulo": "Publicación sin sesión" }

### TAREA 6 - CRUD categorías y centros (usar token de ADMIN configurado en seed)
# Las lecturas son públicas. Para escrituras, ejecutar loginAdmin con el email/password reales del ADMIN creado.
### Listar categorías
GET {{baseUrl}}/categorias

### Obtener categoría
GET {{baseUrl}}/categorias/1

### Crear categoría nueva
# @name crearCategoriaT6
POST {{baseUrl}}/categorias
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "codigo": "RAEE-T6",
  "nombre": "Hardware de evaluación T6",
  "descripcion": "Categoría CRUD de evaluación",
  "factorCo2Kg": 30.5
}

@categoriaT6Id = {{crearCategoriaT6.response.body.data.id}}

### Actualizar categoría
PUT {{baseUrl}}/categorias/{{categoriaT6Id}}
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "codigo": "RAEE-T6",
  "nombre": "Hardware de evaluación actualizado",
  "descripcion": "Actualización completa",
  "factorCo2Kg": 32.0
}

### Listar centros
GET {{baseUrl}}/centros

### Crear centro con relación M:N
# @name crearCentroT6
POST {{baseUrl}}/centros
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "nombre": "Centro de evaluación T6",
  "direccion": "Zona 1",
  "ciudad": "Guatemala",
  "telefono": "+502 5555 0000",
  "capacidadKg": 500.0,
  "categoriasIds": [{{categoriaT6Id}}]
}

@centroT6Id = {{crearCentroT6.response.body.data.id}}

### Obtener centro creado con categorías
GET {{baseUrl}}/centros/{{centroT6Id}}

### Borrar categoría vinculada (409)
DELETE {{baseUrl}}/categorias/{{categoriaT6Id}}
Authorization: Bearer {{authToken}}

### Editar centro y desvincular categoría sin dispositivos pendientes
PUT {{baseUrl}}/centros/{{centroT6Id}}
Authorization: Bearer {{authToken}}
Content-Type: application/json

{
  "nombre": "Centro de evaluación actualizado",
  "direccion": "Zona 2",
  "ciudad": "Guatemala",
  "telefono": null,
  "capacidadKg": 600.0,
  "categoriasIds": []
}

### Desactivar centro (200, conserva datos y relaciones)
PATCH {{baseUrl}}/centros/{{centroT6Id}}/desactivar
Authorization: Bearer {{authToken}}

### Borrar categoría ahora sin vínculos (200)
DELETE {{baseUrl}}/categorias/{{categoriaT6Id}}
Authorization: Bearer {{authToken}}

### Verificar categoría eliminada (404)
GET {{baseUrl}}/categorias/{{categoriaT6Id}}

### Crear categoría sin token (401)
POST {{baseUrl}}/categorias
Content-Type: application/json

{ "codigo": "RAEE-NOAUTH", "nombre": "Sin sesión", "factorCo2Kg": 25 }

### Donante intenta crear categoría (403, usa token Tarea 5)
POST {{baseUrl}}/categorias
Authorization: Bearer {{donanteT5Token}}
Content-Type: application/json

{ "codigo": "RAEE-NOROL", "nombre": "Sin permiso", "factorCo2Kg": 25 }

### CRUD 3: editar hardware disponible sin historial
# Usar un dispositivo nuevo, antes de reservarlo; el hardware de Tarea 5 ya entregado debe devolver 409.
PUT {{baseUrl}}/dispositivos/{{hardwareT5Id}}
Authorization: Bearer {{donanteT5Token}}
Content-Type: application/json

{
  "titulo": "Placa madre actualizada",
  "categoriaId": 1,
  "centroAcopioId": 1,
  "estadoFuncional": "REPARABLE",
  "pesoKg": 1.25,
  "notas": "Edición completa"
}

### Retirar hardware (solo disponible sin historial; entregado devuelve 409)
DELETE {{baseUrl}}/dispositivos/{{hardwareT5Id}}
Authorization: Bearer {{donanteT5Token}}
 ``` 
## DB/migrations/001_schema.sql  ```sql CREATE TABLE IF NOT EXISTS `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(50) NOT NULL UNIQUE,
    `descripcion` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `rol_id` INT NOT NULL,
    `nombre_completo` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `direccion` VARCHAR(255) NULL,
    `activo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_usuarios_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `categorias_raee` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `codigo` VARCHAR(20) NOT NULL UNIQUE,
    `nombre` VARCHAR(100) NOT NULL UNIQUE,
    `descripcion` TEXT NULL,
    `factor_co2_kg` DECIMAL(8, 2) NOT NULL DEFAULT 25.00 COMMENT 'kg CO2eq ahorrados por cada kg reutilizado',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `centros_acopio` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nombre` VARCHAR(150) NOT NULL,
    `direccion` VARCHAR(255) NOT NULL,
    `ciudad` VARCHAR(100) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `capacidad_kg` DECIMAL(10, 2) NOT NULL DEFAULT 5000.00,
    `activo` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `centros_categorias` (
    `centro_id` INT NOT NULL,
    `categoria_id` INT NOT NULL,
    PRIMARY KEY (`centro_id`, `categoria_id`),
    CONSTRAINT `fk_cc_centro` FOREIGN KEY (`centro_id`) REFERENCES `centros_acopio` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cc_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias_raee` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `dispositivos` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `codigo_trazabilidad` VARCHAR(50) NOT NULL UNIQUE,
    `titulo` VARCHAR(200) NOT NULL,
    `categoria_id` INT NOT NULL,
    `donante_id` INT NOT NULL,
    `centro_acopio_id` INT NULL,
    `marca` VARCHAR(100) NULL,
    `modelo` VARCHAR(100) NULL,
    `numero_serie` VARCHAR(100) NULL,
    `estado_funcional` ENUM('OPERATIVO', 'REPARABLE', 'DESGUACE_RECICLAJE') NOT NULL DEFAULT 'REPARABLE',
    `estado_disponibilidad` ENUM('DISPONIBLE', 'RESERVADO', 'ASIGNADO', 'RECICLADO', 'ENTREGADO') NOT NULL DEFAULT 'DISPONIBLE',
    `peso_kg` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    `co2_evitado_kg` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `especificaciones` JSON NULL,
    `notas` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_dispositivos_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias_raee` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_dispositivos_donante` FOREIGN KEY (`donante_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_dispositivos_centro` FOREIGN KEY (`centro_acopio_id`) REFERENCES `centros_acopio` (`id`) ON DELETE SET NULL,
    INDEX `idx_busqueda_estado` (`estado_disponibilidad`, `estado_funcional`),
    INDEX `idx_categoria` (`categoria_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `ordenes_transferencia` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `dispositivo_id` INT NOT NULL,
    `tecnico_id` INT NOT NULL,
    `centro_origen_id` INT NOT NULL,
    `centro_destino_id` INT NULL,
    `estado` ENUM('PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO', 'COMPLETADA') NOT NULL DEFAULT 'PENDIENTE',
    `motivo` VARCHAR(255) NOT NULL,
    `fecha_solicitud` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `fecha_completado` TIMESTAMP NULL,
    CONSTRAINT `fk_ot_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `dispositivos` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ot_tecnico` FOREIGN KEY (`tecnico_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ot_origen` FOREIGN KEY (`centro_origen_id`) REFERENCES `centros_acopio` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ot_destino` FOREIGN KEY (`centro_destino_id`) REFERENCES `centros_acopio` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB; ``` 
## DB/migrations/002_transferencias_dashboard.sql  ```sql -- Ejecutar una vez sobre una base existente; conserva los datos y estados históricos.
-- Usa la base configurada en DB_NAME, sin cambiar de esquema.
ALTER TABLE dispositivos MODIFY estado_disponibilidad
  ENUM('DISPONIBLE', 'RESERVADO', 'ASIGNADO', 'RECICLADO', 'ENTREGADO')
  NOT NULL DEFAULT 'DISPONIBLE';
ALTER TABLE ordenes_transferencia MODIFY estado
  ENUM('PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO', 'COMPLETADA')
  NOT NULL DEFAULT 'PENDIENTE';
 ``` 