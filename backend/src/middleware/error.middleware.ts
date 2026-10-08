import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.util';
import { sendError } from '../utils/response.util';

/**
 * Manejador global de rutas inexistentes (404)
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Ruta no encontrada: [${req.method}] ${req.originalUrl}`, 404);
}

/**
 * Manejador global de excepciones y errores no controlados (500)
 */
export function errorHandler(
  err: Error, 
  req: Request, 
  res: Response, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  logger.error(`Error no controlado en [${req.method}] ${req.originalUrl}: ${err.message}`, { stack: err.stack });

  const statusCode = (err as { status?: number }).status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Ocurrió un error interno en el servidor' 
    : err.message || 'Error interno en el servidor';

  sendError(res, message, statusCode, {
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}
