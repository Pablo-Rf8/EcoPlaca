import { RowDataPacket } from 'mysql2';
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
