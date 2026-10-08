import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { AuthRequest } from '../middleware/auth.middleware';

export const authController = {
  // Inicio de sesión con autenticación BCrypt y generación de JWT
  login: async (req: Request, res: Response): Promise<void> => {
    const { email: rawEmail, password } = req.body ?? {};
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : rawEmail;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      res.status(400).json({
        success: false,
        error: 'Debe ingresar email y contraseña',
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const [rows] = await pool.query<RowDataPacket[]>(`
        SELECT u.id, u.rol_id, r.nombre AS rol_nombre, u.nombre_completo, u.email, u.password_hash, u.activo
        FROM usuarios u
        INNER JOIN roles r ON u.rol_id = r.id
        WHERE u.email = ?
      `, [email]);

      if (!rows || rows.length === 0) {
        res.status(401).json({
          success: false,
          error: 'Credenciales inválidas',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const usuario = rows[0];

      if (!usuario.activo) {
        res.status(403).json({
          success: false,
          error: 'Cuenta inactiva. Contacte al administrador',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Comparación exclusiva con el hash BCrypt almacenado
      const passwordMatch = await bcrypt.compare(password, usuario.password_hash);

      if (!passwordMatch) {
        res.status(401).json({
          success: false,
          error: 'Credenciales inválidas',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const secret: string | undefined = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET no está configurado');
      const token = jwt.sign(
        {
          id: usuario.id,
          email: usuario.email,
          rolId: usuario.rol_id,
          rol: usuario.rol_nombre,
          nombre: usuario.nombre_completo
        },
        secret,
        { expiresIn: '7d' }
      );

      res.status(200).json({
        success: true,
        message: 'Autenticación exitosa',
        data: {
          token,
          usuario: {
            id: usuario.id,
            nombreCompleto: usuario.nombre_completo,
            email: usuario.email,
            rol: usuario.rol_nombre
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error interno de autenticación: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Registro de nuevo donante o técnico
  register: async (req: Request, res: Response): Promise<void> => {
    const { nombreCompleto: rawName, email: rawEmail, password, rolId, telefono, direccion } = req.body ?? {};
    const nombreCompleto = typeof rawName === 'string' ? rawName.trim() : rawName;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : rawEmail;

    if (typeof nombreCompleto !== 'string' || nombreCompleto.trim().length < 2 || nombreCompleto.trim().length > 150
        || typeof email !== 'string' || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72
        || (rolId !== undefined && rolId !== 2 && rolId !== 3)
        || (telefono != null && (typeof telefono !== 'string' || telefono.trim().length > 30))
        || (direccion != null && (typeof direccion !== 'string' || direccion.trim().length > 255))) {
      res.status(400).json({
        success: false,
        error: 'Nombre, correo o contraseña inválidos. Selecciona DONOR o TECHNICIAN.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM usuarios WHERE email = ?', [email]);
      if (existing.length > 0) {
        res.status(409).json({
          success: false,
          error: 'El correo electrónico ya se encuentra registrado',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const [result] = await pool.query<ResultSetHeader>(`
        INSERT INTO usuarios (rol_id, nombre_completo, email, password_hash, telefono, direccion)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [rolId || 2, nombreCompleto, email, passwordHash, telefono?.trim() || null, direccion?.trim() || null]);

      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          id: result.insertId,
          nombreCompleto,
          email,
          rolId: rolId || 2
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        res.status(409).json({ success: false, error: 'El correo electrónico ya se encuentra registrado' });
        return;
      }
      res.status(500).json({
        success: false,
        error: `Error al registrar usuario: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Perfil del usuario autenticado
  perfil: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.usuario) {
      res.status(401).json({ success: false, error: 'No autorizado' });
      return;
    }

    try {
      const [rows] = await pool.query<RowDataPacket[]>(`
        SELECT u.id, u.rol_id, r.nombre AS rol_nombre, u.nombre_completo, u.email, u.telefono, u.direccion, u.created_at
        FROM usuarios u
        INNER JOIN roles r ON u.rol_id = r.id
        WHERE u.id = ? AND u.activo = TRUE
      `, [req.usuario.id]);

      if (rows.length === 0) {
        res.status(401).json({ success: false, error: 'Usuario no encontrado o cuenta inactiva' });
        return;
      }

      res.status(200).json({
        success: true,
        data: rows[0],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ success: false, error: err.message });
    }
  }
};
