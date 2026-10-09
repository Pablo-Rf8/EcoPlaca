import { randomUUID } from 'node:crypto';
import { NextFunction, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { Dispositivo } from '../models/dispositivo.model';
import { calculateAvoidedCo2 } from '../utils/carbonCalculator.util';
import { sendError, sendSuccess } from '../utils/response.util';
import { HttpError } from '../utils/crud.util';
import { ValidatedDispositivoDTO, validarDispositivoDTO } from '../utils/dispositivo-validation.util';

interface CategoriaRow extends RowDataPacket { id: number; codigo: string; nombre: string; factor_co2_kg?: string | number; }
interface CentroRow extends RowDataPacket { id: number; nombre: string; ciudad: string; categoriaId: number; }

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
  let body: ValidatedDispositivoDTO;
  try { body = validarDispositivoDTO(req.body); }
  catch (error: unknown) {
    if (error instanceof HttpError) sendError(res, error.message, error.status);
    else next(error);
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
