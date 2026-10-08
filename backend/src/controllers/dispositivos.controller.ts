import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { CreateDispositivoDTO } from '../models/dispositivo.model';

export const dispositivosController = {
  // Listar todos los dispositivos con filtros opcionales (estado, categoría, búsqueda)
  getDispositivos: async (req: Request, res: Response): Promise<void> => {
    try {
      const { estado, estadoFuncional, categoriaId, busqueda } = req.query;

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
        params.push((estado as string).toUpperCase());
      }

      if (estadoFuncional) {
        sql += ' AND d.estado_funcional = ?';
        params.push((estadoFuncional as string).toUpperCase());
      }

      if (categoriaId) {
        sql += ' AND d.categoria_id = ?';
        params.push(parseInt(categoriaId as string, 10));
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
        data: rows,
        meta: { total: rows.length },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al obtener catálogo de dispositivos: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Obtener detalle de un dispositivo por ID
  getDispositivoById: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);

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
        data: rows[0],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al consultar dispositivo: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Catalogar un nuevo dispositivo RAEE
  createDispositivo: async (req: Request, res: Response): Promise<void> => {
    try {
      const body: CreateDispositivoDTO = req.body;

      if (!body.titulo || !body.categoriaId || body.pesoKg === undefined) {
        res.status(400).json({
          success: false,
          error: 'Campos obligatorios requeridos: titulo, categoriaId, pesoKg',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Obtener factor de CO2 de la categoría
      const [catRows] = await pool.query<RowDataPacket[]>(
        'SELECT factor_co2_kg FROM categorias_raee WHERE id = ?',
        [body.categoriaId]
      );
      const factorCo2 = catRows.length > 0 ? Number(catRows[0].factor_co2_kg) : 25.00;
      const co2Evitado = Math.round(Number(body.pesoKg) * factorCo2 * 100) / 100;

      // Generar código único de trazabilidad incremental
      const [maxRows] = await pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM dispositivos');
      const nextId = (maxRows[0] as { nextId: number }).nextId;
      const codigoTrazabilidad = `RAEE-2026-${String(nextId).padStart(4, '0')}`;

      const [result] = await pool.query<ResultSetHeader>(`
        INSERT INTO dispositivos (
          codigo_trazabilidad, titulo, categoria_id, donante_id, centro_acopio_id,
          marca, modelo, numero_serie, estado_funcional, estado_disponibilidad,
          peso_kg, co2_evitado_kg, especificaciones, notas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPONIBLE', ?, ?, ?, ?)
      `, [
        codigoTrazabilidad,
        body.titulo,
        body.categoriaId,
        body.donanteId || 2,
        body.centroAcopioId || 1,
        body.marca || null,
        body.modelo || null,
        body.numeroSerie || null,
        body.estadoFuncional || 'REPARABLE',
        body.pesoKg,
        co2Evitado,
        body.especificaciones ? JSON.stringify(body.especificaciones) : null,
        body.notas || null
      ]);

      res.status(201).json({
        success: true,
        message: 'Dispositivo catalogado exitosamente',
        data: {
          id: result.insertId,
          codigoTrazabilidad,
          titulo: body.titulo,
          co2EvitadoKg: co2Evitado,
          pesoKg: body.pesoKg,
          estadoDisponibilidad: 'DISPONIBLE'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al registrar dispositivo: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Actualizar estado del dispositivo
  updateEstado: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { estadoDisponibilidad, estadoFuncional, notas } = req.body;

      const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM dispositivos WHERE id = ?', [id]);
      if (existing.length === 0) {
        res.status(404).json({
          success: false,
          error: `Dispositivo con ID ${id} no encontrado`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      await pool.query(`
        UPDATE dispositivos
        SET 
          estado_disponibilidad = COALESCE(?, estado_disponibilidad),
          estado_funcional = COALESCE(?, estado_funcional),
          notas = COALESCE(?, notas),
          updated_at = NOW()
        WHERE id = ?
      `, [estadoDisponibilidad || null, estadoFuncional || null, notas || null, id]);

      res.status(200).json({
        success: true,
        message: 'Estado del dispositivo actualizado correctamente',
        data: { id, estadoDisponibilidad, estadoFuncional },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al actualizar dispositivo: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  }
};
