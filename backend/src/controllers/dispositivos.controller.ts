import pool from '../config/database';
import { RowDataPacket } from 'mysql2';
import { crearDispositivo } from './publicaciones.controller';
import { HttpError, crudHandler, inTransaction, parseId, record } from '../utils/crud.util';
import { sendSuccess } from '../utils/response.util';

const disponibilidad = ['DISPONIBLE', 'RESERVADO', 'ASIGNADO', 'RECICLADO', 'ENTREGADO'];
const funcional = ['OPERATIVO', 'REPARABLE', 'DESGUACE_RECICLAJE'];
function filtro(value: unknown, name: string, allowed?: string[]): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > 150) throw new HttpError(`${name} inválido`, 400);
  const normalized = allowed ? value.trim().toUpperCase() : value.trim();
  if (allowed && !allowed.includes(normalized)) throw new HttpError(`${name} inválido`, 400);
  return normalized;
}
function dispositivo(row: RowDataPacket): RowDataPacket {
  return { ...row, pesoKg: Number(row.pesoKg), co2EvitadoKg: Number(row.co2EvitadoKg) };
}

export const dispositivosController = {
  // Listar todos los dispositivos con filtros opcionales (estado, categoría, búsqueda)
  getDispositivos: crudHandler(async (req, res): Promise<void> => {
      const estado = filtro(req.query.estado, 'estado', disponibilidad);
      const estadoFuncional = filtro(req.query.estadoFuncional, 'estadoFuncional', funcional);
      const categoriaId = req.query.categoriaId === undefined ? undefined : parseId(req.query.categoriaId);
      const busqueda = filtro(req.query.busqueda, 'busqueda');

      let sql = `
        SELECT 
          d.id,
          d.codigo_trazabilidad AS codigoTrazabilidad,
          d.titulo,
          d.categoria_id AS categoriaId,
          c.nombre AS categoriaNombre,
          c.codigo AS categoriaCodigo,
          d.donante_id AS donanteId,
          u.nombre_completo AS donanteNombre,
          d.centro_acopio_id AS centroAcopioId,
          ca.nombre AS centroAcopioNombre,
          ca.ciudad AS centroCiudad,
          d.marca,
          d.modelo,
          d.numero_serie AS numeroSerie,
          d.estado_funcional AS estadoFuncional,
          d.estado_disponibilidad AS estadoDisponibilidad,
          d.peso_kg AS pesoKg,
          d.co2_evitado_kg AS co2EvitadoKg,
          d.especificaciones,
          d.notas,
          d.created_at AS createdAt,
          d.updated_at AS updatedAt
        FROM dispositivos d
        LEFT JOIN categorias_raee c ON d.categoria_id = c.id
        LEFT JOIN usuarios u ON d.donante_id = u.id
        LEFT JOIN centros_acopio ca ON d.centro_acopio_id = ca.id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (estado) {
        sql += ' AND d.estado_disponibilidad = ?';
        params.push(estado);
      }

      if (estadoFuncional) {
        sql += ' AND d.estado_funcional = ?';
        params.push(estadoFuncional);
      }

      if (categoriaId) {
        sql += ' AND d.categoria_id = ?';
        params.push(categoriaId);
      }

      if (busqueda) {
        sql += ' AND (d.titulo LIKE ? OR d.codigo_trazabilidad LIKE ? OR d.marca LIKE ? OR d.modelo LIKE ?)';
        const queryTerm = `%${busqueda}%`;
        params.push(queryTerm, queryTerm, queryTerm, queryTerm);
      }

      sql += ' ORDER BY d.id DESC';

      const [rows] = await pool.query<RowDataPacket[]>(sql, params);

      res.status(200).json({
        success: true,
        data: rows.map(dispositivo),
        meta: { total: rows.length },
        timestamp: new Date().toISOString()
      });
  }),

  // Obtener detalle de un dispositivo por ID
  getDispositivoById: crudHandler(async (req, res): Promise<void> => {
      const id = parseId(req.params.id);

      const [rows] = await pool.query<RowDataPacket[]>(`
        SELECT 
          d.id,
          d.codigo_trazabilidad AS codigoTrazabilidad,
          d.titulo,
          d.categoria_id AS categoriaId,
          c.nombre AS categoriaNombre,
          d.donante_id AS donanteId,
          u.nombre_completo AS donanteNombre,
          d.centro_acopio_id AS centroAcopioId,
          ca.nombre AS centroAcopioNombre,
          d.marca,
          d.modelo,
          d.numero_serie AS numeroSerie,
          d.estado_funcional AS estadoFuncional,
          d.estado_disponibilidad AS estadoDisponibilidad,
          d.peso_kg AS pesoKg,
          d.co2_evitado_kg AS co2EvitadoKg,
          d.especificaciones,
          d.notas,
          d.created_at AS createdAt,
          d.updated_at AS updatedAt
        FROM dispositivos d
        LEFT JOIN categorias_raee c ON d.categoria_id = c.id
        LEFT JOIN usuarios u ON d.donante_id = u.id
        LEFT JOIN centros_acopio ca ON d.centro_acopio_id = ca.id
        WHERE d.id = ?
      `, [id]);

      if (rows.length === 0) {
        res.status(404).json({
          success: false,
          error: `Dispositivo con ID ${id} no encontrado`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: dispositivo(rows[0]),
        timestamp: new Date().toISOString()
      });
  }),

  createDispositivo: crearDispositivo,

  // Actualizar estado del dispositivo
  updateEstado: crudHandler(async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    const body = record(req.body);
    const estadoDisponibilidad = body.estadoDisponibilidad;
    const estadoFuncional = body.estadoFuncional;
    const notas = body.notas;
    if ((estadoDisponibilidad !== undefined && (typeof estadoDisponibilidad !== 'string' || !disponibilidad.includes(estadoDisponibilidad)))
        || (estadoFuncional !== undefined && (typeof estadoFuncional !== 'string' || !funcional.includes(estadoFuncional)))
        || (notas !== undefined && notas !== null && (typeof notas !== 'string' || notas.length > 5000))
        || [estadoDisponibilidad, estadoFuncional, notas].every(value => value === undefined)) {
      throw new HttpError('Indica un estado válido o notas de hasta 5000 caracteres', 400);
    }
    const updated = await inTransaction(async connection => {
      const [existing] = await connection.execute<RowDataPacket[]>(
        'SELECT id, estado_disponibilidad, estado_funcional, notas FROM dispositivos WHERE id = ? FOR UPDATE', [id]);
      if (!existing[0]) throw new HttpError('Dispositivo no encontrado', 404);
      const current = existing[0];
      if (estadoDisponibilidad !== undefined && estadoDisponibilidad !== current.estado_disponibilidad) {
        const [orders] = await connection.execute<RowDataPacket[]>(
          "SELECT id FROM ordenes_transferencia WHERE dispositivo_id = ? AND estado IN ('PENDIENTE', 'EN_TRANSITO') FOR UPDATE", [id]);
        if (orders.length || current.estado_disponibilidad === 'RESERVADO'
            || estadoDisponibilidad === 'RESERVADO' || estadoDisponibilidad === 'ENTREGADO'
            || (['ENTREGADO', 'RECICLADO'].includes(current.estado_disponibilidad) && estadoDisponibilidad !== 'RECICLADO')) {
          throw new HttpError('El cambio de estado entra en conflicto con el flujo de transferencias', 409);
        }
      }
      const result = { id, estadoDisponibilidad: estadoDisponibilidad ?? current.estado_disponibilidad,
        estadoFuncional: estadoFuncional ?? current.estado_funcional,
        notas: notas === undefined ? current.notas : typeof notas === 'string' ? notas.trim() || null : null };
      await connection.execute(
        'UPDATE dispositivos SET estado_disponibilidad = ?, estado_funcional = ?, notas = ?, updated_at = NOW() WHERE id = ?',
        [result.estadoDisponibilidad, result.estadoFuncional, result.notas, id]);
      return result;
    });
    sendSuccess(res, updated, 'Estado del dispositivo actualizado correctamente');
  })
};
