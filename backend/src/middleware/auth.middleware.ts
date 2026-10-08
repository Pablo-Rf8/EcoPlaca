import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  id: number;
  email: string;
  rolId: number;
  nombre: string;
}

export interface AuthRequest extends Request {
  usuario?: TokenPayload;
}

/**
 * Middleware para validar tokens JWT en cabecera Authorization: Bearer <token>
 */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Acceso denegado: Token de autenticación no proporcionado',
      timestamp: new Date().toISOString()
    });
    return;
  }

  const secret = process.env.JWT_SECRET || 'ecoplaca_default_secret_key_2026';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      res.status(403).json({
        success: false,
        error: 'Token inválido o expirado',
        timestamp: new Date().toISOString()
      });
      return;
    }

    req.usuario = decoded as TokenPayload;
    next();
  });
}
