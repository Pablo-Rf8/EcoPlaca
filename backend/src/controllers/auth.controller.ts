import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.util';
import { User, UserPublicProfile } from '../models/user.model';

// Usuarios de prueba en memoria (sincronizados con el seed SQL)
const MOCK_USERS: User[] = [
  {
    id: 1,
    roleId: 1,
    roleName: 'ADMIN',
    fullName: 'Administrador EcoPlaca',
    email: 'admin@ecoplaca.org',
    organizationName: 'EcoPlaca Foundation',
    city: 'Ciudad de México',
    isActive: true,
    createdAt: new Date('2026-01-10T10:00:00Z')
  },
  {
    id: 2,
    roleId: 2,
    roleName: 'DONOR',
    fullName: 'TecnoEmpresa Soluciones',
    email: 'contacto@tecnoempresa.com',
    organizationName: 'TecnoEmpresa S.A.',
    city: 'Monterrey',
    isActive: true,
    createdAt: new Date('2026-01-15T11:00:00Z')
  },
  {
    id: 3,
    roleId: 3,
    roleName: 'WORKSHOP',
    fullName: 'Taller Comunitario Re-Boot',
    email: 'contacto@taller-reboot.org',
    organizationName: 'Re-Boot Hardware Lab',
    city: 'Guadalajara',
    isActive: true,
    createdAt: new Date('2026-02-01T09:30:00Z')
  },
  {
    id: 4,
    roleId: 4,
    roleName: 'RECYCLER',
    fullName: 'E-Waste Reciclaje Sustentable',
    email: 'operaciones@ewasterecicla.mx',
    organizationName: 'E-Waste Solutions de México',
    city: 'Puebla',
    isActive: true,
    createdAt: new Date('2026-02-10T15:00:00Z')
  }
];

export const authController = {
  login: async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    if (!email || !password) {
      sendError(res, 'Email y contraseña requeridos', 400);
      return;
    }

    const user = MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      sendError(res, 'Credenciales inválidas', 401);
      return;
    }

    // Token simulado para el ambiente de desarrollo
    const token = `mock-jwt-token-for-${user.id}-${Date.now()}`;

    const profile: UserPublicProfile = {
      id: user.id,
      roleName: user.roleName,
      fullName: user.fullName,
      email: user.email,
      organizationName: user.organizationName,
      city: user.city
    };

    sendSuccess(res, { token, user: profile }, 'Inicio de sesión exitoso');
  },

  getProfile: async (req: Request, res: Response): Promise<void> => {
    const user = MOCK_USERS[0]; // Retorna usuario por defecto en demo
    const profile: UserPublicProfile = {
      id: user.id,
      roleName: user.roleName,
      fullName: user.fullName,
      email: user.email,
      organizationName: user.organizationName,
      city: user.city
    };
    sendSuccess(res, profile, 'Perfil de usuario obtenido');
  }
};
