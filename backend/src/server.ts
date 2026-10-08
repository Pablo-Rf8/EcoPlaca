import app from './app';
import { envConfig } from './config/env.config';
import { testDatabaseConnection } from './config/database';
import { logger } from './utils/logger.util';

const PORT = envConfig.port;

const server = app.listen(PORT, async () => {
  logger.info(`=======================================================`);
  logger.info(`  ♻️  EcoPlaca Backend API iniciado con éxito`);
  logger.info(`  📡 Servidor escuchando en: http://localhost:${PORT}`);
  logger.info(`  🧪 Prefijo de rutas: http://localhost:${PORT}${envConfig.apiPrefix}`);
  logger.info(`  🩺 Health check: http://localhost:${PORT}${envConfig.apiPrefix}/health`);
  logger.info(`  🌍 Entorno: ${envConfig.nodeEnv}`);
  logger.info(`=======================================================`);

  // Verificar conexión con la base de datos
  await testDatabaseConnection();
});

// Manejo elegante de apagado (Graceful Shutdown)
function handleShutdown(signal: string) {
  logger.info(`Señal ${signal} recibida. Cerrando servidor EcoPlaca...`);
  server.close(() => {
    logger.info('Servidor HTTP cerrado.');
    process.exit(0);
  });

  // Forzar apagado si excede el tiempo límite
  setTimeout(() => {
    logger.error('No se pudo cerrar a tiempo, forzando salida...');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
