import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
export function requiredEnv(key: string): string {
  const value: string | undefined = process.env[key];
  if (!value?.trim()) throw new Error(`Falta la variable de entorno ${key}`);
  return value;
}
export function allowedOrigins(): string[] {
  const configured: string | undefined = process.env.CORS_ORIGINS;
  if (!configured?.trim()) {
    if (process.env.NODE_ENV === 'production') throw new Error('CORS_ORIGINS es obligatorio en producción');
    return ['http://localhost:4200'];
  }
  const origins: string[] = configured.split(',').map(value => value.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password
        || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      throw new Error('CORS_ORIGINS debe contener orígenes completos sin rutas; en producción usa HTTPS');
    }
  }
  return origins;
}
export function validateRuntimeEnvironment(): void {
  const secret = requiredEnv('JWT_SECRET');
  if (process.env.NODE_ENV === 'production' && secret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  allowedOrigins();
}
