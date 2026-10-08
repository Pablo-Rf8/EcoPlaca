import { ComponentFixture, TestBed } from '@angular/core/testing';
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
