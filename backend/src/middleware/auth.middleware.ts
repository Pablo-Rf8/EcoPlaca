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
  const token: string | undefined = authHeader?.match(/^Bearer ([^ ]+)$/)?.[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Acceso denegado: Token de autenticación no proporcionado',
      timestamp: new Date().toISOString()
    });
    return;
  }

  const secret: string | undefined = process.env.JWT_SECRET;
  if (!secret) { next(new Error('JWT_SECRET no está configurado')); return; }

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      res.status(401).json({
        success: false,
        error: 'Token inválido o expirado',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!decoded || typeof decoded !== 'object' || !Number.isSafeInteger(decoded['id']) || decoded['id'] <= 0) {
      res.status(401).json({ success: false, error: 'Token inválido' }); return;
    }
    req.usuario = decoded as TokenPayload;
    next();
  });
}
