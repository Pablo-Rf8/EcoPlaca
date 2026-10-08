/**
 * Utilidad de registro (logger) estructurado con timestamp y niveles
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatLog(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(`\x1b[32m${formatLog('INFO', message, meta)}\x1b[0m`);
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(`\x1b[33m${formatLog('WARN', message, meta)}\x1b[0m`);
  },
  error: (message: string, meta?: unknown) => {
    console.error(`\x1b[31m${formatLog('ERROR', message, meta)}\x1b[0m`);
  },
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`\x1b[36m${formatLog('DEBUG', message, meta)}\x1b[0m`);
    }
  }
};
