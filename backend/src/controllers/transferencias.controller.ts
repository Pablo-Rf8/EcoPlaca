import { NextFunction, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { EstadoTransferencia, SolicitarTransferenciaDTO } from '../models/transferencia.model';
import { EstadoDisponibilidad } from '../models/dispositivo.model';
import { sendError, sendSuccess } from '../utils/response.util';

interface DispositivoRow extends RowDataPacket {
  id: number;
  categoria_id: number;
  centro_acopio_id: number | null;
  estado_disponibilidad: EstadoDisponibilidad;
}

interface OrdenRow extends RowDataPacket {
  id: number;
  dispositivo_id: number;
  tecnico_id: number;
  centro_destino_id: number | null;
  estado: EstadoTransferencia;
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function rollback(connection: PoolConnection | undefined): Promise<void> {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (error: unknown) {
    // Una conexión que no permite rollback no debe volver al pool.
    console.error('Error al revertir transferencia', error);
    connection.destroy();
  }
}

export async function solicitarTransferencia(
  req: AuthRequest, res: Response, next: NextFunction
): Promise<void> {
  if (!req.usuario) {
    sendError(res, 'Autenticación requerida', 401);
    return;
  }
  const body: Partial<SolicitarTransferenciaDTO> | null = req.body;
  if (!body || !positiveId(body.dispositivoId) || typeof body.motivo !== 'string'
      || !body.motivo.trim() || body.motivo.trim().length > 255
      || (body.centroDestinoId != null && !positiveId(body.centroDestinoId))) {
    sendError(res, 'Se requieren dispositivoId positivo, motivo de 1 a 255 caracteres y centroDestinoId válido', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [devices] = await connection.execute<DispositivoRow[]>(
      'SELECT id, categoria_id, centro_acopio_id, estado_disponibilidad FROM dispositivos WHERE id = ? FOR UPDATE',
      [body.dispositivoId]
    );
    const device: DispositivoRow | undefined = devices[0];
    if (!device) {
      await rollback(connection);
      sendError(res, 'Dispositivo no encontrado', 404);
      return;
    }
    const [activeOrders] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM ordenes_transferencia WHERE dispositivo_id = ?
       AND estado IN ('PENDIENTE', 'EN_TRANSITO') FOR UPDATE`, [device.id]
    );
    if (device.estado_disponibilidad !== 'DISPONIBLE' || activeOrders.length > 0) {
      await rollback(connection);
      sendError(res, 'El dispositivo no está disponible o ya tiene una transferencia activa', 409);
      return;
    }
    if (device.centro_acopio_id === null) {
      await rollback(connection);
      sendError(res, 'El dispositivo necesita un centro de origen', 409);
      return;
    }
    const destination: number | null = body.centroDestinoId ?? null;
    const [centers] = await connection.execute<RowDataPacket[]>(
      `SELECT c.id FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.id IN (?, ?) AND c.activo = TRUE AND cc.categoria_id = ? FOR UPDATE`,
      [device.centro_acopio_id, destination, device.categoria_id]
    );
    const requiredCenters: number = destination !== null && destination !== device.centro_acopio_id ? 2 : 1;
    if (centers.length !== requiredCenters) {
      await rollback(connection);
      sendError(res, 'Los centros deben estar activos y admitir la categoría del dispositivo', 409);
      return;
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ordenes_transferencia
       (dispositivo_id, tecnico_id, centro_origen_id, centro_destino_id, estado, motivo)
       VALUES (?, ?, ?, ?, 'PENDIENTE', ?)`,
      [device.id, req.usuario.id, device.centro_acopio_id, destination, body.motivo.trim()]
    );
    await connection.execute<ResultSetHeader>(
      "UPDATE dispositivos SET estado_disponibilidad = 'RESERVADO' WHERE id = ?", [device.id]
    );
    await connection.commit();
    sendSuccess(res, { id: result.insertId, dispositivoId: device.id, tecnicoId: req.usuario.id,
      centroOrigenId: device.centro_acopio_id, centroDestinoId: destination,
      motivo: body.motivo.trim(), estado: 'PENDIENTE', estadoDisponibilidad: 'RESERVADO' },
    'Transferencia solicitada', 201);
  } catch (error: unknown) {
    await rollback(connection);
    next(error);
  } finally {
    connection?.release();
  }
}

export async function completarTransferencia(
  req: AuthRequest, res: Response, next: NextFunction
): Promise<void> {
  if (!req.usuario) {
    sendError(res, 'Autenticación requerida', 401);
    return;
  }
  const rawId: string = String(req.params.id);
  const id: number = Number(rawId);
  if (!/^\d+$/.test(rawId) || !positiveId(id)) {
    sendError(res, 'ID de transferencia inválido', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // Obtener el ID primero permite bloquear siempre dispositivo antes que orden.
    const [references] = await connection.execute<OrdenRow[]>(
      'SELECT dispositivo_id FROM ordenes_transferencia WHERE id = ?', [id]
    );
    if (!references[0]) {
      await rollback(connection);
      sendError(res, 'Transferencia no encontrada', 404);
      return;
    }
    const [devices] = await connection.execute<DispositivoRow[]>(
      'SELECT id, estado_disponibilidad FROM dispositivos WHERE id = ? FOR UPDATE',
      [references[0].dispositivo_id]
    );
    const [orders] = await connection.execute<OrdenRow[]>(
      'SELECT id, dispositivo_id, tecnico_id, centro_destino_id, estado FROM ordenes_transferencia WHERE id = ? FOR UPDATE', [id]
    );
    const order: OrdenRow | undefined = orders[0];
    if (!order) {
      await rollback(connection);
      sendError(res, 'Transferencia no encontrada', 404);
      return;
    }
    if (res.locals.rol !== 'ADMIN' && order.tecnico_id !== req.usuario.id) {
      await rollback(connection);
      sendError(res, 'Solo el técnico responsable o un administrador puede confirmar la entrega', 403);
      return;
    }
    if (!['PENDIENTE', 'EN_TRANSITO'].includes(order.estado)
        || devices[0]?.estado_disponibilidad !== 'RESERVADO'
        || devices[0]?.id !== order.dispositivo_id) {
      await rollback(connection);
      sendError(res, 'La orden y el dispositivo no permiten confirmar la entrega', 409);
      return;
    }
    await connection.execute<ResultSetHeader>(
      "UPDATE ordenes_transferencia SET estado = 'COMPLETADA', fecha_completado = CURRENT_TIMESTAMP WHERE id = ?", [id]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE dispositivos SET estado_disponibilidad = 'ENTREGADO',
       centro_acopio_id = COALESCE(?, centro_acopio_id) WHERE id = ?`,
      [order.centro_destino_id, order.dispositivo_id]
    );
    await connection.commit();
    sendSuccess(res, { id, dispositivoId: order.dispositivo_id,
      estado: 'COMPLETADA', estadoDisponibilidad: 'ENTREGADO' }, 'Entrega física confirmada');
  } catch (error: unknown) {
    await rollback(connection);
    next(error);
  } finally {
    connection?.release();
  }
}

interface OrdenListadoRow extends RowDataPacket {
  id: number; dispositivoId: number; tecnicoId: number; tecnicoNombre: string;
  centroOrigenId: number; centroOrigenNombre: string; centroDestinoId: number | null;
  centroDestinoNombre: string | null; estado: EstadoTransferencia; motivo: string;
  fechaSolicitud: Date; fechaCompletado: Date | null; dispositivoTitulo: string;
  codigoTrazabilidad: string; estadoDisponibilidad: EstadoDisponibilidad; pesoKg: string | number;
}
export async function misOrdenes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.usuario) { sendError(res, 'Autenticación requerida', 401); return; }
  try {
    const admin: boolean = res.locals.rol === 'ADMIN';
    const [rows] = await pool.execute<OrdenListadoRow[]>(
      `SELECT o.id, o.dispositivo_id AS dispositivoId, o.tecnico_id AS tecnicoId,
       u.nombre_completo AS tecnicoNombre, o.centro_origen_id AS centroOrigenId,
       origen.nombre AS centroOrigenNombre, o.centro_destino_id AS centroDestinoId,
       destino.nombre AS centroDestinoNombre, o.estado, o.motivo,
       o.fecha_solicitud AS fechaSolicitud, o.fecha_completado AS fechaCompletado,
       d.titulo AS dispositivoTitulo, d.codigo_trazabilidad AS codigoTrazabilidad,
       d.estado_disponibilidad AS estadoDisponibilidad, d.peso_kg AS pesoKg
       FROM ordenes_transferencia o JOIN dispositivos d ON d.id = o.dispositivo_id
       JOIN usuarios u ON u.id = o.tecnico_id
       JOIN centros_acopio origen ON origen.id = o.centro_origen_id
       LEFT JOIN centros_acopio destino ON destino.id = o.centro_destino_id
       ${admin ? '' : 'WHERE o.tecnico_id = ?'}
       ORDER BY o.fecha_solicitud DESC, o.id DESC`, admin ? [] : [req.usuario.id]);
    sendSuccess(res, rows.map((row: OrdenListadoRow) => ({ ...row, pesoKg: Number(row.pesoKg) })));
  } catch (error: unknown) { next(error); }
}
