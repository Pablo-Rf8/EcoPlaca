export type EstadoFuncional = 'OPERATIVO' | 'REPARABLE' | 'DESGUACE_RECICLAJE';
export type EstadoDisponibilidad = 'DISPONIBLE' | 'RESERVADO' | 'ASIGNADO' | 'RECICLADO' | 'ENTREGADO';

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

export interface CrearDispositivoDTO {
  titulo: string; categoriaId: number; centroAcopioId: number;
  marca?: string; modelo?: string; numeroSerie?: string;
  estadoFuncional: EstadoFuncional; pesoKg: number; notas?: string;
  especificaciones?: Record<string, unknown>;
}
export interface CategoriaRAEE { id: number; codigo: string; nombre: string; }
export interface CentroPublicacion { id: number; nombre: string; ciudad: string; categoriaId: number; }
export interface OpcionesPublicacion { categorias: CategoriaRAEE[]; centros: CentroPublicacion[]; }
