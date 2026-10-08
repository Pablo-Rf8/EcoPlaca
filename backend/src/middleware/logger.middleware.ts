import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.util';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const logMsg = `${method} ${originalUrl} ${statusCode} - ${duration}ms [IP: ${ip}]`;
    
    if (statusCode >= 400) {
      logger.warn(logMsg);
    } else {
      logger.info(logMsg);
    }
  });

  next();
}
