import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Dispositivo } from '../models/dispositivo.model';

export type DispositivoItem = Dispositivo;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DispositivosService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api/dispositivos';

  // Obtener dispositivos catalogados
  getDispositivos(estado?: string): Observable<DispositivoItem[]> {
    let url = this.apiUrl;
    if (estado && estado !== 'TODOS') {
      url += `?estado=${estado}`;
    }
    return this.http.get<ApiResponse<DispositivoItem[]>>(url).pipe(
      map(res => res.data)
    );
  }

  // Obtener dispositivo por ID
  getDispositivoById(id: number): Observable<DispositivoItem> {
    return this.http.get<ApiResponse<DispositivoItem>>(`${this.apiUrl}/${id}`).pipe(
      map(res => res.data)
    );
  }
}
