import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      categorias: [{ id: 4, codigo: 'RAEE-CPU', nombre: 'CPU' },
        { id: 2, codigo: 'RAEE-PCB', nombre: 'Placas' },
        { id: 5, codigo: 'RAEE-MON', nombre: 'Pantallas' }],
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
    for (const weight of [0, -1, 0.001, 1e-9, 10000]) {
      component.form.controls.pesoKg.setValue(weight);
      component.submit(); http.expectNone('/api/dispositivos');
    }
    component.form.controls.pesoKg.setValue(0.01);
    expect(component.form.controls.pesoKg.valid).toBeTrue();
  });
  it('selects a sole compatible centre and clears the selection when multiple or no centres are available', () => {
    validForm();
    expect(component.centrosDisponibles().map(c => c.id)).toEqual([1]);
    component.form.controls.categoriaId.setValue(2);
    expect(component.form.controls.centroAcopioId.value).toBe(2);
    expect(component.centrosDisponibles().map(c => c.id)).toEqual([2]);

    component.centros.update(centres => [...centres,
      { id: 3, nombre: 'Alterno', ciudad: 'Guatemala', categoriaId: 4 }]);
    component.form.controls.categoriaId.setValue(4);
    expect(component.form.controls.centroAcopioId.value).toBe(0);
    expect(component.centrosDisponibles().map(c => c.id)).toEqual([1, 3]);

    component.form.controls.centroAcopioId.setValue(3);
    component.form.controls.categoriaId.setValue(5);
    expect(component.form.controls.centroAcopioId.value).toBe(0);
    expect(component.centrosDisponibles()).toEqual([]);
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
