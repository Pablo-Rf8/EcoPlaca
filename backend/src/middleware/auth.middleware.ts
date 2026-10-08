import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.util';
import { UserRole } from '../models/user.model';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: UserRole;
  };
}

/**
 * Middleware para validar autorización de solicitudes
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Si no hay token en modo desarrollo, permitimos continuar como usuario demo o retornamos 401 según el endpoint
    sendError(res, 'Acceso no autorizado: Token de autenticación requerido', 401);
    return;
  }

  try {
    // En un entorno de producción se decodifica y verifica con jsonwebtoken
    // Para simplificar la inicialización, simulamos verificación de token
    req.user = {
      id: 1,
      email: 'admin@ecoplaca.org',
      role: 'ADMIN'
    };
    next();
  } catch {
    sendError(res, 'Token inválido o expirado', 403);
  }
}

/**
 * Middleware para restringir acceso por rol del ecosistema
 */
export function authorizeRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      sendError(res, 'Permisos insuficientes para realizar esta operación', 403);
      return;
    }
    next();
  };
}
