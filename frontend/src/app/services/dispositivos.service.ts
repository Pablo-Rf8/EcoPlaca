import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_URL } from '../config/api.config';
import { Dispositivo, EstadoDisponibilidad, EstadoFuncional, CrearDispositivoDTO, OpcionesPublicacion } from '../models/dispositivo.model';
export type DispositivoItem = Dispositivo;
export interface ApiResponse<T> { success: boolean; data: T; meta?: Record<string, unknown>; error?: string; }
export interface FiltrosDispositivos {
  busqueda?: string;
  estado?: EstadoDisponibilidad | '';
  estadoFuncional?: EstadoFuncional | '';
}
@Injectable({ providedIn: 'root' })
export class DispositivosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl: string = inject(API_URL) + '/dispositivos';
  getDispositivos(filtros: FiltrosDispositivos | string = {}): Observable<DispositivoItem[]> {
    const values: FiltrosDispositivos = typeof filtros === 'string'
      ? { estado: filtros === 'TODOS' ? '' : filtros as EstadoDisponibilidad } : filtros;
    let params: HttpParams = new HttpParams();
    if (values.busqueda?.trim()) params = params.set('busqueda', values.busqueda.trim());
    if (values.estado) params = params.set('estado', values.estado);
    if (values.estadoFuncional) params = params.set('estadoFuncional', values.estadoFuncional);
    return this.http.get<ApiResponse<DispositivoItem[]>>(this.apiUrl, { params }).pipe(
      map((response: ApiResponse<DispositivoItem[]>): DispositivoItem[] => {
        if (!response.success || !Array.isArray(response.data)) throw new Error('Respuesta del catálogo inválida');
        return response.data;
      })
    );
  }
  crearDispositivo(dto: CrearDispositivoDTO): Observable<Dispositivo> {
    return this.http.post<ApiResponse<Dispositivo>>(this.apiUrl, dto).pipe(
      map((response: ApiResponse<Dispositivo>): Dispositivo => {
        if (!response.success || !response.data) throw new Error('Respuesta de publicación inválida');
        return response.data;
      }));
  }
  getOpcionesPublicacion(): Observable<OpcionesPublicacion> {
    return this.http.get<ApiResponse<OpcionesPublicacion>>(this.apiUrl + '/opciones-publicacion').pipe(
      map((response: ApiResponse<OpcionesPublicacion>): OpcionesPublicacion => {
        if (!response.success || !response.data) throw new Error('No se pudieron cargar las opciones');
        return response.data;
      }));
  }
  getDispositivoById(id: number): Observable<DispositivoItem> {
    return this.http.get<ApiResponse<DispositivoItem>>(`${this.apiUrl}/${id}`).pipe(
      map((response: ApiResponse<DispositivoItem>): DispositivoItem => response.data));
  }
}
