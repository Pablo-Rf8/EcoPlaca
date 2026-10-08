import { Request, RequestHandler, Response } from 'express';
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
