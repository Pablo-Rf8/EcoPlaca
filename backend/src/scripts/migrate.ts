import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { withDatabaseLock } from './database-lock';
// Las siete tablas se crean si faltan. No ejecuta ecoplaca_DB.sql ni DROP DATABASE.
export async function migrate(): Promise<void> {
  const directory: string = path.resolve(__dirname, '../../../DB/migrations');
  const schema: string = await readFile(path.join(directory, '001_schema.sql'), 'utf8');
  const upgrades: string = await readFile(path.join(directory, '002_transferencias_dashboard.sql'), 'utf8');
  const reconciliation: string = await readFile(path.join(directory, '003_reconcile_transfers.sql'), 'utf8');
  await withDatabaseLock(async connection => {
    const statements: string[] = schema.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    if (statements.length !== 7 || statements.some(s => !/^CREATE TABLE IF NOT EXISTS /i.test(s))) {
      throw new Error('001_schema.sql debe contener únicamente las siete tablas con CREATE TABLE IF NOT EXISTS');
    }
    for (const statement of statements) await connection.query(statement);
    const alterations: string[] = upgrades.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    const expected = [
      { table: 'dispositivos', column: 'estado_disponibilidad', state: 'ENTREGADO' },
      { table: 'ordenes_transferencia', column: 'estado', state: 'COMPLETADA' }
    ];
    if (alterations.length !== expected.length) throw new Error('Migración de estados inesperada');
    for (const [index, target] of expected.entries()) {
      if (!alterations[index].startsWith('ALTER TABLE ' + target.table + ' MODIFY ' + target.column)) {
        throw new Error('Sentencia de migración inesperada');
      }
      const [rows] = await connection.execute<(RowDataPacket & { tipo: string })[]>(
        'SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [target.table, target.column]);
      if (!rows[0]) throw new Error('Falta la columna ' + target.table + '.' + target.column);
      if (!rows[0].tipo.includes("'" + target.state + "'")) await connection.query(alterations[index]);
    }
    await connection.beginTransaction();
    try {
      for (const statement of reconciliation.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
        await connection.query(statement);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
  console.log('Migraciones verificadas; los datos existentes se conservaron.');
}
if (require.main === module) {
  migrate().catch((error: unknown): void => {
    console.error('Falló la migración:', error instanceof Error ? error.message : 'Error desconocido'); process.exitCode = 1;
  }).finally(async (): Promise<void> => { await pool.end(); });
}
