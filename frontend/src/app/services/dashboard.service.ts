import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_URL } from '../config/api.config';
import { ApiResponse } from '../models/usuario.model';
import { DashboardMetricas } from '../models/dashboard.model';
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly url: string = inject(API_URL) + '/dashboard/metricas';
  getMetricas(): Observable<DashboardMetricas> {
    return this.http.get<ApiResponse<DashboardMetricas>>(this.url).pipe(
      map((response: ApiResponse<DashboardMetricas>): DashboardMetricas => {
        if (!response.success || !response.data) throw new Error('Respuesta de métricas inválida');
        return response.data;
      })
    );
  }
}
