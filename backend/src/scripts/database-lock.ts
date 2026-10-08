import { createHash } from 'node:crypto';
import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { requiredEnv } from '../config/env';
export async function withDatabaseLock<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
  let connection: PoolConnection | undefined = await pool.getConnection();
  const name: string = 'ecoplaca:' + createHash('sha256').update(requiredEnv('DB_NAME')).digest('hex').slice(0, 40);
  let acquired: boolean = false;
  try {
    const [rows] = await connection.execute<(RowDataPacket & { acquired: number | null })[]>(
      'SELECT GET_LOCK(?, 30) AS acquired', [name]);
    if (rows[0]?.acquired !== 1) throw new Error('No se pudo adquirir el bloqueo de preparación de base de datos');
    acquired = true;
    return await action(connection);
  } finally {
    if (acquired) {
      try { await connection.execute('SELECT RELEASE_LOCK(?)', [name]); }
      catch { connection.destroy(); connection = undefined; }
    }
    connection?.release();
  }
}
