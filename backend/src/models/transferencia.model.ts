export type EstadoTransferencia =
  | 'PENDIENTE' | 'EN_TRANSITO' | 'RECIBIDO' | 'CANCELADO' | 'COMPLETADA';

export interface Transferencia {
  id: number;
  dispositivoId: number;
  tecnicoId: number;
  centroOrigenId: number;
  centroDestinoId: number | null;
  estado: EstadoTransferencia;
  motivo: string;
  fechaSolicitud: Date;
  fechaCompletado: Date | null;
}

export interface SolicitarTransferenciaDTO {
  dispositivoId: number;
  centroDestinoId?: number | null;
  motivo: string;
}
