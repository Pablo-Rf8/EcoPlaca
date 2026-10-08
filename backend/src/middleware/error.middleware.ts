import { Request, Response, NextFunction } from 'express';

/**
 * Middleware centralizado de manejo de errores
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  console.error(`[Error] [${req.method}] ${req.originalUrl}: ${err.message}`, err.stack);

  const statusCode = (err as { status?: number }).status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Ocurrió un error interno en el servidor'
    : err.message || 'Error interno en el servidor';

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}
