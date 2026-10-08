import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
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
