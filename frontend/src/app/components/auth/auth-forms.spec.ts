import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';

describe('Authentication form API constraints', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent, RegisterComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); });

  it('rejects a one-character name padded with whitespace before registering', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    component.form.setValue({ nombreCompleto: ' A ', email: 'ana@example.com', password: 'password123', rolId: 2 });
    component.submit();
    expect(component.form.controls.nombreCompleto.invalid).toBeTrue();
    expect(component.form.controls.nombreCompleto.touched).toBeTrue();
    http.expectNone('/api/auth/register');
    fixture.destroy();
  });

  it('rejects Unicode passwords over 72 UTF-8 bytes in registration and login', () => {
    const registration = TestBed.createComponent(RegisterComponent);
    registration.componentInstance.form.setValue({
      nombreCompleto: 'Ana', email: 'ana@example.com', password: 'á'.repeat(37), rolId: 2
    });
    registration.componentInstance.submit();
    expect(registration.componentInstance.form.controls.password.hasError('passwordBytes')).toBeTrue();
    http.expectNone('/api/auth/register');

    const login = TestBed.createComponent(LoginComponent);
    login.componentInstance.form.setValue({ email: 'ana@example.com', password: '😀'.repeat(19) });
    login.componentInstance.submit();
    expect(login.componentInstance.form.controls.password.hasError('passwordBytes')).toBeTrue();
    http.expectNone('/api/auth/login');
    registration.destroy(); login.destroy();
  });

  it('accepts exactly 72 UTF-8 bytes, trims the name and redirects after registration', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    component.form.setValue({
      nombreCompleto: '  Ana María  ', email: 'ana@example.com', password: 'á'.repeat(36), rolId: 3
    });
    component.submit(); component.submit();
    const request = http.expectOne('/api/auth/register');
    expect(request.request.body.nombreCompleto).toBe('Ana María');
    expect(request.request.body.password).toBe('á'.repeat(36));
    request.flush({ success: true, data: { id: 2, nombreCompleto: 'Ana María', email: 'ana@example.com', rolId: 3 } });
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { registered: '1' } });
    fixture.destroy();
  });
});
