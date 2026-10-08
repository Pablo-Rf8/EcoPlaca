import app from './app';
import pool, { testConnection } from './config/database';
import { validateRuntimeEnvironment } from './config/env';
async function start(): Promise<void> {
  validateRuntimeEnvironment();
  const port: number = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido');
  if (!await testConnection()) throw new Error('MySQL no está disponible; se canceló el inicio');
  const server = app.listen(port, (): void => console.log(`EcoPlaca API escuchando en puerto ${port}`));
  server.on('error', (error: Error): void => {
    console.error('Error al iniciar HTTP:', error.message); void pool.end(); process.exitCode = 1;
  });
  const shutdown = (): void => {
    const timer = setTimeout((): never => process.exit(1), 10000); timer.unref();
    server.close((): void => {
      void pool.end().then((): void => { clearTimeout(timer); process.exitCode = 0; })
        .catch((): void => { clearTimeout(timer); process.exitCode = 1; });
    });
  };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
start().catch((error: unknown): void => {
  console.error('No se pudo iniciar EcoPlaca:', error instanceof Error ? error.message : 'Error desconocido');
  void pool.end(); process.exitCode = 1;
});
