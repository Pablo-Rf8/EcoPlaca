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

  const code = (err as { code?: string }).code;
  const concurrentConflict = code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT';
  const statusCode = concurrentConflict ? 409 : (err as { status?: number }).status || 500;
  const message = concurrentConflict ? 'Conflicto concurrente. Intenta nuevamente.' : process.env.NODE_ENV === 'production'
    ? 'Ocurrió un error interno en el servidor'
    : err.message || 'Error interno en el servidor';

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}
