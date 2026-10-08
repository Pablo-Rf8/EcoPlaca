import { RowDataPacket, ResultSetHeader } from 'mysql2';
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
