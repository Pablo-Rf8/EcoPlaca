import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
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
  limpiarFiltros(): void { this.filtros.reset(); }
  disponibilidad(estado: EstadoDisponibilidad): string {
    const labels: Record<EstadoDisponibilidad, string> = {
      DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', ASIGNADO: 'Asignado',
      ENTREGADO: 'Entregado', RECICLADO: 'Reciclado'
    };
    return labels[estado];
  }
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
