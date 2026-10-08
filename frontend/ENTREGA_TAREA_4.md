# EcoPlaca — Tarea 4 implementada

Archivos creados o modificados directamente en C:\EcoPlaca. Incluye abajo el código completo y la ruta exacta de cada archivo.

## Comportamiento

- Catálogo público en /catalogo, con Signals, formularios reactivos, búsqueda con debounce de 350 ms y filtros combinados enviados a MySQL. switchMap cancela las consultas anteriores.
- Estado: DISPONIBLE, RESERVADO y ENTREGADO. Condición: Operativo, Repuestos y Chatarra.
- Compatibilidad con el esquema existente: Repuestos se envía como REPARABLE; Chatarra como DESGUACE_RECICLAJE. No se modificaron los ENUM de MySQL.
- Indicador de carga, mensaje de error con reintento y estado vacío. Se eliminó el inventario ficticio de respaldo.
- Solo TECHNICIAN puede abrir el diálogo de reserva. Motivo obligatorio de 1 a 255 caracteres, confirmación explícita, cancelar y bloqueo de envíos repetidos.
- La reserva usa POST /api/transferencias. Al confirmar la API se actualiza el dispositivo a RESERVADO y se consulta el catálogo para respetar los filtros activos. Si el filtro era DISPONIBLE, el dispositivo reservado sale de los resultados.
- En un conflicto 409 se muestra la indisponibilidad y se refresca el inventario. Los errores no se presentan como reservas exitosas.
- completarTransferencia usa PATCH /api/transferencias/:id/completar. El método está disponible en el servicio; esta tarea no agrega una pantalla de confirmación de entrega.
- Dashboard Standalone en /dashboard protegido por authGuard y roleGuard para ADMIN, DONOR y TECHNICIAN, acorde con la protección existente de GET /api/dashboard/metricas.
- Tres tarjetas: kg recuperados, kg CO₂ equivalente evitado y suma de transferencias activas y completadas. Activas = PENDIENTE + EN_TRANSITO; completadas = COMPLETADA. RECIBIDO y CANCELADO no se incluyen en ese total.
- Actualización manual, consulta cada 30 segundos y notificación local cuando TransferenciasService confirma una reserva o entrega. No usa WebSockets ni SSE; cambios de otros clientes se detectan en la siguiente consulta.
- Paleta #1B4965 y #2EC4B6; diseño adaptable a móviles. Diálogo nativo con foco modal, tecla Escape y etiquetas accesibles.
- Navbar con enlaces Catálogo y Dashboard. Si un visitante abre Dashboard, el guard lo dirige al login con returnUrl.

## Configuración

Se usa API_URL, el JWT y el proxy configurados en la Tarea 3. En desarrollo, /api se dirige a localhost:3000. En producción necesita reverse proxy bajo el mismo origen o un provider API_URL para otro dominio.

## Validación

Build de producción Angular aprobado.
Suite Angular en ChromeHeadless: 19 pruebas aprobadas.
Incluye filtros combinados, debounce, cancelación de consultas, motivo requerido, prevención de envío duplicado, actualización a RESERVADO, conflicto 409, bloqueo de donantes, errores de catálogo, cálculo de transferencias, actualización periódica y endpoint de entrega.
Pruebas con HTTP simulado; no se ejecutó el flujo contra MySQL real ni se desplegó la aplicación.

## Código completo

## frontend/src/app/models/transferencia.model.ts  ```typescript export type EstadoTransferencia = 'PENDIENTE' | 'EN_TRANSITO' | 'RECIBIDO' | 'CANCELADO' | 'COMPLETADA';
export interface SolicitarTransferenciaDTO { dispositivoId: number; motivo: string; centroDestinoId?: number | null; }
export interface Transferencia {
  id: number; dispositivoId: number; tecnicoId: number; centroOrigenId: number;
  centroDestinoId: number | null; motivo: string; estado: EstadoTransferencia;
  estadoDisponibilidad: 'RESERVADO';
}
export interface TransferenciaCompletada {
  id: number; dispositivoId: number; estado: 'COMPLETADA'; estadoDisponibilidad: 'ENTREGADO';
}
 ``` 
## frontend/src/app/models/dashboard.model.ts  ```typescript import { EstadoTransferencia } from './transferencia.model';
export interface DashboardMetricas {
  totalKgRecuperados: number;
  co2EvitadoKg: number;
  transferenciasPorEstado: Record<EstadoTransferencia, number>;
}
 ``` 
## frontend/src/app/services/transferencias.service.ts  ```typescript import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, map, tap } from 'rxjs';
import { API_URL } from '../config/api.config';
import { ApiResponse } from '../models/usuario.model';
import { SolicitarTransferenciaDTO, Transferencia, TransferenciaCompletada } from '../models/transferencia.model';
@Injectable({ providedIn: 'root' })
export class TransferenciasService {
  private readonly http = inject(HttpClient);
  private readonly url: string = inject(API_URL) + '/transferencias';
  private readonly cambios = new Subject<void>();
  readonly cambios$: Observable<void> = this.cambios.asObservable();
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
 ``` 
## frontend/src/app/services/dashboard.service.ts  ```typescript import { Injectable, inject } from '@angular/core';
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
 ``` 
## frontend/src/app/services/dispositivos.service.ts  ```typescript import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_URL } from '../config/api.config';
import { Dispositivo, EstadoDisponibilidad, EstadoFuncional } from '../models/dispositivo.model';
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
  getDispositivoById(id: number): Observable<DispositivoItem> {
    return this.http.get<ApiResponse<DispositivoItem>>(`${this.apiUrl}/${id}`).pipe(
      map((response: ApiResponse<DispositivoItem>): DispositivoItem => response.data));
  }
}
 ``` 
## frontend/src/app/components/galeria-imagenes/galeria-imagenes.component.ts  ```typescript import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, debounceTime, distinctUntilChanged, finalize, map, of, startWith, switchMap } from 'rxjs';
import { DispositivosService, FiltrosDispositivos } from '../../services/dispositivos.service';
import { TransferenciasService } from '../../services/transferencias.service';
import { AuthService } from '../../services/auth.service';
import { Dispositivo, EstadoDisponibilidad, EstadoFuncional } from '../../models/dispositivo.model';
import { Transferencia } from '../../models/transferencia.model';
import { errorMessage, nonBlank } from '../auth/auth-form.util';

@Component({
  selector: 'app-galeria-imagenes', standalone: true, imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './galeria-imagenes.component.html', styleUrls: ['./galeria-imagenes.component.css']
})
export class GaleriaImagenesComponent implements OnInit {
  private readonly service = inject(DispositivosService);
  private readonly transferencias = inject(TransferenciasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly refresh = new Subject<void>();
  readonly auth = inject(AuthService);
  readonly dispositivos = signal<Dispositivo[]>([]);
  readonly cargando = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly seleccionado = signal<Dispositivo | null>(null);
  readonly reservando = signal<boolean>(false);
  readonly errorReserva = signal<string | null>(null);
  readonly filtros = this.fb.nonNullable.group({
    busqueda: [''], estado: this.fb.nonNullable.control<EstadoDisponibilidad | ''>(''),
    estadoFuncional: this.fb.nonNullable.control<EstadoFuncional | ''>('')
  });
  readonly reservaForm = this.fb.nonNullable.group({
    motivo: ['', [nonBlank, Validators.maxLength(255)]]
  });
  @ViewChild('confirmacion', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;

  ngOnInit(): void {
    const controls = this.filtros.controls;
    combineLatest([
      controls.busqueda.valueChanges.pipe(map((value: string): string => value.trim()), debounceTime(350),
        distinctUntilChanged(), startWith('')),
      controls.estado.valueChanges.pipe(startWith(controls.estado.value)),
      controls.estadoFuncional.valueChanges.pipe(startWith(controls.estadoFuncional.value)),
      this.refresh.pipe(startWith(undefined))
    ]).pipe(
      switchMap(([busqueda, estado, estadoFuncional]) => {
        this.cargando.set(true); this.error.set(null);
        const filtros: FiltrosDispositivos = { busqueda, estado, estadoFuncional };
        return this.service.getDispositivos(filtros).pipe(
          catchError((error: unknown) => {
            this.error.set(errorMessage(error)); return of<Dispositivo[]>([]);
          }), finalize((): void => this.cargando.set(false))
        );
      }), takeUntilDestroyed(this.destroyRef)
    ).subscribe((devices: Dispositivo[]): void => this.dispositivos.set(devices));
  }

  reintentar(): void { this.refresh.next(); }
  condicion(estado: EstadoFuncional): string {
    const labels: Record<EstadoFuncional, string> = {
      OPERATIVO: 'Operativo', REPARABLE: 'Repuestos / reparable', DESGUACE_RECICLAJE: 'Chatarra / reciclaje'
    };
    return labels[estado];
  }
  abrirReserva(device: Dispositivo): void {
    if (!this.auth.hasRole(['TECHNICIAN']) || device.estadoDisponibilidad !== 'DISPONIBLE') return;
    this.seleccionado.set(device);
    this.errorReserva.set(null); this.aviso.set(null); this.reservaForm.reset();
    this.dialog.nativeElement.showModal();
  }
  cerrarReserva(): void {
    if (this.reservando()) return;
    this.dialog.nativeElement.close(); this.seleccionado.set(null);
  }
  cancelarDialogo(event: Event): void {
    if (this.reservando()) event.preventDefault();
    else this.cerrarReserva();
  }
  confirmarReserva(): void {
    if (this.reservando()) return;
    this.reservaForm.markAllAsTouched();
    const device: Dispositivo | null = this.seleccionado();
    if (!device || this.reservaForm.invalid || !this.auth.hasRole(['TECHNICIAN'])) return;
    this.reservando.set(true); this.errorReserva.set(null);
    this.transferencias.solicitarTransferencia({
      dispositivoId: device.id, motivo: this.reservaForm.controls.motivo.value.trim()
    }).pipe(
      takeUntilDestroyed(this.destroyRef), finalize((): void => this.reservando.set(false))
    ).subscribe({
      next: (order: Transferencia): void => {
        this.dispositivos.update((devices: Dispositivo[]): Dispositivo[] =>
          devices.map((item: Dispositivo): Dispositivo => item.id === order.dispositivoId
            ? { ...item, estadoDisponibilidad: 'RESERVADO' } : item));
        this.aviso.set('Transferencia solicitada. El dispositivo está RESERVADO.');
        this.dialog.nativeElement.close(); this.seleccionado.set(null);
        this.refresh.next();
      },
      error: (error: unknown): void => {
        this.errorReserva.set(errorMessage(error));
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.errorReserva.set('El dispositivo ya no está disponible. Se actualizó el catálogo.');
          this.refresh.next();
        }
      }
    });
  }
}
 ``` 
## frontend/src/app/components/galeria-imagenes/galeria-imagenes.component.html  ```html <section class="catalogo">
  <header><h1>Catálogo de dispositivos</h1><p>Hardware trazable para dar una segunda vida a los RAEE.</p></header>
  <form class="filtros" [formGroup]="filtros" (submit)="$event.preventDefault()">
    <label>Buscar<input type="search" formControlName="busqueda" placeholder="Título, marca o código"></label>
    <label>Estado<select formControlName="estado">
      <option value="">Todos</option><option value="DISPONIBLE">Disponible</option>
      <option value="RESERVADO">Reservado</option><option value="ENTREGADO">Entregado</option>
    </select></label>
    <label>Condición<select formControlName="estadoFuncional">
      <option value="">Todas</option><option value="OPERATIVO">Operativo</option>
      <option value="REPARABLE">Repuestos</option><option value="DESGUACE_RECICLAJE">Chatarra</option>
    </select></label>
  </form>
  @if (aviso()) { <p class="aviso" role="status">{{ aviso() }}</p> }
  @if (cargando()) {
    <div class="estado" role="status"><span class="spinner" aria-hidden="true"></span> Cargando dispositivos…</div>
  } @else if (error()) {
    <div class="estado error" role="alert"><p>{{ error() }}</p><button (click)="reintentar()">Reintentar</button></div>
  } @else if (dispositivos().length === 0) {
    <p class="estado">No hay dispositivos con estos filtros</p>
  } @else {
    <div class="grid">
      @for (d of dispositivos(); track d.id) {
        <article class="card">
          <div class="badges"><span>{{ d.codigoTrazabilidad }}</span><strong [class.reservado]="d.estadoDisponibilidad === 'RESERVADO'">{{ d.estadoDisponibilidad }}</strong></div>
          <div class="ilustracion" aria-hidden="true">♻</div>
          <p class="categoria">{{ d.categoriaNombre || 'Hardware RAEE' }}</p>
          <h2>{{ d.titulo }}</h2>
          <dl><dt>Marca / modelo</dt><dd>{{ d.marca || 'Sin marca' }} {{ d.modelo }}</dd>
            <dt>Condición</dt><dd>{{ condicion(d.estadoFuncional) }}</dd>
            <dt>Peso</dt><dd>{{ d.pesoKg | number:'1.2-2' }} kg</dd>
            <dt>CO₂ potencial evitado</dt><dd>{{ d.co2EvitadoKg | number:'1.2-2' }} kg</dd>
          </dl>
          @if (d.notas) { <p>{{ d.notas }}</p> }
          <footer><p>{{ d.centroAcopioNombre || 'Centro sin asignar' }}</p>
            @if (auth.hasRole(['TECHNICIAN'])) {
              <button (click)="abrirReserva(d)" [disabled]="d.estadoDisponibilidad !== 'DISPONIBLE' || reservando()">
                {{ d.estadoDisponibilidad === 'DISPONIBLE' ? 'Solicitar para Reparación' : 'No disponible' }}
              </button>
            }
          </footer>
        </article>
      }
    </div>
  }
</section>
<dialog #confirmacion aria-labelledby="reserva-title" (cancel)="cancelarDialogo($event)">
  <h2 id="reserva-title">Confirmar solicitud</h2>
  <p>{{ seleccionado()?.titulo }}</p><p>El dispositivo quedará reservado para ti al confirmar.</p>
  @if (errorReserva()) { <p class="error" role="alert">{{ errorReserva() }}</p> }
  <form [formGroup]="reservaForm" (ngSubmit)="confirmarReserva()" [attr.aria-busy]="reservando()">
    <label for="motivo">Motivo de la solicitud</label>
    <textarea id="motivo" formControlName="motivo" rows="4" maxlength="255" aria-describedby="motivo-error" autofocus></textarea>
    @if (reservaForm.controls.motivo.touched && reservaForm.controls.motivo.invalid) {
      <small id="motivo-error" class="error">Escribe un motivo de 1 a 255 caracteres.</small>
    }
    <div class="acciones"><button type="button" class="secundario" (click)="cerrarReserva()" [disabled]="reservando()">Cancelar</button>
      <button type="submit" [disabled]="reservando()">{{ reservando() ? 'Reservando…' : 'Confirmar solicitud' }}</button></div>
    @if (reservando()) { <p role="status">Guardando la reserva…</p> }
  </form>
</dialog>
 ``` 
## frontend/src/app/components/galeria-imagenes/galeria-imagenes.component.css  ```css :host{display:block;color:#1B4965}.catalogo{max-width:1200px;margin:auto;padding:2rem 1rem}h1{font-size:2rem;margin:0}header p{color:#526775}.filtros{display:grid;grid-template-columns:2fr 1fr 1fr;gap:1rem;margin:1.5rem 0;background:#f0f7fa;padding:1rem;border-radius:12px}label{display:block;font-weight:600}input,select,textarea{box-sizing:border-box;width:100%;padding:.75rem;margin-top:.4rem;border:1px solid #859ba8;border-radius:6px;font:inherit;background:white;color:#1B4965}input:focus,select:focus,textarea:focus,button:focus-visible{outline:2px solid #2EC4B6;outline-offset:2px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:1.25rem}.card{border:1px solid #dce7ec;border-radius:14px;padding:1.2rem;box-shadow:0 6px 18px #1b49650d;display:flex;flex-direction:column;background:white;overflow-wrap:anywhere}.badges{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem;font-size:.75rem}.badges strong{background:#d2f4ef;border-radius:20px;padding:.3rem .6rem}.badges .reservado{background:#fff0c2}.ilustracion{text-align:center;font-size:4rem;background:#edf8f6;border-radius:10px;color:#1B4965;margin-top:1rem}.categoria{color:#526775;font-size:.85rem}h2{font-size:1.2rem}dl{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;font-size:.9rem}dt{font-weight:600}dd{margin:0}footer{margin-top:auto}footer p{font-size:.85rem}button{background:#1B4965;color:white;border:0;border-bottom:3px solid #2EC4B6;border-radius:6px;padding:.8rem 1rem;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.estado{text-align:center;padding:3rem 1rem;background:#f3f8fa;border-radius:12px}.error{color:#b42318}.aviso{background:#d2f4ef;padding:1rem;border-radius:8px}.spinner{display:inline-block;width:24px;height:24px;border:3px solid #c3dce6;border-top-color:#1B4965;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:.6rem}@keyframes spin{to{transform:rotate(360deg)}}dialog{border:0;border-radius:14px;padding:1.5rem;color:#1B4965;width:min(460px,calc(100vw - 5rem));box-shadow:0 15px 60px #0003}dialog::backdrop{background:#1b496599}.acciones{display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem}.secundario{background:#eaf1f5;color:#1B4965}small.error{display:block;margin-top:.4rem}@media(max-width:640px){.filtros{grid-template-columns:1fr}.catalogo{padding:1rem}.acciones{flex-direction:column}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
 ``` 
## frontend/src/app/components/dashboard/dashboard.component.ts  ```typescript import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, finalize, merge, of, switchMap, timer } from 'rxjs';
import { DashboardService } from '../../services/dashboard.service';
import { TransferenciasService } from '../../services/transferencias.service';
import { DashboardMetricas } from '../../models/dashboard.model';
import { errorMessage } from '../auth/auth-form.util';
@Component({
  selector: 'app-dashboard', standalone: true, imports: [CommonModule],
  templateUrl: './dashboard.component.html', styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private readonly service = inject(DashboardService);
  private readonly transferencias = inject(TransferenciasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh = new Subject<void>();
  readonly metricas = signal<DashboardMetricas | null>(null);
  readonly cargando = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly actualizado = signal<Date | null>(null);
  readonly activas = computed<number>(() => {
    const states = this.metricas()?.transferenciasPorEstado;
    return states ? states.PENDIENTE + states.EN_TRANSITO : 0;
  });
  readonly completadas = computed<number>(() => this.metricas()?.transferenciasPorEstado.COMPLETADA ?? 0);
  readonly totalTransferencias = computed<number>(() => this.activas() + this.completadas());
  ngOnInit(): void {
    merge(timer(0, 30000), this.refresh, this.transferencias.cambios$).pipe(
      switchMap(() => {
        this.cargando.set(true); this.error.set(null);
        return this.service.getMetricas().pipe(
          catchError((error: unknown) => { this.error.set(errorMessage(error)); return of(null); }),
          finalize((): void => this.cargando.set(false))
        );
      }), takeUntilDestroyed(this.destroyRef)
    ).subscribe((metrics: DashboardMetricas | null): void => {
      if (metrics) { this.metricas.set(metrics); this.actualizado.set(new Date()); }
    });
  }
  actualizar(): void { this.refresh.next(); }
}
 ``` 
## frontend/src/app/components/dashboard/dashboard.component.html  ```html <section class="dashboard">
  <header><div><h1>Impacto ambiental</h1><p>Resultados reales del hardware recuperado.</p></div>
    <button (click)="actualizar()" [disabled]="cargando()">Actualizar métricas</button></header>
  @if (cargando()) { <p role="status"><span class="spinner" aria-hidden="true"></span> Actualizando métricas…</p> }
  @if (error()) { <p class="error" role="alert">{{ error() }} Usa “Actualizar métricas” para reintentar.</p> }
  @if (metricas(); as m) {
    <div class="metricas">
      <article><p>RAEE rescatado</p><strong>{{ m.totalKgRecuperados | number:'1.2-2' }} <span>kg</span></strong><small>Dispositivos entregados o reciclados</small></article>
      <article><p>CO₂ equivalente evitado</p><strong>{{ m.co2EvitadoKg | number:'1.2-2' }} <span>kg</span></strong><small>Estimación según la categoría del hardware</small></article>
      <article><p>Transferencias activas y completadas</p><strong>{{ totalTransferencias() | number:'1.0-0' }}</strong><small>{{ activas() }} activas · {{ completadas() }} completadas</small></article>
    </div>
    <p class="actualizado">Última actualización: {{ actualizado() | date:'short' }}. Consulta automática cada 30 segundos.</p>
    @if (error()) { <p>Se muestran los últimos datos obtenidos correctamente.</p> }
  }
</section>
 ``` 
## frontend/src/app/components/dashboard/dashboard.component.css  ```css :host{display:block;color:#1B4965}.dashboard{max-width:1200px;margin:auto;padding:2rem 1rem}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:2rem}h1{font-size:2rem;margin:0}header p{color:#526775}.metricas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.2rem}article{background:white;border:1px solid #dce7ec;border-top:5px solid #2EC4B6;padding:1.5rem;border-radius:12px;box-shadow:0 8px 24px #1b496510}article p{font-weight:600;min-height:2.5rem}strong{font-size:clamp(1.8rem,3vw,2.5rem);display:block;overflow-wrap:anywhere}strong span{font-size:1rem}small{display:block;color:#526775;margin-top:1rem}.actualizado{font-size:.85rem;margin-top:1.5rem;color:#526775}button{padding:.8rem 1rem;background:#1B4965;color:white;border:0;border-bottom:3px solid #2EC4B6;border-radius:6px;cursor:pointer;font:inherit}button:disabled{opacity:.6}button:focus-visible{outline:2px solid #2EC4B6;outline-offset:3px}.error{background:#fff1f0;color:#b42318;padding:1rem;border-radius:8px}.spinner{display:inline-block;width:18px;height:18px;border:3px solid #c3dce6;border-top-color:#1B4965;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:760px){.metricas{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}.dashboard{padding:1rem}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
 ``` 
## frontend/src/app/models/dispositivo.model.ts  ```typescript export type EstadoFuncional = 'OPERATIVO' | 'REPARABLE' | 'DESGUACE_RECICLAJE';
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
 ``` 
## frontend/src/app/app.routes.ts  ```typescript import { Routes } from '@angular/router';
import { GaleriaImagenesComponent } from './components/galeria-imagenes/galeria-imagenes.component';
import { ComentariosComponent } from './components/comentarios/comentarios.component';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'catalogo' },
  { path: 'catalogo', component: GaleriaImagenesComponent },
  { path: 'galeria', pathMatch: 'full', redirectTo: 'catalogo' },
  { path: 'login', loadComponent: () => import('./components/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./components/auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'dashboard', canActivate: [authGuard, roleGuard], data: { roles: ['ADMIN', 'DONOR', 'TECHNICIAN'] },
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'comentarios', component: ComentariosComponent, canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMIN', 'TECHNICIAN'] } },
  { path: '**', loadComponent: () => import('./components/not-found/not-found.component').then(m => m.NotFoundComponent) }
];
 ``` 
## frontend/src/app/components/navbar/navbar.component.html  ```html <header class="eco-navbar-wrapper"><div class="eco-nav-container">
  <a routerLink="/catalogo" class="eco-brand" (click)="closeMenu()">
    <div class="logo-icon">🌿</div><div class="brand-text">
      <span class="brand-name">Eco<span class="accent">Placa</span></span>
      <span class="brand-tagline">Trazabilidad RAEE</span>
    </div>
  </a>
  <button class="mobile-toggle" (click)="toggleMenu()" aria-label="Abrir menú" [attr.aria-expanded]="isMenuOpen()">
    <span class="bar"></span><span class="bar"></span><span class="bar"></span>
  </button>
  <nav class="nav-links" [class.open]="isMenuOpen()">
    <a routerLink="/catalogo" routerLinkActive="active" (click)="closeMenu()">Catálogo</a>
    <a routerLink="/dashboard" routerLinkActive="active" (click)="closeMenu()">Dashboard</a>
    @if (auth.hasRole(['ADMIN', 'TECHNICIAN'])) {
      <a routerLink="/comentarios" routerLinkActive="active" (click)="closeMenu()">Comentarios y notas</a>
    }
    @if (auth.isAuthenticated()) {
      <div class="user-badge"><span class="status-indicator"></span>
        <span class="user-role">{{ auth.currentUser()?.nombreCompleto }} · {{ auth.currentUser()?.rol }}</span>
      </div>
      <button type="button" (click)="logout()">Cerrar sesión</button>
    } @else {
      <a routerLink="/login" routerLinkActive="active" (click)="closeMenu()">Iniciar sesión</a>
      <a routerLink="/register" routerLinkActive="active" (click)="closeMenu()">Registro</a>
    }
  </nav>
</div></header>
 ``` 
## frontend/src/app/components/galeria-imagenes/galeria-imagenes.component.spec.ts  ```typescript import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GaleriaImagenesComponent } from './galeria-imagenes.component';
import { AuthService } from '../../services/auth.service';
import { Dispositivo } from '../../models/dispositivo.model';
describe('Reactive catalogue and reservation', () => {
  let fixture: ComponentFixture<GaleriaImagenesComponent>;
  let component: GaleriaImagenesComponent;
  let http: HttpTestingController;
  let authorized: boolean;
  const device: Dispositivo = { id: 2, titulo: 'Fuente EVGA', codigoTrazabilidad: 'RAEE-2',
    estadoFuncional: 'OPERATIVO', estadoDisponibilidad: 'DISPONIBLE', pesoKg: 1.6, co2EvitadoKg: 29.12 };
  beforeEach(async () => {
    authorized = true;
    await TestBed.configureTestingModule({ imports: [GaleriaImagenesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { hasRole: (): boolean => authorized } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GaleriaImagenesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/dispositivos').flush({ success: true, data: [device] });
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('debounces search, sends combined filters and cancels obsolete queries', fakeAsync(() => {
    component.filtros.controls.busqueda.setValue('EVGA');
    tick(349); http.expectNone(request => request.params.has('busqueda'));
    tick(1);
    const old = http.expectOne(request => request.params.get('busqueda') === 'EVGA');
    component.filtros.controls.estado.setValue('DISPONIBLE');
    expect(old.cancelled).toBeTrue();
    const filtered = http.expectOne(request => request.params.get('busqueda') === 'EVGA'
      && request.params.get('estado') === 'DISPONIBLE');
    filtered.flush({ success: true, data: [device] });
    component.filtros.controls.estadoFuncional.setValue('REPARABLE');
    http.expectOne(request => request.params.get('estadoFuncional') === 'REPARABLE')
      .flush({ success: true, data: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay dispositivos con estos filtros');
  }));
  it('requires confirmation with a motive and prevents duplicate submission', () => {
    component.abrirReserva(device);
    component.confirmarReserva();
    http.expectNone('/api/transferencias');
    component.reservaForm.controls.motivo.setValue('Reparación educativa');
    component.confirmarReserva(); component.confirmarReserva();
    const request = http.expectOne('/api/transferencias');
    expect(request.request.body).toEqual({ dispositivoId: 2, motivo: 'Reparación educativa' });
    expect(component.reservando()).toBeTrue();
    request.flush({ success: true, data: { id: 4, dispositivoId: 2, estado: 'PENDIENTE',
      estadoDisponibilidad: 'RESERVADO' } });
    expect(component.dispositivos()[0].estadoDisponibilidad).toBe('RESERVADO');
    expect(component.seleccionado()).toBeNull();
    http.expectOne('/api/dispositivos').flush({ success: true, data: [{ ...device, estadoDisponibilidad: 'RESERVADO' }] });
    expect(component.reservando()).toBeFalse();
  });
  it('refreshes a concurrent reservation conflict without pretending success', () => {
    component.abrirReserva(device);
    component.reservaForm.controls.motivo.setValue('Reparación');
    component.confirmarReserva();
    http.expectOne('/api/transferencias').flush({ error: 'No disponible' }, { status: 409, statusText: 'Conflict' });
    expect(component.errorReserva()).toContain('ya no está disponible');
    http.expectOne('/api/dispositivos').flush({ success: true, data: [] });
    expect(component.aviso()).toBeNull();
  });
  it('blocks donors from opening or submitting the reservation', () => {
    authorized = false;
    component.abrirReserva(device);
    expect(component.seleccionado()).toBeNull();
    component.confirmarReserva();
    http.expectNone('/api/transferencias');
  });
  it('shows real API failures instead of demo inventory', () => {
    component.reintentar();
    http.expectOne('/api/dispositivos').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.error()).toBeTruthy();
    expect(component.dispositivos()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });
});
 ``` 
## frontend/src/app/components/dashboard/dashboard.component.spec.ts  ```typescript import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';
describe('Environmental dashboard', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let http: HttpTestingController;
  const metrics = { totalKgRecuperados: 1.6, co2EvitadoKg: 29.12, transferenciasPorEstado:
    { PENDIENTE: 2, EN_TRANSITO: 3, COMPLETADA: 4, CANCELADO: 8, RECIBIDO: 1 } };
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardComponent);
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('calculates active and completed totals without counting cancelled or legacy received orders', fakeAsync(() => {
    fixture.detectChanges(); tick(0);
    http.expectOne('/api/dashboard/metricas').flush({ success: true, data: metrics });
    expect(fixture.componentInstance.activas()).toBe(5);
    expect(fixture.componentInstance.completadas()).toBe(4);
    expect(fixture.componentInstance.totalTransferencias()).toBe(9);
    tick(30000);
    http.expectOne('/api/dashboard/metricas').flush({ success: true, data: { ...metrics, totalKgRecuperados: 2 } });
    expect(fixture.componentInstance.metricas()?.totalKgRecuperados).toBe(2);
    fixture.destroy();
  }));
  it('keeps the last successful data and reports refresh errors', fakeAsync(() => {
    fixture.detectChanges(); tick(0);
    http.expectOne('/api/dashboard/metricas').flush({ success: true, data: metrics });
    fixture.componentInstance.actualizar();
    http.expectOne('/api/dashboard/metricas').flush({}, { status: 500, statusText: 'Server Error' });
    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.metricas()).toEqual(metrics);
    fixture.destroy();
  }));
});
 ``` 
## frontend/src/app/services/transferencias.service.spec.ts  ```typescript import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TransferenciasService } from './transferencias.service';
describe('TransferenciasService', () => {
  it('uses the completion endpoint and emits a refresh event only after success', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(TransferenciasService);
    let events = 0;
    service.cambios$.subscribe(() => events++);
    service.completarTransferencia(7).subscribe();
    expect(events).toBe(0);
    const request = http.expectOne('/api/transferencias/7/completar');
    expect(request.request.method).toBe('PATCH');
    request.flush({ success: true, data: { id: 7, dispositivoId: 2, estado: 'COMPLETADA', estadoDisponibilidad: 'ENTREGADO' } });
    expect(events).toBe(1);
    http.verify();
  });
});
 ``` 