import { TestBed } from '@angular/core/testing';
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
