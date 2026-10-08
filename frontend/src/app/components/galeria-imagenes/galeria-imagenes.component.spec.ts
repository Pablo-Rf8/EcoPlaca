import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
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
