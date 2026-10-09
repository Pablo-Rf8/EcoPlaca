import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DispositivosService } from '../../services/dispositivos.service';
import { NotificationService } from '../../services/notification.service';
import { CategoriaRAEE, CentroPublicacion, CrearDispositivoDTO, EstadoFuncional, OpcionesPublicacion } from '../../models/dispositivo.model';
import { errorMessage } from '../auth/auth-form.util';

const tituloValido: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value: string = typeof control.value === 'string' ? control.value.trim() : '';
  return value.length >= 3 && value.length <= 150 ? null : { titulo: true };
};
const pesoValido: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value: unknown = control.value;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 9999.99
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001 ? null : { peso: true };
};
@Component({
  selector: 'app-dispositivo-form', standalone: true, imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dispositivo-form.component.html', styleUrls: ['./dispositivo-form.component.css']
})
export class DispositivoFormComponent implements OnInit {
  private readonly service = inject(DispositivosService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  readonly categorias = signal<CategoriaRAEE[]>([]);
  readonly centros = signal<CentroPublicacion[]>([]);
  private readonly categoriaElegida = signal<number>(0);
  readonly centrosDisponibles = computed<CentroPublicacion[]>(() =>
    this.centros().filter((center: CentroPublicacion): boolean => center.categoriaId === this.categoriaElegida()));
  readonly cargando = signal<boolean>(true);
  readonly opcionesCargadas = signal<boolean>(false);
  readonly enviando = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    titulo: ['', [tituloValido]], categoriaId: [0, [Validators.required, Validators.min(1)]],
    centroAcopioId: [0, [Validators.required, Validators.min(1)]],
    marca: ['', [Validators.maxLength(100)]], modelo: ['', [Validators.maxLength(100)]],
    numeroSerie: ['', [Validators.maxLength(100)]],
    estadoFuncional: this.fb.nonNullable.control<EstadoFuncional>('REPARABLE', [Validators.required]),
    pesoKg: this.fb.control<number | null>(null, [Validators.required, pesoValido]),
    notas: ['', [Validators.maxLength(5000)]]
  });
  ngOnInit(): void {
    this.form.controls.categoriaId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id: number): void => {
        this.categoriaElegida.set(id);
        const centers = this.centrosDisponibles();
        this.form.controls.centroAcopioId.setValue(centers.length === 1 ? centers[0].id : 0);
      });
    this.cargarOpciones();
  }
  cargarOpciones(): void {
    if (this.enviando()) return;
    this.cargando.set(true); this.error.set(null); this.opcionesCargadas.set(false);
    this.service.getOpcionesPublicacion().pipe(takeUntilDestroyed(this.destroyRef),
      finalize((): void => this.cargando.set(false))).subscribe({
      next: (options: OpcionesPublicacion): void => {
        this.categorias.set(options.categorias); this.centros.set(options.centros);
        this.opcionesCargadas.set(true);
        this.categoriaElegida.set(this.form.controls.categoriaId.value);
        const centers = this.centrosDisponibles();
        if (!centers.some(c => c.id === this.form.controls.centroAcopioId.value)) {
          this.form.controls.centroAcopioId.setValue(centers.length === 1 ? centers[0].id : 0);
        }
      }, error: (error: unknown): void => this.error.set(errorMessage(error))
    });
  }
  submit(): void {
    if (this.enviando() || this.cargando() || !this.opcionesCargadas()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Revisa los campos obligatorios: título, categoría, centro y peso en kg.');
      return;
    }
    const value = this.form.getRawValue();
    if (value.pesoKg === null || !this.categorias().some(c => c.id === value.categoriaId)
        || !this.centrosDisponibles().some(c => c.id === value.centroAcopioId)) {
      this.error.set('Selecciona una categoría y un centro disponibles.'); return;
    }
    const dto: CrearDispositivoDTO = { ...value, titulo: value.titulo.trim(), pesoKg: value.pesoKg,
      marca: value.marca.trim(), modelo: value.modelo.trim(), numeroSerie: value.numeroSerie.trim(), notas: value.notas.trim() };
    this.enviando.set(true); this.error.set(null);
    this.service.crearDispositivo(dto).pipe(takeUntilDestroyed(this.destroyRef),
      finalize((): void => this.enviando.set(false))).subscribe({
      next: (): void => {
        this.notifications.alert('Hardware publicado correctamente. Ya está disponible en el catálogo.');
        void this.router.navigate(['/catalogo']);
      }, error: (error: unknown): void => this.error.set(errorMessage(error))
    });
  }
}
