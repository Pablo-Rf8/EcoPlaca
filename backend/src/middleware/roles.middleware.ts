import { NextFunction, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { AuthRequest } from './auth.middleware';
import { sendError } from '../utils/response.util';

export type Rol = 'ADMIN' | 'DONOR' | 'TECHNICIAN';

export function authorizeRoles(
  ...roles: Rol[]
): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuario) {
      sendError(res, 'Autenticación requerida', 401);
      return;
    }
    try {
      const [rows] = await pool.execute<(RowDataPacket & { nombre: Rol })[]>(
        `SELECT r.nombre FROM usuarios u JOIN roles r ON r.id = u.rol_id
         WHERE u.id = ? AND u.activo = TRUE`, [req.usuario.id]
      );
      if (!rows[0] || !roles.includes(rows[0].nombre)) {
        sendError(res, 'No tiene permisos para esta operación', 403);
        return;
      }
      res.locals.rol = rows[0].nombre;
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
