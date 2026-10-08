# EcoPlaca — Tarea 5 implementada

Se crearon y modificaron los archivos directamente en C:\EcoPlaca. El código completo aparece abajo con su ruta exacta.

## Pantallas y endpoints

- /nuevo-dispositivo: Standalone con ReactiveForms y guards DONOR/ADMIN. Título de 3 a 150 caracteres tras quitar espacios; categoría, centro compatible y condición obligatorios; peso positivo hasta 9999.99 kg con 2 decimales (compatible con DECIMAL(6,2)); marca/modelo/serie hasta 100 caracteres; notas hasta 5000.
- GET /api/dispositivos/opciones-publicacion: categorías reales y centros activos con sus categorías admitidas. La ruta precede a /:id.
- POST /api/dispositivos: JWT y authorizeRoles('DONOR','ADMIN'). El donante se toma exclusivamente de req.usuario.id, incluso si el cliente envía otro donanteId. El centro de origen se elige explícitamente; se valida su compatibilidad dentro de una transacción.
- Código de trazabilidad basado en año y UUID para evitar colisiones de publicaciones concurrentes. CO₂ calculado con carbonCalculator.util.ts, coherente con el dashboard.
- Se sustituyó la implementación antigua que usaba donante 2 y centro 1. PATCH /api/dispositivos/:id/estado queda limitado a ADMIN.
- /transferencias: Standalone con guards TECHNICIAN/ADMIN. Presenta órdenes PENDIENTE y EN_TRANSITO con título, código, fecha, técnico y centros.
- GET /api/transferencias/mis-ordenes: TECHNICIAN ve solo o.tecnico_id = req.usuario.id; ADMIN ve todas. Ignora un tecnicoId enviado por el cliente.
- Confirmar Recepción Física abre un diálogo con advertencia irreversible. Cancelar no hace peticiones. Durante el envío se bloquean botones y Escape.
- PATCH /api/transferencias/:id/completar conserva las transacciones y validaciones de la Tarea 2. Al responder correctamente se actualizan COMPLETADA y ENTREGADO, se retira la orden de la lista activa y se muestra feedback.
- TransferenciasService emite cambios$ solo tras una respuesta exitosa. El dashboard consume ese evento y consulta las métricas cuando se abre; conserva también el refresco periódico. No se agregó WebSocket/SSE ni sincronización instantánea entre clientes distintos.
- Enlaces Publicar hardware para DONOR/ADMIN y Mis transferencias para TECHNICIAN/ADMIN.

## Guion con datos nuevos

1. Iniciar el backend y frontend con la configuración de la Tarea 3; aplicar previamente el esquema/migración de la Tarea 2.
2. Registrar una cuenta DONOR; iniciar sesión y abrir Publicar hardware.
3. Publicar un dispositivo seleccionando una categoría y un centro compatible, con peso positivo.
4. Registrar/iniciar sesión con TECHNICIAN. En Catálogo, solicitar el dispositivo publicado e ingresar el motivo.
5. Verificar RESERVADO y abrir Mis transferencias.
6. Recibir físicamente el hardware; abrir Confirmar Recepción Física y confirmar.
7. Verificar la notificación de éxito y consultar Dashboard: aumentan kg recuperados y CO₂; el catálogo presenta ENTREGADO.
8. backend/api.http incluye el mismo recorrido, con nuevas cuentas de correos dinámicos, publicación nueva y referencias a IDs devueltos. Incluye controles 401, 403 y repetición de entrega 409.

## Validación

- Build de producción Angular: aprobado.
- TypeScript backend con --noEmit: aprobado.
- Suite Angular en ChromeHeadless: 26 pruebas aprobadas.
- Backend con node -r ../node_modules/ts-node/register --test tests/tarea5.test.ts: 5 pruebas aprobadas.
- Incluye validación del formulario, centros compatibles, envíos duplicados, cancelación del diálogo, confirmación de estados, conflictos, evento de métricas, aislamiento por técnico, donante tomado del JWT y rollback de publicación.
- Pruebas con HTTP/MySQL simulados. No se ejecutó el recorrido contra MySQL real ni se desplegó el proyecto.

## Código completo

## backend/src/controllers/publicaciones.controller.ts  ```typescript import { randomUUID } from 'node:crypto';
import { NextFunction, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateDispositivoDTO, Dispositivo, EstadoFuncional } from '../models/dispositivo.model';
import { calculateAvoidedCo2 } from '../utils/carbonCalculator.util';
import { sendError, sendSuccess } from '../utils/response.util';

interface CategoriaRow extends RowDataPacket { id: number; codigo: string; nombre: string; }
interface CentroRow extends RowDataPacket { id: number; nombre: string; ciudad: string; categoriaId: number; }
function idValido(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function textoOpcional(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === 'string' && value.trim().length <= max);
}

export async function opcionesPublicacion(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const [categorias] = await pool.execute<CategoriaRow[]>(
      'SELECT id, codigo, nombre FROM categorias_raee ORDER BY nombre');
    const [centros] = await pool.execute<CentroRow[]>(
      `SELECT c.id, c.nombre, c.ciudad, cc.categoria_id AS categoriaId
       FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.activo = TRUE ORDER BY c.nombre, cc.categoria_id`);
    sendSuccess(res, { categorias, centros });
  } catch (error: unknown) { next(error); }
}

export async function crearDispositivo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.usuario) { sendError(res, 'Autenticación requerida', 401); return; }
  const body: Partial<CreateDispositivoDTO> | null = req.body;
  const estados: EstadoFuncional[] = ['OPERATIVO', 'REPARABLE', 'DESGUACE_RECICLAJE'];
  if (!body || typeof body.titulo !== 'string' || body.titulo.trim().length < 3 || body.titulo.trim().length > 150
      || !idValido(body.categoriaId) || !idValido(body.centroAcopioId)
      || typeof body.pesoKg !== 'number' || !Number.isFinite(body.pesoKg) || body.pesoKg <= 0 || body.pesoKg > 9999.99
      || Math.abs(body.pesoKg * 100 - Math.round(body.pesoKg * 100)) > 0.000001
      || !body.estadoFuncional || !estados.includes(body.estadoFuncional)
      || !textoOpcional(body.marca, 100) || !textoOpcional(body.modelo, 100)
      || !textoOpcional(body.numeroSerie, 100) || !textoOpcional(body.notas, 5000)
      || (body.especificaciones !== undefined && (typeof body.especificaciones !== 'object'
        || body.especificaciones === null || Array.isArray(body.especificaciones)))) {
    sendError(res, 'Datos inválidos: título de 3 a 150 caracteres, categoría, centro, condición y peso positivo con hasta 2 decimales', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  let transaction: boolean = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction(); transaction = true;
    const [categories] = await connection.execute<CategoriaRow[]>(
      'SELECT id, codigo, nombre FROM categorias_raee WHERE id = ? FOR UPDATE', [body.categoriaId]);
    if (!categories[0]) {
      await connection.rollback(); transaction = false;
      sendError(res, 'Categoría no encontrada', 404); return;
    }
    const [centers] = await connection.execute<CentroRow[]>(
      `SELECT c.id, c.nombre FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.id = ? AND c.activo = TRUE AND cc.categoria_id = ? FOR UPDATE`,
      [body.centroAcopioId, body.categoriaId]);
    if (!centers[0]) {
      await connection.rollback(); transaction = false;
      sendError(res, 'El centro debe estar activo y admitir la categoría seleccionada', 409); return;
    }
    const codigo: string = `RAEE-${new Date().getUTCFullYear()}-${randomUUID()}`;
    const co2: number = calculateAvoidedCo2(body.pesoKg, categories[0].codigo.replace(/^RAEE-/, 'CAT-'));
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO dispositivos (codigo_trazabilidad, titulo, categoria_id, donante_id,
       centro_acopio_id, marca, modelo, numero_serie, estado_funcional, estado_disponibilidad,
       peso_kg, co2_evitado_kg, especificaciones, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPONIBLE', ?, ?, ?, ?)`,
      [codigo, body.titulo.trim(), body.categoriaId, req.usuario.id, body.centroAcopioId,
       body.marca?.trim() || null, body.modelo?.trim() || null, body.numeroSerie?.trim() || null,
       body.estadoFuncional, body.pesoKg, co2, body.especificaciones ? JSON.stringify(body.especificaciones) : null,
       body.notas?.trim() || null]);
    await connection.commit(); transaction = false;
    const device: Dispositivo = {
      id: result.insertId, codigoTrazabilidad: codigo, titulo: body.titulo.trim(),
      categoriaId: body.categoriaId, categoriaNombre: categories[0].nombre, donanteId: req.usuario.id,
      centroAcopioId: body.centroAcopioId, centroAcopioNombre: centers[0].nombre,
      marca: body.marca?.trim(), modelo: body.modelo?.trim(), numeroSerie: body.numeroSerie?.trim(),
      estadoFuncional: body.estadoFuncional, estadoDisponibilidad: 'DISPONIBLE',
      pesoKg: body.pesoKg, co2EvitadoKg: co2, notas: body.notas?.trim(),
      especificaciones: body.especificaciones, createdAt: new Date()
    };
    sendSuccess(res, device, 'Hardware publicado correctamente', 201);
  } catch (error: unknown) {
    if (connection && transaction) {
      try { await connection.rollback(); } catch { connection.destroy(); connection = undefined; }
    }
    next(error);
  } finally { connection?.release(); }
}
 ``` 
## backend/src/routes/dispositivos.routes.ts  ```typescript import { Router } from 'express';
import { dispositivosController } from '../controllers/dispositivos.controller';
import { crearDispositivo, opcionesPublicacion } from '../controllers/publicaciones.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';
const router: Router = Router();
router.get('/', dispositivosController.getDispositivos);
router.get('/opciones-publicacion', authenticateToken, authorizeRoles('DONOR', 'ADMIN'), opcionesPublicacion);
router.get('/:id', dispositivosController.getDispositivoById);
router.post('/', authenticateToken, authorizeRoles('DONOR', 'ADMIN'), crearDispositivo);
router.patch('/:id/estado', authenticateToken, authorizeRoles('ADMIN'), dispositivosController.updateEstado);
export default router;
 ``` 
## frontend/src/app/components/dispositivo-form/dispositivo-form.component.ts  ```typescript import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
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
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 9999.99
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
      .subscribe((id: number): void => { this.categoriaElegida.set(id); this.form.controls.centroAcopioId.setValue(0); });
    this.cargarOpciones();
  }
  cargarOpciones(): void {
    this.cargando.set(true); this.error.set(null);
    this.service.getOpcionesPublicacion().pipe(takeUntilDestroyed(this.destroyRef),
      finalize((): void => this.cargando.set(false))).subscribe({
      next: (options: OpcionesPublicacion): void => {
        this.categorias.set(options.categorias); this.centros.set(options.centros);
      }, error: (error: unknown): void => this.error.set(errorMessage(error))
    });
  }
  submit(): void {
    if (this.enviando() || this.cargando()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
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
 ``` 
## frontend/src/app/components/dispositivo-form/dispositivo-form.component.html  ```html <section class="form-card"><h1>Publicar hardware</h1><p>Registra el dispositivo y el centro donde estará disponible para su entrega.</p>
  @if (cargando()) { <p role="status">Cargando categorías y centros…</p> }
  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  @if (!cargando() && categorias().length === 0) {
    <p>No hay categorías disponibles.</p><button (click)="cargarOpciones()">Reintentar carga</button>
  }
  <form [formGroup]="form" (ngSubmit)="submit()" [attr.aria-busy]="enviando()">
    <fieldset [disabled]="cargando() || enviando()">
      <label for="titulo">Título *</label><input id="titulo" formControlName="titulo" maxlength="150" aria-describedby="titulo-error">
      @if (form.controls.titulo.touched && form.controls.titulo.invalid) { <small class="error" id="titulo-error">El título debe tener de 3 a 150 caracteres.</small> }
      <div class="fila"><div><label for="categoria">Categoría *</label><select id="categoria" formControlName="categoriaId" aria-describedby="categoria-error">
        <option [ngValue]="0">Selecciona una categoría</option>
        @for (c of categorias(); track c.id) { <option [ngValue]="c.id">{{ c.nombre }}</option> }
      </select>@if (form.controls.categoriaId.touched && form.controls.categoriaId.invalid) { <small class="error" id="categoria-error">Selecciona una categoría.</small> }</div>
      <div><label for="centro">Centro de origen *</label><select id="centro" formControlName="centroAcopioId" aria-describedby="centro-error">
        <option [ngValue]="0">Selecciona un centro</option>
        @for (c of centrosDisponibles(); track c.id) { <option [ngValue]="c.id">{{ c.nombre }} · {{ c.ciudad }}</option> }
      </select>@if (form.controls.centroAcopioId.touched && form.controls.centroAcopioId.invalid) { <small class="error" id="centro-error">Selecciona un centro que admita la categoría.</small> }</div></div>
      <div class="fila"><div><label for="marca">Marca</label><input id="marca" formControlName="marca" maxlength="100" aria-describedby="marca-error">
      @if (form.controls.marca.touched && form.controls.marca.invalid) { <small class="error" id="marca-error">Máximo 100 caracteres.</small> }</div>
      <div><label for="modelo">Modelo</label><input id="modelo" formControlName="modelo" maxlength="100" aria-describedby="modelo-error">
      @if (form.controls.modelo.touched && form.controls.modelo.invalid) { <small class="error" id="modelo-error">Máximo 100 caracteres.</small> }</div></div>
      <label for="serie">Número de serie</label><input id="serie" formControlName="numeroSerie" maxlength="100" aria-describedby="serie-error">
      @if (form.controls.numeroSerie.touched && form.controls.numeroSerie.invalid) { <small class="error" id="serie-error">Máximo 100 caracteres.</small> }
      <div class="fila"><div><label for="condicion">Estado funcional *</label><select id="condicion" formControlName="estadoFuncional">
        <option value="OPERATIVO">Operativo</option><option value="REPARABLE">Reparable</option><option value="DESGUACE_RECICLAJE">Desguace / reciclaje</option>
      </select></div><div><label for="peso">Peso en kg *</label><input id="peso" type="number" formControlName="pesoKg" min="0.01" max="9999.99" step="0.01" aria-describedby="peso-error">
      @if (form.controls.pesoKg.touched && form.controls.pesoKg.invalid) { <small class="error" id="peso-error">Peso mayor que 0, máximo 9999.99 kg y hasta 2 decimales.</small> }</div></div>
      <label for="notas">Notas o especificaciones técnicas</label><textarea id="notas" formControlName="notas" rows="5" maxlength="5000" aria-describedby="notas-error"></textarea>
      @if (form.controls.notas.touched && form.controls.notas.invalid) { <small class="error" id="notas-error">Máximo 5000 caracteres.</small> }
      <button type="submit" [disabled]="enviando() || cargando() || categorias().length === 0">{{ enviando() ? 'Publicando…' : 'Publicar hardware' }}</button>
    </fieldset>
    @if (enviando()) { <p role="status">Guardando el dispositivo…</p> }
  </form>
</section>
 ``` 
## frontend/src/app/components/dispositivo-form/dispositivo-form.component.css  ```css :host{display:block;color:#1B4965}.form-card{max-width:760px;margin:2rem auto;padding:2rem;background:white;border:1px solid #dce7ec;border-top:5px solid #2EC4B6;border-radius:14px;box-shadow:0 8px 24px #1b496510}h1{margin-top:0}fieldset{border:0;padding:0;margin:0;min-width:0}label{display:block;font-weight:600;margin:1rem 0 .4rem}input,select,textarea{box-sizing:border-box;width:100%;padding:.75rem;border:1px solid #8297a4;border-radius:6px;font:inherit;background:white;color:#1B4965}input:focus,select:focus,textarea:focus{outline:2px solid #2EC4B6;outline-offset:2px}.fila{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.error{color:#b42318}small.error{display:block;margin-top:.3rem}p.error{padding:1rem;background:#fff1f0;border-radius:8px}button{margin-top:1.2rem;background:#1B4965;color:white;border:0;border-bottom:3px solid #2EC4B6;border-radius:6px;padding:.8rem 1.2rem;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:wait}@media(max-width:640px){.form-card{padding:1rem;margin:1rem}.fila{grid-template-columns:1fr;gap:0}}
 ``` 
## frontend/src/app/components/transferencias/transferencias.component.ts  ```typescript import { Component, DestroyRef, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
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
 ``` 
## frontend/src/app/components/transferencias/transferencias.component.html  ```html <section class="panel"><header><div><h1>Mis transferencias</h1><p>Confirma la entrega únicamente después de recibir físicamente el hardware.</p></div>
  <button (click)="cargar()" [disabled]="cargando() || confirmando()">Actualizar</button></header>
  @if (aviso()) { <p class="aviso" role="status">{{ aviso() }}</p> }
  @if (cargando()) { <p role="status">Cargando órdenes…</p> }
  @else if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  @else if (activas().length === 0) { <p class="vacio">No tienes transferencias activas.</p> }
  @else { <div class="grid">
    @for (o of activas(); track o.id) {
      <article><div class="estado"><strong>Orden #{{ o.id }}</strong><span>{{ o.estado }}</span></div>
        <h2>{{ o.dispositivoTitulo }}</h2><p>{{ o.codigoTrazabilidad }}</p>
        <dl><dt>Técnico</dt><dd>{{ o.tecnicoNombre }}</dd><dt>Solicitud</dt><dd>{{ o.fechaSolicitud | date:'short' }}</dd>
          <dt>Peso</dt><dd>{{ o.pesoKg | number:'1.2-2' }} kg</dd>
          <dt>Origen</dt><dd>{{ o.centroOrigenNombre }}</dd>
          <dt>Destino</dt><dd>{{ o.centroDestinoNombre || 'Entrega al técnico' }}</dd></dl>
        <p>{{ o.motivo }}</p><button (click)="abrirConfirmacion(o)" [disabled]="confirmando()">Confirmar Recepción Física</button>
      </article>
    }
  </div> }
</section>
<dialog #confirmacion aria-labelledby="confirm-title" (cancel)="cancelar($event)">
  <h2 id="confirm-title">Confirmar recepción física</h2><p>{{ seleccionada()?.dispositivoTitulo }}</p>
  <p><strong>Esta acción es irreversible desde este panel.</strong> Confirma solo si ya recibiste el dispositivo. La orden quedará COMPLETADA y el dispositivo ENTREGADO.</p>
  @if (errorConfirmacion()) { <p class="error" role="alert">{{ errorConfirmacion() }}</p> }
  <div class="acciones"><button class="secundario" (click)="cerrar()" [disabled]="confirmando()" autofocus>Cancelar</button>
    <button (click)="confirmar()" [disabled]="confirmando()">{{ confirmando() ? 'Confirmando…' : 'Sí, recibí el hardware' }}</button></div>
  @if (confirmando()) { <p role="status">Registrando la entrega…</p> }
</dialog>
 ``` 
## frontend/src/app/components/transferencias/transferencias.component.css  ```css :host{display:block;color:#1B4965}.panel{max-width:1100px;margin:auto;padding:2rem 1rem}header{display:flex;align-items:center;justify-content:space-between;gap:1rem}h1{margin:0}h2{font-size:1.2rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:1rem;margin-top:1.5rem}article{border:1px solid #dce7ec;border-top:4px solid #2EC4B6;background:white;padding:1.5rem;border-radius:12px;overflow-wrap:anywhere}.estado{display:flex;justify-content:space-between;gap:.5rem;font-size:.85rem}.estado span{background:#fff0c2;padding:.3rem;border-radius:6px}dl{display:grid;grid-template-columns:1fr 2fr;gap:.6rem}dt{font-weight:600}dd{margin:0}button{background:#1B4965;color:white;border:0;border-bottom:3px solid #2EC4B6;border-radius:6px;padding:.8rem 1rem;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:wait}button:focus-visible{outline:2px solid #2EC4B6;outline-offset:3px}.aviso{background:#d2f4ef;padding:1rem;border-radius:8px}.error{color:#b42318;background:#fff1f0;padding:1rem;border-radius:8px}.vacio{padding:2rem;background:#f0f7fa;border-radius:8px}dialog{width:min(500px,calc(100vw - 5rem));border:0;border-radius:14px;padding:1.5rem;color:#1B4965}dialog::backdrop{background:#1b496599}.acciones{display:flex;gap:.75rem;justify-content:flex-end}.secundario{background:#eaf1f5;color:#1B4965}@media(max-width:640px){header{flex-direction:column;align-items:flex-start}.acciones{flex-direction:column}}
 ``` 
## backend/src/controllers/transferencias.controller.ts  ```typescript import { NextFunction, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { EstadoTransferencia, SolicitarTransferenciaDTO } from '../models/transferencia.model';
import { EstadoDisponibilidad } from '../models/dispositivo.model';
import { sendError, sendSuccess } from '../utils/response.util';

interface DispositivoRow extends RowDataPacket {
  id: number;
  categoria_id: number;
  centro_acopio_id: number | null;
  estado_disponibilidad: EstadoDisponibilidad;
}

interface OrdenRow extends RowDataPacket {
  id: number;
  dispositivo_id: number;
  tecnico_id: number;
  centro_destino_id: number | null;
  estado: EstadoTransferencia;
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function rollback(connection: PoolConnection | undefined): Promise<void> {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (error: unknown) {
    // Una conexión que no permite rollback no debe volver al pool.
    console.error('Error al revertir transferencia', error);
    connection.destroy();
  }
}

export async function solicitarTransferencia(
  req: AuthRequest, res: Response, next: NextFunction
): Promise<void> {
  if (!req.usuario) {
    sendError(res, 'Autenticación requerida', 401);
    return;
  }
  const body: Partial<SolicitarTransferenciaDTO> | null = req.body;
  if (!body || !positiveId(body.dispositivoId) || typeof body.motivo !== 'string'
      || !body.motivo.trim() || body.motivo.trim().length > 255
      || (body.centroDestinoId != null && !positiveId(body.centroDestinoId))) {
    sendError(res, 'Se requieren dispositivoId positivo, motivo de 1 a 255 caracteres y centroDestinoId válido', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [devices] = await connection.execute<DispositivoRow[]>(
      'SELECT id, categoria_id, centro_acopio_id, estado_disponibilidad FROM dispositivos WHERE id = ? FOR UPDATE',
      [body.dispositivoId]
    );
    const device: DispositivoRow | undefined = devices[0];
    if (!device) {
      await rollback(connection);
      sendError(res, 'Dispositivo no encontrado', 404);
      return;
    }
    const [activeOrders] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM ordenes_transferencia WHERE dispositivo_id = ?
       AND estado IN ('PENDIENTE', 'EN_TRANSITO') FOR UPDATE`, [device.id]
    );
    if (device.estado_disponibilidad !== 'DISPONIBLE' || activeOrders.length > 0) {
      await rollback(connection);
      sendError(res, 'El dispositivo no está disponible o ya tiene una transferencia activa', 409);
      return;
    }
    if (device.centro_acopio_id === null) {
      await rollback(connection);
      sendError(res, 'El dispositivo necesita un centro de origen', 409);
      return;
    }
    const destination: number | null = body.centroDestinoId ?? null;
    const [centers] = await connection.execute<RowDataPacket[]>(
      `SELECT c.id FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.id IN (?, ?) AND c.activo = TRUE AND cc.categoria_id = ? FOR UPDATE`,
      [device.centro_acopio_id, destination, device.categoria_id]
    );
    const requiredCenters: number = destination !== null && destination !== device.centro_acopio_id ? 2 : 1;
    if (centers.length !== requiredCenters) {
      await rollback(connection);
      sendError(res, 'Los centros deben estar activos y admitir la categoría del dispositivo', 409);
      return;
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ordenes_transferencia
       (dispositivo_id, tecnico_id, centro_origen_id, centro_destino_id, estado, motivo)
       VALUES (?, ?, ?, ?, 'PENDIENTE', ?)`,
      [device.id, req.usuario.id, device.centro_acopio_id, destination, body.motivo.trim()]
    );
    await connection.execute<ResultSetHeader>(
      "UPDATE dispositivos SET estado_disponibilidad = 'RESERVADO' WHERE id = ?", [device.id]
    );
    await connection.commit();
    sendSuccess(res, { id: result.insertId, dispositivoId: device.id, tecnicoId: req.usuario.id,
      centroOrigenId: device.centro_acopio_id, centroDestinoId: destination,
      motivo: body.motivo.trim(), estado: 'PENDIENTE', estadoDisponibilidad: 'RESERVADO' },
    'Transferencia solicitada', 201);
  } catch (error: unknown) {
    await rollback(connection);
    next(error);
  } finally {
    connection?.release();
  }
}

export async function completarTransferencia(
  req: AuthRequest, res: Response, next: NextFunction
): Promise<void> {
  if (!req.usuario) {
    sendError(res, 'Autenticación requerida', 401);
    return;
  }
  const rawId: string = String(req.params.id);
  const id: number = Number(rawId);
  if (!/^\d+$/.test(rawId) || !positiveId(id)) {
    sendError(res, 'ID de transferencia inválido', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // Obtener el ID primero permite bloquear siempre dispositivo antes que orden.
    const [references] = await connection.execute<OrdenRow[]>(
      'SELECT dispositivo_id FROM ordenes_transferencia WHERE id = ?', [id]
    );
    if (!references[0]) {
      await rollback(connection);
      sendError(res, 'Transferencia no encontrada', 404);
      return;
    }
    const [devices] = await connection.execute<DispositivoRow[]>(
      'SELECT id, estado_disponibilidad FROM dispositivos WHERE id = ? FOR UPDATE',
      [references[0].dispositivo_id]
    );
    const [orders] = await connection.execute<OrdenRow[]>(
      'SELECT id, dispositivo_id, tecnico_id, centro_destino_id, estado FROM ordenes_transferencia WHERE id = ? FOR UPDATE', [id]
    );
    const order: OrdenRow | undefined = orders[0];
    if (!order) {
      await rollback(connection);
      sendError(res, 'Transferencia no encontrada', 404);
      return;
    }
    if (res.locals.rol !== 'ADMIN' && order.tecnico_id !== req.usuario.id) {
      await rollback(connection);
      sendError(res, 'Solo el técnico responsable o un administrador puede confirmar la entrega', 403);
      return;
    }
    if (!['PENDIENTE', 'EN_TRANSITO'].includes(order.estado)
        || devices[0]?.estado_disponibilidad !== 'RESERVADO'
        || devices[0]?.id !== order.dispositivo_id) {
      await rollback(connection);
      sendError(res, 'La orden y el dispositivo no permiten confirmar la entrega', 409);
      return;
    }
    await connection.execute<ResultSetHeader>(
      "UPDATE ordenes_transferencia SET estado = 'COMPLETADA', fecha_completado = CURRENT_TIMESTAMP WHERE id = ?", [id]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE dispositivos SET estado_disponibilidad = 'ENTREGADO',
       centro_acopio_id = COALESCE(?, centro_acopio_id) WHERE id = ?`,
      [order.centro_destino_id, order.dispositivo_id]
    );
    await connection.commit();
    sendSuccess(res, { id, dispositivoId: order.dispositivo_id,
      estado: 'COMPLETADA', estadoDisponibilidad: 'ENTREGADO' }, 'Entrega física confirmada');
  } catch (error: unknown) {
    await rollback(connection);
    next(error);
  } finally {
    connection?.release();
  }
}

interface OrdenListadoRow extends RowDataPacket {
  id: number; dispositivoId: number; tecnicoId: number; tecnicoNombre: string;
  centroOrigenId: number; centroOrigenNombre: string; centroDestinoId: number | null;
  centroDestinoNombre: string | null; estado: EstadoTransferencia; motivo: string;
  fechaSolicitud: Date; fechaCompletado: Date | null; dispositivoTitulo: string;
  codigoTrazabilidad: string; estadoDisponibilidad: EstadoDisponibilidad; pesoKg: string | number;
}
export async function misOrdenes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.usuario) { sendError(res, 'Autenticación requerida', 401); return; }
  try {
    const admin: boolean = res.locals.rol === 'ADMIN';
    const [rows] = await pool.execute<OrdenListadoRow[]>(
      `SELECT o.id, o.dispositivo_id AS dispositivoId, o.tecnico_id AS tecnicoId,
       u.nombre_completo AS tecnicoNombre, o.centro_origen_id AS centroOrigenId,
       origen.nombre AS centroOrigenNombre, o.centro_destino_id AS centroDestinoId,
       destino.nombre AS centroDestinoNombre, o.estado, o.motivo,
       o.fecha_solicitud AS fechaSolicitud, o.fecha_completado AS fechaCompletado,
       d.titulo AS dispositivoTitulo, d.codigo_trazabilidad AS codigoTrazabilidad,
       d.estado_disponibilidad AS estadoDisponibilidad, d.peso_kg AS pesoKg
       FROM ordenes_transferencia o JOIN dispositivos d ON d.id = o.dispositivo_id
       JOIN usuarios u ON u.id = o.tecnico_id
       JOIN centros_acopio origen ON origen.id = o.centro_origen_id
       LEFT JOIN centros_acopio destino ON destino.id = o.centro_destino_id
       ${admin ? '' : 'WHERE o.tecnico_id = ?'}
       ORDER BY o.fecha_solicitud DESC, o.id DESC`, admin ? [] : [req.usuario.id]);
    sendSuccess(res, rows.map((row: OrdenListadoRow) => ({ ...row, pesoKg: Number(row.pesoKg) })));
  } catch (error: unknown) { next(error); }
}
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

export interface CrearDispositivoDTO {
  titulo: string; categoriaId: number; centroAcopioId: number;
  marca?: string; modelo?: string; numeroSerie?: string;
  estadoFuncional: EstadoFuncional; pesoKg: number; notas?: string;
  especificaciones?: Record<string, unknown>;
}
export interface CategoriaRAEE { id: number; codigo: string; nombre: string; }
export interface CentroPublicacion { id: number; nombre: string; ciudad: string; categoriaId: number; }
export interface OpcionesPublicacion { categorias: CategoriaRAEE[]; centros: CentroPublicacion[]; }
 ``` 
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

export interface OrdenTransferencia {
  id: number; dispositivoId: number; tecnicoId: number; tecnicoNombre: string;
  centroOrigenId: number; centroOrigenNombre: string; centroDestinoId: number | null;
  centroDestinoNombre: string | null; estado: EstadoTransferencia; motivo: string;
  fechaSolicitud: string; fechaCompletado: string | null;
  dispositivoTitulo: string; codigoTrazabilidad: string;
  estadoDisponibilidad: import('./dispositivo.model').EstadoDisponibilidad; pesoKg: number;
}
 ``` 
## backend/src/routes/transferencias.routes.ts  ```typescript import { Router } from 'express';
import { solicitarTransferencia, completarTransferencia, misOrdenes } from '../controllers/transferencias.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';

const router: Router = Router();
router.use(authenticateToken);
router.get('/mis-ordenes', authorizeRoles('ADMIN', 'TECHNICIAN'), misOrdenes);
router.post('/', authorizeRoles('TECHNICIAN'), solicitarTransferencia);
router.patch('/:id/completar', authorizeRoles('ADMIN', 'TECHNICIAN'), completarTransferencia);
export default router;
 ``` 
## frontend/src/app/services/dispositivos.service.ts  ```typescript import { Injectable, inject } from '@angular/core';
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
 ``` 
## frontend/src/app/services/transferencias.service.ts  ```typescript import { Injectable, inject } from '@angular/core';
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
  { path: 'nuevo-dispositivo', canActivate: [authGuard, roleGuard], data: { roles: ['DONOR', 'ADMIN'] },
    loadComponent: () => import('./components/dispositivo-form/dispositivo-form.component').then(m => m.DispositivoFormComponent) },
  { path: 'transferencias', canActivate: [authGuard, roleGuard], data: { roles: ['TECHNICIAN', 'ADMIN'] },
    loadComponent: () => import('./components/transferencias/transferencias.component').then(m => m.TransferenciasComponent) },
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
    @if (auth.hasRole(['DONOR', 'ADMIN'])) {
      <a routerLink="/nuevo-dispositivo" routerLinkActive="active" (click)="closeMenu()">Publicar hardware</a>
    }
    @if (auth.hasRole(['ADMIN', 'TECHNICIAN'])) {
      <a routerLink="/transferencias" routerLinkActive="active" (click)="closeMenu()">Mis transferencias</a>
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
## backend/src/controllers/dispositivos.controller.ts  ```typescript import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { crearDispositivo } from './publicaciones.controller';

export const dispositivosController = {
  // Listar todos los dispositivos con filtros opcionales (estado, categoría, búsqueda)
  getDispositivos: async (req: Request, res: Response): Promise<void> => {
    try {
      const { estado, estadoFuncional, categoriaId, busqueda } = req.query;

      let sql = `
        SELECT 
          d.id,
          d.codigo_trazabilidad AS codigoTrazabilidad,
          d.titulo,
          d.categoria_id AS categoriaId,
          c.nombre AS categoriaNombre,
          c.codigo AS categoriaCodigo,
          d.donante_id AS donanteId,
          u.nombre_completo AS donanteNombre,
          d.centro_acopio_id AS centroAcopioId,
          ca.nombre AS centroAcopioNombre,
          ca.ciudad AS centroCiudad,
          d.marca,
          d.modelo,
          d.numero_serie AS numeroSerie,
          d.estado_funcional AS estadoFuncional,
          d.estado_disponibilidad AS estadoDisponibilidad,
          d.peso_kg AS pesoKg,
          d.co2_evitado_kg AS co2EvitadoKg,
          d.especificaciones,
          d.notas,
          d.created_at AS createdAt,
          d.updated_at AS updatedAt
        FROM dispositivos d
        LEFT JOIN categorias_raee c ON d.categoria_id = c.id
        LEFT JOIN usuarios u ON d.donante_id = u.id
        LEFT JOIN centros_acopio ca ON d.centro_acopio_id = ca.id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (estado) {
        sql += ' AND d.estado_disponibilidad = ?';
        params.push((estado as string).toUpperCase());
      }

      if (estadoFuncional) {
        sql += ' AND d.estado_funcional = ?';
        params.push((estadoFuncional as string).toUpperCase());
      }

      if (categoriaId) {
        sql += ' AND d.categoria_id = ?';
        params.push(parseInt(categoriaId as string, 10));
      }

      if (busqueda) {
        sql += ' AND (d.titulo LIKE ? OR d.codigo_trazabilidad LIKE ? OR d.marca LIKE ? OR d.modelo LIKE ?)';
        const queryTerm = `%${busqueda}%`;
        params.push(queryTerm, queryTerm, queryTerm, queryTerm);
      }

      sql += ' ORDER BY d.id DESC';

      const [rows] = await pool.query<RowDataPacket[]>(sql, params);

      res.status(200).json({
        success: true,
        data: rows,
        meta: { total: rows.length },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al obtener catálogo de dispositivos: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Obtener detalle de un dispositivo por ID
  getDispositivoById: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);

      const [rows] = await pool.query<RowDataPacket[]>(`
        SELECT 
          d.id,
          d.codigo_trazabilidad AS codigoTrazabilidad,
          d.titulo,
          d.categoria_id AS categoriaId,
          c.nombre AS categoriaNombre,
          d.donante_id AS donanteId,
          u.nombre_completo AS donanteNombre,
          d.centro_acopio_id AS centroAcopioId,
          ca.nombre AS centroAcopioNombre,
          d.marca,
          d.modelo,
          d.numero_serie AS numeroSerie,
          d.estado_funcional AS estadoFuncional,
          d.estado_disponibilidad AS estadoDisponibilidad,
          d.peso_kg AS pesoKg,
          d.co2_evitado_kg AS co2EvitadoKg,
          d.especificaciones,
          d.notas,
          d.created_at AS createdAt,
          d.updated_at AS updatedAt
        FROM dispositivos d
        LEFT JOIN categorias_raee c ON d.categoria_id = c.id
        LEFT JOIN usuarios u ON d.donante_id = u.id
        LEFT JOIN centros_acopio ca ON d.centro_acopio_id = ca.id
        WHERE d.id = ?
      `, [id]);

      if (rows.length === 0) {
        res.status(404).json({
          success: false,
          error: `Dispositivo con ID ${id} no encontrado`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: rows[0],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al consultar dispositivo: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  createDispositivo: crearDispositivo,

  // Actualizar estado del dispositivo
  updateEstado: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { estadoDisponibilidad, estadoFuncional, notas } = req.body;

      const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM dispositivos WHERE id = ?', [id]);
      if (existing.length === 0) {
        res.status(404).json({
          success: false,
          error: `Dispositivo con ID ${id} no encontrado`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      await pool.query(`
        UPDATE dispositivos
        SET 
          estado_disponibilidad = COALESCE(?, estado_disponibilidad),
          estado_funcional = COALESCE(?, estado_funcional),
          notas = COALESCE(?, notas),
          updated_at = NOW()
        WHERE id = ?
      `, [estadoDisponibilidad || null, estadoFuncional || null, notas || null, id]);

      res.status(200).json({
        success: true,
        message: 'Estado del dispositivo actualizado correctamente',
        data: { id, estadoDisponibilidad, estadoFuncional },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al actualizar dispositivo: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  }
};
 ``` 
## frontend/src/app/components/dispositivo-form/dispositivo-form.component.spec.ts  ```typescript import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { DispositivoFormComponent } from './dispositivo-form.component';
import { NotificationService } from '../../services/notification.service';
describe('Hardware publication form', () => {
  let fixture: ComponentFixture<DispositivoFormComponent>;
  let component: DispositivoFormComponent;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DispositivoFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DispositivoFormComponent);
    component = fixture.componentInstance; fixture.detectChanges();
    http.expectOne('/api/dispositivos/opciones-publicacion').flush({ success: true, data: {
      categorias: [{ id: 4, codigo: 'RAEE-CPU', nombre: 'CPU' }],
      centros: [{ id: 1, nombre: 'Central', ciudad: 'Guatemala', categoriaId: 4 },
        { id: 2, nombre: 'Otro', ciudad: 'Guatemala', categoriaId: 2 }]
    } });
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  function validForm(): void {
    component.form.patchValue({ titulo: 'Procesador donado nuevo', categoriaId: 4,
      centroAcopioId: 1, pesoKg: 0.05, estadoFuncional: 'OPERATIVO' });
  }
  it('rejects empty, whitespace, short title and invalid weights before HTTP', () => {
    component.submit(); http.expectNone('/api/dispositivos');
    validForm();
    for (const title of ['  ', 'ab', 'a'.repeat(151)]) {
      component.form.controls.titulo.setValue(title);
      expect(component.form.controls.titulo.invalid).toBeTrue();
    }
    component.form.controls.titulo.setValue('Procesador');
    for (const weight of [0, -1, 0.001, 10000]) {
      component.form.controls.pesoKg.setValue(weight);
      component.submit(); http.expectNone('/api/dispositivos');
    }
  });
  it('only offers centres compatible with the selected category and resets centre on change', () => {
    validForm();
    expect(component.centrosDisponibles().map(c => c.id)).toEqual([1]);
    component.form.controls.categoriaId.setValue(2);
    expect(component.form.controls.centroAcopioId.value).toBe(0);
    expect(component.centrosDisponibles().map(c => c.id)).toEqual([2]);
  });
  it('publishes once, sends no donor spoofing field and redirects with feedback', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    validForm(); component.submit(); component.submit();
    const request = http.expectOne('/api/dispositivos');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.donanteId).toBeUndefined();
    expect(request.request.body.centroAcopioId).toBe(1);
    expect(component.enviando()).toBeTrue();
    request.flush({ success: true, data: { id: 8, titulo: 'Procesador donado nuevo' } });
    expect(component.enviando()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/catalogo']);
    expect(TestBed.inject(NotificationService).message()).toContain('publicado');
  });
  it('keeps entered data and shows API errors for retry', () => {
    validForm(); component.submit();
    http.expectOne('/api/dispositivos').flush({ error: 'El centro ya no está activo' }, { status: 409, statusText: 'Conflict' });
    expect(component.error()).toContain('centro');
    expect(component.form.controls.titulo.value).toBe('Procesador donado nuevo');
    expect(component.enviando()).toBeFalse();
  });
});
 ``` 
## frontend/src/app/components/transferencias/transferencias.component.spec.ts  ```typescript import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TransferenciasComponent } from './transferencias.component';
import { TransferenciasService } from '../../services/transferencias.service';
import { OrdenTransferencia } from '../../models/transferencia.model';
describe('Physical handover confirmation', () => {
  let fixture: ComponentFixture<TransferenciasComponent>;
  let component: TransferenciasComponent;
  let http: HttpTestingController;
  const order: OrdenTransferencia = { id: 9, dispositivoId: 8, tecnicoId: 3, tecnicoNombre: 'Laura',
    centroOrigenId: 1, centroOrigenNombre: 'Central', centroDestinoId: null, centroDestinoNombre: null,
    estado: 'PENDIENTE', motivo: 'Reparación', fechaSolicitud: '2026-10-08T12:00:00Z',
    fechaCompletado: null, dispositivoTitulo: 'Procesador', codigoTrazabilidad: 'RAEE-TEST',
    estadoDisponibilidad: 'RESERVADO', pesoKg: 0.05 };
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TransferenciasComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TransferenciasComponent);
    component = fixture.componentInstance; fixture.detectChanges();
    http.expectOne('/api/transferencias/mis-ordenes').flush({ success: true, data: [
      order, { ...order, id: 10, estado: 'COMPLETADA', estadoDisponibilidad: 'ENTREGADO' }
    ] });
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('only shows active orders and sends no mutation when the dialog is cancelled', () => {
    expect(component.activas().length).toBe(1);
    component.abrirConfirmacion(order);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').textContent).toContain('irreversible');
    http.expectNone('/api/transferencias/9/completar');
    component.cerrar();
    expect(component.seleccionada()).toBeNull();
    http.expectNone('/api/transferencias/9/completar');
  });
  it('confirms once, updates both states and emits the dashboard refresh event', () => {
    let events = 0;
    const subscription = TestBed.inject(TransferenciasService).cambios$.subscribe(() => events++);
    component.abrirConfirmacion(order); component.confirmar(); component.confirmar();
    const request = http.expectOne('/api/transferencias/9/completar');
    expect(request.request.method).toBe('PATCH');
    expect(component.confirmando()).toBeTrue();
    request.flush({ success: true, data: { id: 9, dispositivoId: 8, estado: 'COMPLETADA', estadoDisponibilidad: 'ENTREGADO' } });
    expect(component.ordenes()[0].estado).toBe('COMPLETADA');
    expect(component.ordenes()[0].estadoDisponibilidad).toBe('ENTREGADO');
    expect(component.activas().length).toBe(0);
    expect(component.confirmando()).toBeFalse();
    expect(component.aviso()).toContain('Recepción física confirmada');
    expect(events).toBe(1);
    subscription.unsubscribe();
  });
  it('does not claim completion or emit metrics events on a concurrent conflict', () => {
    let events = 0;
    const subscription = TestBed.inject(TransferenciasService).cambios$.subscribe(() => events++);
    component.abrirConfirmacion(order); component.confirmar();
    http.expectOne('/api/transferencias/9/completar').flush({ error: 'Ya completada' }, { status: 409, statusText: 'Conflict' });
    expect(component.errorConfirmacion()).toContain('cambió de estado');
    expect(component.ordenes()[0].estado).toBe('PENDIENTE');
    expect(component.confirmando()).toBeFalse();
    expect(component.aviso()).toBeNull();
    expect(events).toBe(0); subscription.unsubscribe();
  });
});
 ``` 
## backend/tests/tarea5.test.ts  ```typescript import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import pool from '../src/config/database';
import { AuthRequest } from '../src/middleware/auth.middleware';
import { crearDispositivo } from '../src/controllers/publicaciones.controller';
import { misOrdenes } from '../src/controllers/transferencias.controller';

afterEach((): void => mock.restoreAll());
function response(rol: string): { res: Response; status: () => number; body: () => unknown } {
  let code: number = 200; let body: unknown;
  const res = { locals: { rol }, status(value: number): unknown { code = value; return res; },
    json(value: unknown): unknown { body = value; return res; } } as unknown as Response;
  return { res, status: (): number => code, body: (): unknown => body };
}
function request(body: unknown = {}): AuthRequest {
  return { usuario: { id: 5, email: 'user@example.com', rolId: 2, nombre: 'Nuevo usuario' },
    body, query: { tecnicoId: 999 } } as unknown as AuthRequest;
}
const propagate = (error?: unknown): void => { if (error) throw error; };

test('mis-ordenes filters TECHNICIAN by JWT id and ignores supplied technician id', async () => {
  let sqlText: string = ''; let parameters: unknown[] = [];
  mock.method(pool, 'execute', async (sql: string, args: unknown[]) => {
    sqlText = sql; parameters = args; return [[], []];
  });
  await misOrdenes(request(), response('TECHNICIAN').res, propagate);
  assert.match(sqlText, /WHERE o.tecnico_id = \?/);
  assert.deepEqual(parameters, [5]);
});
test('ADMIN lists all orders without technician filter', async () => {
  let sqlText: string = ''; let parameters: unknown[] = [];
  mock.method(pool, 'execute', async (sql: string, args: unknown[]) => {
    sqlText = sql; parameters = args; return [[], []];
  });
  await misOrdenes(request(), response('ADMIN').res, propagate);
  assert.doesNotMatch(sqlText, /WHERE o.tecnico_id/);
  assert.deepEqual(parameters, []);
});
test('publication validates positive weight before acquiring a connection', async () => {
  let acquired = false;
  mock.method(pool, 'getConnection', async () => { acquired = true; throw new Error('Should not connect'); });
  const output = response('DONOR');
  await crearDispositivo(request({ titulo: 'CPU nuevo', categoriaId: 1, centroAcopioId: 1,
    estadoFuncional: 'OPERATIVO', pesoKg: 0 }), output.res, propagate);
  assert.equal(output.status(), 400); assert.equal(acquired, false);
});
test('publication assigns donor from JWT and commits a category-compatible device', async () => {
  let parameters: unknown[] = []; let committed = false; let released = false;
  const connection = {
    beginTransaction: async (): Promise<void> => {},
    execute: async (sql: string, args: unknown[]): Promise<unknown[]> => {
      if (sql.startsWith('SELECT id')) return [[{ id: 1, codigo: 'RAEE-MB', nombre: 'Placas' }], []];
      if (sql.includes('FROM centros_acopio')) return [[{ id: 1, nombre: 'Central' }], []];
      parameters = args; return [{ insertId: 100 }, []];
    },
    commit: async (): Promise<void> => { committed = true; },
    rollback: async (): Promise<void> => {},
    release: (): void => { released = true; }
  } as unknown as PoolConnection;
  mock.method(pool, 'getConnection', async () => connection);
  const output = response('DONOR');
  await crearDispositivo(request({ titulo: 'CPU nuevo', categoriaId: 1, centroAcopioId: 1,
    estadoFuncional: 'OPERATIVO', pesoKg: 1, donanteId: 999 }), output.res, propagate);
  assert.equal(output.status(), 201); assert.equal(parameters[3], 5);
  assert.equal(parameters[10], 35.5); assert.equal(committed, true); assert.equal(released, true);
});
test('incompatible centre rolls back publication and returns conflict', async () => {
  let rolledBack = false; let committed = false;
  const connection = {
    beginTransaction: async (): Promise<void> => {},
    execute: async (sql: string): Promise<unknown[]> =>
      sql.startsWith('SELECT id') ? [[{ id: 1, codigo: 'RAEE-MB', nombre: 'Placas' }], []] : [[], []],
    commit: async (): Promise<void> => { committed = true; },
    rollback: async (): Promise<void> => { rolledBack = true; },
    release: (): void => {}
  } as unknown as PoolConnection;
  mock.method(pool, 'getConnection', async () => connection);
  const output = response('DONOR');
  await crearDispositivo(request({ titulo: 'CPU nuevo', categoriaId: 1, centroAcopioId: 2,
    estadoFuncional: 'OPERATIVO', pesoKg: 1 }), output.res, propagate);
  assert.equal(output.status(), 409); assert.equal(rolledBack, true); assert.equal(committed, false);
});
 ``` 
## backend/api.http  ```http @baseUrl = http://localhost:3000/api
@contentType = application/json
@dispositivoTransferenciaId = 2

### 1. Health Check (Verificación de estado)
GET {{baseUrl}}/health
Accept: {{contentType}}

### 2. Autenticación - Login de Administrador
# @name loginAdmin
POST {{baseUrl}}/auth/login
Content-Type: {{contentType}}

{
  "email": "admin@ecoplaca.org",
  "password": "ecoplaca2026"
}

### Guardar token JWT recibido
@authToken = {{loginAdmin.response.body.data.token}}

### 3. Autenticación - Registro de nuevo usuario
POST {{baseUrl}}/auth/register
Content-Type: {{contentType}}

{
  "nombreCompleto": "Mario Taller de Reparación",
  "email": "mario.taller@ejemplo.com",
  "password": "ecoplaca2026",
  "rolId": 3,
  "telefono": "+52 33 9988 1122",
  "direccion": "Av. Vallarta 1500, Guadalajara"
}

### 4. Consultar Perfil con Token
GET {{baseUrl}}/auth/perfil
Authorization: Bearer {{authToken}}
Accept: {{contentType}}

### 5. Listar todos los dispositivos catalogados
GET {{baseUrl}}/dispositivos
Accept: {{contentType}}

### 6. Filtrar dispositivos disponibles y en estado funcional reparable
GET {{baseUrl}}/dispositivos?estado=DISPONIBLE&estadoFuncional=REPARABLE
Accept: {{contentType}}

### 7. Buscar dispositivos por texto libre
GET {{baseUrl}}/dispositivos?busqueda=Ryzen
Accept: {{contentType}}

### 8. Obtener detalle de un dispositivo por ID
GET {{baseUrl}}/dispositivos/1
Accept: {{contentType}}

### 9. Catalogar un nuevo dispositivo RAEE
POST {{baseUrl}}/dispositivos
Content-Type: {{contentType}}

{
  "titulo": "Placa Madre Gigabyte B550 AORUS Elite AX V2",
  "categoriaId": 1,
  "donanteId": 2,
  "centroAcopioId": 1,
  "marca": "Gigabyte",
  "modelo": "B550 AORUS Elite AX V2",
  "numeroSerie": "SN-GB550-99812",
  "estadoFuncional": "REPARABLE",
  "pesoKg": 1.10,
  "especificaciones": {
    "socket": "AM4",
    "chipset": "AMD B550",
    "formato": "ATX"
  },
  "notas": "Donada con BIOS corrupta. Requiere reprogramación de chip SPI Flash."
}

### 10. Actualizar estado de un dispositivo
PATCH {{baseUrl}}/dispositivos/1/estado
Authorization: Bearer {{authToken}}
Content-Type: {{contentType}}

{
  "estadoDisponibilidad": "RESERVADO",
  "estadoFuncional": "REPARABLE",
  "notas": "Apartado para taller de estudiantes de bachillerato técnico."
}

### 11. Login del técnico responsable
# @name loginTecnico
POST {{baseUrl}}/auth/login
Content-Type: {{contentType}}

{
  "email": "laura.tecnico@ecoplaca.org",
  "password": "ecoplaca2026"
}

@tecnicoToken = {{loginTecnico.response.body.data.token}}

### 12. Métricas antes de la entrega (200)
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoToken}}

### 13. Solicitar transferencia (201, dispositivo RESERVADO)
# Usar un dispositivo DISPONIBLE sin órdenes activas; el dispositivo seed 2 cumple.
# @name solicitarTransferencia
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "centroDestinoId": 2,
  "motivo": "Recuperación para taller de reparación"
}

@transferenciaId = {{solicitarTransferencia.response.body.data.id}}

### 14. Reservar nuevamente el mismo dispositivo (409)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "centroDestinoId": 2,
  "motivo": "Segunda solicitud que debe rechazarse"
}

### 15. Confirmar entrega física (200, COMPLETADA y ENTREGADO)
PATCH {{baseUrl}}/transferencias/{{transferenciaId}}/completar
Authorization: Bearer {{tecnicoToken}}

### 16. Repetir confirmación (409, métricas sin duplicación)
PATCH {{baseUrl}}/transferencias/{{transferenciaId}}/completar
Authorization: Bearer {{tecnicoToken}}

### 17. Métricas después de la entrega (200)
# Con el dispositivo seed 2: incremento de 1.60 kg y 29.12 kg CO2.
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoToken}}

### 18. Solicitud inválida (400)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": -1,
  "motivo": ""
}

### 19. Dashboard sin JWT (401)
GET {{baseUrl}}/dashboard/metricas

### 20. Administrador solicita como técnico (403)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{authToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "motivo": "Solicitud con rol no autorizado"
}

### TAREA 5 - Ciclo completo con usuarios y hardware nuevos
# Ejecutar en este orden. Cambia los IDs de categoría/centro según opciones-publicacion.
### Registro de donante nuevo
# @name registroDonanteT5
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "nombreCompleto": "Donante Evaluacion Tarea 5",
  "email": "donante.t5.{{$timestamp}}@example.com",
  "password": "EcoPlacaDemo2026!",
  "rolId": 2
}

### Login del donante recién creado
# @name loginDonanteT5
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{registroDonanteT5.response.body.data.email}}",
  "password": "EcoPlacaDemo2026!"
}

@donanteT5Token = {{loginDonanteT5.response.body.data.token}}

### Categorías y centros reales
GET {{baseUrl}}/dispositivos/opciones-publicacion
Authorization: Bearer {{donanteT5Token}}

### Publicar hardware nuevo (201)
# @name publicarHardwareT5
POST {{baseUrl}}/dispositivos
Authorization: Bearer {{donanteT5Token}}
Content-Type: application/json

{
  "titulo": "Placa madre nueva para evaluación",
  "categoriaId": 1,
  "centroAcopioId": 1,
  "marca": "ASUS",
  "modelo": "Placa de evaluación",
  "numeroSerie": "T5-{{$timestamp}}",
  "estadoFuncional": "REPARABLE",
  "pesoKg": 1.25,
  "notas": "Hardware publicado durante el recorrido completo."
}

@hardwareT5Id = {{publicarHardwareT5.response.body.data.id}}

### Registro de técnico nuevo
# @name registroTecnicoT5
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "nombreCompleto": "Tecnico Evaluacion Tarea 5",
  "email": "tecnico.t5.{{$timestamp}}@example.com",
  "password": "EcoPlacaDemo2026!",
  "rolId": 3
}

### Login del técnico recién creado
# @name loginTecnicoT5
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{registroTecnicoT5.response.body.data.email}}",
  "password": "EcoPlacaDemo2026!"
}

@tecnicoT5Token = {{loginTecnicoT5.response.body.data.token}}

### Métricas antes de entrega
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoT5Token}}

### Reserva del hardware nuevo
# @name reservaT5
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoT5Token}}
Content-Type: application/json

{
  "dispositivoId": {{hardwareT5Id}},
  "motivo": "Reparación durante la evaluación de principio a fin"
}

@ordenT5Id = {{reservaT5.response.body.data.id}}

### Mis órdenes del técnico
GET {{baseUrl}}/transferencias/mis-ordenes
Authorization: Bearer {{tecnicoT5Token}}

### Confirmar recepción física solo después de recibir el hardware (200)
PATCH {{baseUrl}}/transferencias/{{ordenT5Id}}/completar
Authorization: Bearer {{tecnicoT5Token}}

### Verificar hardware ENTREGADO
GET {{baseUrl}}/dispositivos/{{hardwareT5Id}}

### Verificar orden COMPLETADA
GET {{baseUrl}}/transferencias/mis-ordenes
Authorization: Bearer {{tecnicoT5Token}}

### Métricas tras entrega (incremento esperado: 1.25 kg y 44.38 kg CO2 con RAEE-MB)
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoT5Token}}

### Repetir entrega (409, no duplica impacto)
PATCH {{baseUrl}}/transferencias/{{ordenT5Id}}/completar
Authorization: Bearer {{tecnicoT5Token}}

### Donante intenta listar órdenes (403)
GET {{baseUrl}}/transferencias/mis-ordenes
Authorization: Bearer {{donanteT5Token}}

### Publicación sin JWT (401)
POST {{baseUrl}}/dispositivos
Content-Type: application/json

{ "titulo": "Publicación sin sesión" }
 ``` 