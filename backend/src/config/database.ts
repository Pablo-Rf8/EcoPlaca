import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Asegurar carga de variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '3308', 10);
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || 'root';
const dbName = process.env.DB_NAME || 'ecoplaca_db';

// Pool de conexiones MySQL con promesas
export const pool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Prueba la conectividad con la base de datos
 */
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Conexión establecida exitosamente con MySQL en ${dbHost}:${dbPort}/${dbName}`);
    connection.release();
    return true;
  } catch (error) {
    const err = error as Error;
    console.warn(`[Database] Advertencia de conexión a MySQL (${err.message}) en ${dbHost}:${dbPort}`);
    return false;
  }
}

export default pool;
