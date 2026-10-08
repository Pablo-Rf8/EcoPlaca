export type EstadoTransferencia = 'PENDIENTE' | 'EN_TRANSITO' | 'RECIBIDO' | 'CANCELADO' | 'COMPLETADA';
export interface SolicitarTransferenciaDTO { dispositivoId: number; motivo: string; centroDestinoId?: number | null; }
export interface Transferencia {
  id: number; dispositivoId: number; tecnicoId: number; centroOrigenId: number;
  centroDestinoId: number | null; motivo: string; estado: EstadoTransferencia;
  estadoDisponibilidad: 'RESERVADO';
}
export interface TransferenciaCompletada {
  id: number; dispositivoId: number; estado: 'COMPLETADA'; estadoDisponibilidad: 'ENTREGADO';
}

export interface OrdenTransferencia {
  id: number; dispositivoId: number; tecnicoId: number; tecnicoNombre: string;
  centroOrigenId: number; centroOrigenNombre: string; centroDestinoId: number | null;
  centroDestinoNombre: string | null; estado: EstadoTransferencia; motivo: string;
  fechaSolicitud: string; fechaCompletado: string | null;
  dispositivoTitulo: string; codigoTrazabilidad: string;
  estadoDisponibilidad: import('./dispositivo.model').EstadoDisponibilidad; pesoKg: number;
}
