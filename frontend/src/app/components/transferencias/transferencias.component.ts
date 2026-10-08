import { Component, DestroyRef, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { TransferenciasService } from '../../services/transferencias.service';
import { OrdenTransferencia, TransferenciaCompletada } from '../../models/transferencia.model';
import { errorMessage } from '../auth/auth-form.util';
@Component({
  selector: 'app-transferencias', standalone: true, imports: [CommonModule],
  templateUrl: './transferencias.component.html', styleUrls: ['./transferencias.component.css']
})
export class TransferenciasComponent implements OnInit {
  private readonly service = inject(TransferenciasService);
  private readonly destroyRef = inject(DestroyRef);
  readonly ordenes = signal<OrdenTransferencia[]>([]);
  readonly activas = computed<OrdenTransferencia[]>(() =>
    this.ordenes().filter(o => o.estado === 'PENDIENTE' || o.estado === 'EN_TRANSITO'));
  readonly cargando = signal<boolean>(true);
  readonly confirmando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly errorConfirmacion = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly seleccionada = signal<OrdenTransferencia | null>(null);
  @ViewChild('confirmacion', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;
  ngOnInit(): void { this.cargar(); }
  cargar(): void {
    if (this.confirmando() || (this.cargando() && this.ordenes().length > 0)) return;
    this.cargando.set(true); this.error.set(null);
    this.service.getMisOrdenes().pipe(takeUntilDestroyed(this.destroyRef),
      finalize((): void => this.cargando.set(false))).subscribe({
      next: (orders: OrdenTransferencia[]): void => this.ordenes.set(orders),
      error: (error: unknown): void => this.error.set(errorMessage(error))
    });
  }
  abrirConfirmacion(order: OrdenTransferencia): void {
    if (this.confirmando() || !['PENDIENTE', 'EN_TRANSITO'].includes(order.estado)) return;
    this.seleccionada.set(order); this.errorConfirmacion.set(null);
    this.dialog.nativeElement.showModal();
  }
  cerrar(): void {
    if (this.confirmando()) return;
    this.dialog.nativeElement.close(); this.seleccionada.set(null);
  }
  cancelar(event: Event): void { if (this.confirmando()) event.preventDefault(); else this.cerrar(); }
  confirmar(): void {
    const order = this.seleccionada();
    if (!order || this.confirmando()) return;
    this.confirmando.set(true); this.errorConfirmacion.set(null);
    this.service.completarTransferencia(order.id).pipe(takeUntilDestroyed(this.destroyRef),
      finalize((): void => this.confirmando.set(false))).subscribe({
      next: (result: TransferenciaCompletada): void => {
        this.ordenes.update((orders: OrdenTransferencia[]): OrdenTransferencia[] => orders.map(o =>
          o.id === result.id ? { ...o, estado: result.estado, estadoDisponibilidad: result.estadoDisponibilidad,
            fechaCompletado: new Date().toISOString() } : o));
        this.aviso.set('Recepción física confirmada. Orden COMPLETADA y dispositivo ENTREGADO. El impacto ambiental se actualizará en el dashboard.');
        this.dialog.nativeElement.close(); this.seleccionada.set(null);
      },
      error: (error: unknown): void => {
        this.errorConfirmacion.set(error instanceof HttpErrorResponse && error.status === 409
          ? 'La orden ya cambió de estado. Cierra este diálogo y actualiza el listado.'
          : errorMessage(error));
      }
    });
  }
}
