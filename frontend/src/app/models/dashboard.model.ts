import { EstadoTransferencia } from './transferencia.model';
export interface DashboardMetricas {
  totalKgRecuperados: number;
  co2EvitadoKg: number;
  transferenciasPorEstado: Record<EstadoTransferencia, number>;
}
