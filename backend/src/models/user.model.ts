export type UserRole = 'ADMIN' | 'DONOR' | 'WORKSHOP' | 'RECYCLER';

export interface User {
  id: number;
  roleId: number;
  roleName: UserRole;
  fullName: string;
  email: string;
  passwordHash?: string;
  phone?: string;
  organizationName?: string;
  address?: string;
  city?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface UserPublicProfile {
  id: number;
  roleName: UserRole;
  fullName: string;
  email: string;
  organizationName?: string;
  city?: string;
}
