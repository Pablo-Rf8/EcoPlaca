export type EstadoFuncional = 'OPERATIVO' | 'REPARABLE' | 'DESGUACE_RECICLAJE';
export type EstadoDisponibilidad = 'DISPONIBLE' | 'RESERVADO' | 'ASIGNADO' | 'RECICLADO' | 'ENTREGADO';

export interface Dispositivo {
  id: number;
  codigoTrazabilidad: string;
  titulo: string;
  categoriaId: number;
  categoriaNombre?: string;
  donanteId: number;
  donanteNombre?: string;
  centroAcopioId?: number | null;
  centroAcopioNombre?: string | null;
  marca?: string;
  modelo?: string;
  numeroSerie?: string;
  estadoFuncional: EstadoFuncional;
  estadoDisponibilidad: EstadoDisponibilidad;
  pesoKg: number;
  co2EvitadoKg: number;
  especificaciones?: Record<string, unknown>;
  notas?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CreateDispositivoDTO {
  titulo: string;
  categoriaId: number;
  donanteId?: number;
  centroAcopioId?: number;
  marca?: string;
  modelo?: string;
  numeroSerie?: string;
  estadoFuncional?: EstadoFuncional;
  pesoKg: number;
  especificaciones?: Record<string, unknown>;
  notas?: string;
}
