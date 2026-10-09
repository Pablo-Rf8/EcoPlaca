import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { requiredEnv } from './env';

const connectionUri = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PRIVATE_URL;

let poolInstance: Pool;

if (connectionUri) {
  poolInstance = mysql.createPool({
    uri: connectionUri,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
} else {
  const port: number = Number(process.env.DB_PORT ?? '3306');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT inválido');
  const databaseOptions: PoolOptions = {
    host: requiredEnv('DB_HOST'),
    port,
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASSWORD'),
    database: requiredEnv('DB_NAME'),
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
  poolInstance = mysql.createPool(databaseOptions);
}

export const pool: Pool = poolInstance;

pool.pool.on('connection', connection => {
  connection.query("SET time_zone = '+00:00'");
});

export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    try { await connection.ping(); } finally { connection.release(); }
    return true;
  } catch (error: unknown) {
    console.error('No se pudo conectar a MySQL:', error instanceof Error ? error.message : 'Error desconocido');
    return false;
  }
}

export default pool;
