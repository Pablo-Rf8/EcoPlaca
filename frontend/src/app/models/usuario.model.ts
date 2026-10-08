export type Rol = 'ADMIN' | 'DONOR' | 'TECHNICIAN';
export interface Usuario {
  id: number;
  nombreCompleto: string;
  email: string;
  rol: Rol;
  telefono?: string | null;
  direccion?: string | null;
}
export interface LoginCredentials { email: string; password: string; }
export interface RegisterDTO extends LoginCredentials {
  nombreCompleto: string;
  rolId: 2 | 3;
  telefono?: string;
  direccion?: string;
}
export interface ApiResponse<T> { success: boolean; data: T; message?: string; error?: string; }
export interface AuthResponse extends ApiResponse<{ token: string; usuario: Usuario }> {}
export interface RegisterResponse extends ApiResponse<{ id: number; nombreCompleto: string; email: string; rolId: number }> {}
export interface ProfileResponse extends ApiResponse<{
  id: number; nombre_completo: string; email: string; rol_nombre: Rol;
  telefono: string | null; direccion: string | null;
}> {}
