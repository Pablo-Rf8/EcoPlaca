import mysql from 'mysql2/promise';
import { envConfig } from './env.config';
import { logger } from '../utils/logger.util';

// Pool de conexiones MySQL
export const pool = mysql.createPool({
  host: envConfig.db.host,
  port: envConfig.db.port,
  user: envConfig.db.user,
  password: envConfig.db.password,
  database: envConfig.db.database,
  waitForConnections: true,
  connectionLimit: envConfig.db.connectionLimit,
  queueLimit: 0,
});

/**
 * Verifica la conectividad con la base de datos MySQL
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    logger.info(`[Database] Conexión exitosa a MySQL en ${envConfig.db.host}:${envConfig.db.port}/${envConfig.db.database}`);
    connection.release();
    return true;
  } catch (error) {
    const err = error as Error;
    logger.warn(`[Database] No se pudo conectar a MySQL (${err.message}). La API utilizará almacenamiento en memoria en modo desarrollo.`);
    return false;
  }
}
