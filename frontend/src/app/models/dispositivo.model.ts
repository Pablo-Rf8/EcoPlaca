export type EstadoFuncional = 'OPERATIVO' | 'REPARABLE' | 'DESGUACE_RECICLAJE';
export type EstadoDisponibilidad = 'DISPONIBLE' | 'RESERVADO' | 'ASIGNADO' | 'RECICLADO';

export interface Dispositivo {
  id: number;
  codigoTrazabilidad: string;
  titulo: string;
  categoriaId?: number;
  categoriaNombre?: string;
  donanteId?: number;
  donanteNombre?: string;
  centroAcopioId?: number;
  centroAcopioNombre?: string;
  marca?: string;
  modelo?: string;
  numeroSerie?: string;
  estadoFuncional: EstadoFuncional;
  estadoDisponibilidad: EstadoDisponibilidad;
  pesoKg: number;
  co2EvitadoKg: number;
  especificaciones?: Record<string, unknown>;
  notas?: string;
  createdAt?: string;
}
