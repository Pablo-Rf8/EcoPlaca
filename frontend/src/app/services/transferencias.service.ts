import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, map, tap } from 'rxjs';
import { API_URL } from '../config/api.config';
import { ApiResponse } from '../models/usuario.model';
import { SolicitarTransferenciaDTO, Transferencia, TransferenciaCompletada, OrdenTransferencia } from '../models/transferencia.model';
@Injectable({ providedIn: 'root' })
export class TransferenciasService {
  private readonly http = inject(HttpClient);
  private readonly url: string = inject(API_URL) + '/transferencias';
  private readonly cambios = new Subject<void>();
  readonly cambios$: Observable<void> = this.cambios.asObservable();
  getMisOrdenes(): Observable<OrdenTransferencia[]> {
    return this.http.get<ApiResponse<OrdenTransferencia[]>>(this.url + '/mis-ordenes').pipe(
      map((response: ApiResponse<OrdenTransferencia[]>): OrdenTransferencia[] => {
        if (!response.success || !Array.isArray(response.data)) throw new Error('Respuesta de órdenes inválida');
        return response.data;
      }));
  }
  solicitarTransferencia(dto: SolicitarTransferenciaDTO): Observable<Transferencia> {
    return this.http.post<ApiResponse<Transferencia>>(this.url, dto).pipe(
      map((response: ApiResponse<Transferencia>): Transferencia => {
        if (!response.success || !response.data) throw new Error('Respuesta de transferencia inválida');
        return response.data;
      }), tap((): void => this.cambios.next())
    );
  }
  completarTransferencia(id: number): Observable<TransferenciaCompletada> {
    return this.http.patch<ApiResponse<TransferenciaCompletada>>(`${this.url}/${id}/completar`, {}).pipe(
      map((response: ApiResponse<TransferenciaCompletada>): TransferenciaCompletada => {
        if (!response.success || !response.data) throw new Error('Respuesta de entrega inválida');
        return response.data;
      }), tap((): void => this.cambios.next())
    );
  }
}
