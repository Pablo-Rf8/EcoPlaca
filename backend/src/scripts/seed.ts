import bcrypt from 'bcryptjs';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/database';
import { withDatabaseLock } from './database-lock';
const categories: ReadonlyArray<{ codigo: string; nombre: string; factor: number }> = [
  { codigo: 'RAEE-MB', nombre: 'Tarjetas Madre y Circuitos PCB', factor: 35.5 },
  { codigo: 'RAEE-PSU', nombre: 'Fuentes de Poder', factor: 18.2 },
  { codigo: 'RAEE-RAM', nombre: 'Módulos de Memoria RAM', factor: 65 },
  { codigo: 'RAEE-STO', nombre: 'Almacenamiento HDD y SSD', factor: 42 },
  { codigo: 'RAEE-GPU', nombre: 'Tarjetas Gráficas', factor: 55.8 },
  { codigo: 'RAEE-CPU', nombre: 'Microprocesadores', factor: 80 },
  { codigo: 'RAEE-DISP', nombre: 'Pantallas y Monitores', factor: 22.4 }
];
export async function seed(): Promise<void> {
  const email: string | undefined = process.env.SEED_ADMIN_EMAIL?.trim();
  const password: string | undefined = process.env.SEED_ADMIN_PASSWORD;
  const adminName: string = process.env.SEED_ADMIN_NOMBRE?.trim() || 'Administrador EcoPlaca';
  if ((email || password) && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150
      || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || adminName.length > 150)) {
    throw new Error('Configura SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD de 12 caracteres mínimo y 72 bytes máximo');
  }
  const centerName = process.env.SEED_CENTRO_NOMBRE?.trim();
  const address = process.env.SEED_CENTRO_DIRECCION?.trim();
  const city = process.env.SEED_CENTRO_CIUDAD?.trim();
  if ((centerName || address || city) && (!centerName || !address || !city || centerName.length > 150
      || address.length > 255 || city.length > 100)) throw new Error('Completa los tres datos SEED_CENTRO con longitudes válidas');
  await withDatabaseLock(async connection => {
    await connection.beginTransaction();
    try {
      for (const [index, name] of ['ADMIN', 'DONOR', 'TECHNICIAN'].entries()) {
        const id: number = index + 1;
        const [rows] = await connection.execute<(RowDataPacket & { id: number; nombre: string })[]>(
          'SELECT id, nombre FROM roles WHERE id = ? OR nombre = ? FOR UPDATE', [id, name]);
        if (rows.length && (rows.length !== 1 || rows[0].id !== id || rows[0].nombre !== name)) {
          throw new Error('Los IDs de roles existentes no corresponden al contrato 1/2/3. No se modificaron.');
        }
        if (!rows.length) await connection.execute('INSERT INTO roles (id, nombre) VALUES (?, ?)', [id, name]);
      }
      for (const category of categories) {
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM categorias_raee WHERE codigo = ? FOR UPDATE', [category.codigo]);
        if (!rows.length) await connection.execute(
          'INSERT INTO categorias_raee (codigo, nombre, factor_co2_kg) VALUES (?, ?, ?)',
          [category.codigo, category.nombre, category.factor]);
      }
      if (email && password) {
        const [users] = await connection.execute<(RowDataPacket & { rol_id: number })[]>(
          'SELECT rol_id FROM usuarios WHERE email = ? FOR UPDATE', [email]);
        if (users[0] && users[0].rol_id !== 1) throw new Error('SEED_ADMIN_EMAIL pertenece a una cuenta sin rol ADMIN');
        if (!users.length) {
          const hash: string = await bcrypt.hash(password, 12);
          await connection.execute('INSERT INTO usuarios (rol_id, nombre_completo, email, password_hash) VALUES (1, ?, ?, ?)',
            [adminName, email, hash]);
        }
      }
      if (centerName && address && city) {
        const [centers] = await connection.execute<(RowDataPacket & { id: number })[]>(
          'SELECT id FROM centros_acopio WHERE nombre = ? AND direccion = ? AND ciudad = ? FOR UPDATE', [centerName, address, city]);
        if (!centers.length) {
          const [insert] = await connection.execute<ResultSetHeader>(
            'INSERT INTO centros_acopio (nombre, direccion, ciudad) VALUES (?, ?, ?)', [centerName, address, city]);
          for (const category of categories) {
            await connection.execute(
              'INSERT INTO centros_categorias (centro_id, categoria_id) SELECT ?, id FROM categorias_raee WHERE codigo = ?',
              [insert.insertId, category.codigo]);
          }
        }
      }
      await connection.commit();
    } catch (error: unknown) {
      try { await connection.rollback(); } catch { connection.destroy(); }
      throw error;
    }
  });
  console.log('Seed completado. No se sobrescribieron usuarios ni datos existentes.');
}
if (require.main === module) {
  seed().catch((error: unknown): void => {
    console.error('Falló el seed:', error instanceof Error ? error.message : 'Error desconocido'); process.exitCode = 1;
  }).finally(async (): Promise<void> => { await pool.end(); });
}
