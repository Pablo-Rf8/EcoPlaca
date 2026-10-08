import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
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
