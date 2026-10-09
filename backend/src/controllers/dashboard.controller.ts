import { NextFunction, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { EstadoTransferencia } from '../models/transferencia.model';
import { sendSuccess } from '../utils/response.util';

interface MetricaRow extends RowDataPacket {
  tipo: 'RAEE' | 'TRANSFERENCIA';
  clave: string;
  valor: string | number;
  co2EvitadoKg: string | number | null;
}

export async function getMetricas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Una sola sentencia obtiene métricas coherentes sin multiplicar pesos por órdenes.
    const [rows] = await pool.execute<MetricaRow[]>(
      `SELECT 'RAEE' AS tipo, c.codigo AS clave, SUM(d.peso_kg) AS valor, SUM(d.co2_evitado_kg) AS co2EvitadoKg
       FROM dispositivos d JOIN categorias_raee c ON c.id = d.categoria_id
       WHERE d.estado_disponibilidad IN ('ENTREGADO', 'RECICLADO') GROUP BY c.id, c.codigo
       UNION ALL
       SELECT 'TRANSFERENCIA' AS tipo, estado AS clave, COUNT(*) AS valor, NULL AS co2EvitadoKg
       FROM ordenes_transferencia GROUP BY estado`
    );
    let totalKgRecuperados: number = 0;
    let co2EvitadoKg: number = 0;
    const transferenciasPorEstado: Record<EstadoTransferencia, number> = {
      PENDIENTE: 0, EN_TRANSITO: 0, RECIBIDO: 0, CANCELADO: 0, COMPLETADA: 0
    };
    for (const row of rows) {
      const value: number = Number(row.valor);
      if (row.tipo === 'RAEE') {
        totalKgRecuperados += value;
        co2EvitadoKg += Number(row.co2EvitadoKg);
      } else if (Object.prototype.hasOwnProperty.call(transferenciasPorEstado, row.clave)) {
        transferenciasPorEstado[row.clave as EstadoTransferencia] = value;
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, { totalKgRecuperados: Math.round(totalKgRecuperados * 100) / 100,
      co2EvitadoKg: Math.round(co2EvitadoKg * 100) / 100, transferenciasPorEstado });
  } catch (error: unknown) {
    next(error);
  }
}
