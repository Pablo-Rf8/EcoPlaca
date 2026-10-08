import { RowDataPacket, ResultSetHeader } from 'mysql2';
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
