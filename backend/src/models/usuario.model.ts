export interface Usuario {
  id: number;
  rolId: number;
  rolNombre?: string;
  nombreCompleto: string;
  email: string;
  passwordHash?: string;
  telefono?: string;
  direccion?: string;
  activo: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface UsuarioPerfil {
  id: number;
  rolId: number;
  rolNombre?: string;
  nombreCompleto: string;
  email: string;
  telefono?: string;
  direccion?: string;
}
