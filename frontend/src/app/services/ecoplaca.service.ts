import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface ComponentItem {
  id: number;
  trackingCode: string;
  title: string;
  categoryId: number;
  categoryName?: string;
  donorName?: string;
  assignedWorkshopName?: string;
  brand?: string;
  model?: string;
  conditionState: 'FUNCTIONAL' | 'REPAIRABLE' | 'SCRAP_RECYCLING';
  status: 'AVAILABLE' | 'RESERVED' | 'IN_REPAIR' | 'REUSED' | 'RECYCLED';
  weightKg: number;
  co2SavedKg: number;
  location?: string;
  notes?: string;
}

export interface ImpactSummary {
  totalRescuedComponents: number;
  totalDivertedLandfillKg: number;
  totalCo2AvoidedKg: number;
  activeAvailableComponents: number;
  reservedComponents: number;
  circularizedComponents: number;
  tangibles: {
    treesEquivalent: number;
    carKmEquivalent: number;
    smartphoneCharges: number;
  };
  lastUpdated: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EcoPlacaService {
  private http = inject(HttpClient);

  // Obtener resumen de impacto ambiental en tiempo real
  getImpactSummary(): Observable<ImpactSummary> {
    return this.http.get<ApiResponse<ImpactSummary>>('/impact/summary').pipe(
      map(res => res.data)
    );
  }

  // Obtener listado de componentes catalogados
  getComponents(status?: string, condition?: string): Observable<ComponentItem[]> {
    let url = '/components';
    const params: string[] = [];
    if (status) params.push(`status=${status}`);
    if (condition) params.push(`condition=${condition}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    return this.http.get<ApiResponse<ComponentItem[]>>(url).pipe(
      map(res => res.data)
    );
  }

  // Reservar componente
  reserveComponent(componentId: number, intendedUse: string = 'REFURBISHMENT', notes: string = ''): Observable<unknown> {
    return this.http.post<ApiResponse<unknown>>('/reservations', {
      componentId,
      requesterId: 3, // ID de taller técnico demo
      intendedUse,
      notes
    }).pipe(
      map(res => res.data)
    );
  }
}
