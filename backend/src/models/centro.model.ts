export interface CentroAcopio {
  id: number; nombre: string; direccion: string; ciudad: string; telefono: string | null;
  capacidadKg: number; activo: boolean; categoriasIds: number[]; createdAt: Date;
}
export interface CentroDTO {
  nombre: string; direccion: string; ciudad: string; telefono: string | null; capacidadKg: number; categoriasIds: number[];
}
