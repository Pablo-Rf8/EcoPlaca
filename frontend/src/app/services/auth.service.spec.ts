import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
const user = { id: 1, nombreCompleto: 'Ana', email: 'ana@example.com', rol: 'DONOR' as const };
function token(exp: number): string { return 'header.' + btoa(JSON.stringify({ exp })) + '.signature'; }
describe('AuthService session lifecycle', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.removeItem('ecoplaca_token');
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([])
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    TestBed.inject(AuthService).logout();
    http.verify();
    localStorage.removeItem('ecoplaca_token');
  });
  it('persists a login and clears the full session on logout', () => {
    const auth = TestBed.inject(AuthService);
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const jwt = token(Math.floor(Date.now() / 1000) + 3600);
    auth.login({ email: user.email, password: 'password123' }).subscribe();
    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    request.flush({ success: true, data: { token: jwt, usuario: user } });
    expect(auth.isAuthenticated()).toBeTrue();
    expect(auth.hasRole(['DONOR'])).toBeTrue();
    expect(auth.hasRole(['ADMIN'])).toBeFalse();
    expect(localStorage.getItem('ecoplaca_token')).toBe(jwt);
    auth.logout();
    expect(auth.currentUser()).toBeNull();
    expect(auth.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('ecoplaca_token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });
  it('restores the role from the server profile rather than local user data', () => {
    localStorage.setItem('ecoplaca_token', token(Math.floor(Date.now() / 1000) + 3600));
    const auth = TestBed.inject(AuthService);
    let active = false;
    auth.ensureSession().subscribe(value => { active = value; });
    http.expectOne('/api/auth/perfil').flush({ success: true, data: {
      id: 1, nombre_completo: 'Ana', email: user.email, rol_nombre: 'TECHNICIAN',
      telefono: null, direccion: null
    } });
    expect(active).toBeTrue();
    expect(auth.currentUser()?.rol).toBe('TECHNICIAN');
  });
  it('rejects expired stored tokens without requesting a profile', () => {
    localStorage.setItem('ecoplaca_token', token(Math.floor(Date.now() / 1000) - 10));
    const auth = TestBed.inject(AuthService);
    expect(auth.getToken()).toBeNull();
    expect(auth.isAuthenticated()).toBeFalse();
    http.expectNone('/api/auth/perfil');
  });
  it('clears a restored session when the profile is rejected', () => {
    localStorage.setItem('ecoplaca_token', token(Math.floor(Date.now() / 1000) + 3600));
    const auth = TestBed.inject(AuthService);
    let active = true;
    auth.ensureSession().subscribe(value => { active = value; });
    http.expectOne('/api/auth/perfil').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(active).toBeFalse();
    expect(localStorage.getItem('ecoplaca_token')).toBeNull();
  });
  it('restores a replacement token while the old profile request is still pending', () => {
    const oldToken = token(Math.floor(Date.now() / 1000) + 3600);
    const nextToken = token(Math.floor(Date.now() / 1000) + 7200);
    localStorage.setItem('ecoplaca_token', oldToken);
    const auth = TestBed.inject(AuthService);
    let oldActive = true;
    auth.ensureSession().subscribe(value => { oldActive = value; });
    const oldProfile = http.expectOne('/api/auth/perfil');

    localStorage.setItem('ecoplaca_token', nextToken);
    window.dispatchEvent(new StorageEvent('storage', { key: 'ecoplaca_token', newValue: nextToken }));
    const nextProfile = http.expectOne('/api/auth/perfil');
    oldProfile.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(oldActive).toBeFalse();
    expect(auth.getToken()).toBe(nextToken);

    let nextActive = false;
    auth.ensureSession().subscribe(value => { nextActive = value; });
    http.expectNone('/api/auth/perfil');
    nextProfile.flush({ success: true, data: {
      id: 2, nombre_completo: 'Laura', email: 'laura@example.com', rol_nombre: 'TECHNICIAN',
      telefono: null, direccion: null
    } });
    expect(nextActive).toBeTrue();
    expect(auth.currentUser()?.id).toBe(2);
  });
  it('ignores an old profile that arrives after the replacement session is authenticated', () => {
    localStorage.setItem('ecoplaca_token', token(Math.floor(Date.now() / 1000) + 3600));
    const auth = TestBed.inject(AuthService);
    let oldActive = true;
    auth.ensureSession().subscribe(value => { oldActive = value; });
    const oldProfile = http.expectOne('/api/auth/perfil');

    const nextToken = token(Math.floor(Date.now() / 1000) + 7200);
    localStorage.setItem('ecoplaca_token', nextToken);
    window.dispatchEvent(new StorageEvent('storage', { key: 'ecoplaca_token', newValue: nextToken }));
    http.expectOne('/api/auth/perfil').flush({ success: true, data: {
      id: 2, nombre_completo: 'Laura', email: 'laura@example.com', rol_nombre: 'TECHNICIAN',
      telefono: null, direccion: null
    } });
    oldProfile.flush({ success: true, data: {
      id: 1, nombre_completo: 'Ana', email: user.email, rol_nombre: 'DONOR',
      telefono: null, direccion: null
    } });
    expect(auth.currentUser()?.id).toBe(2);
    expect(oldActive).toBeFalse();
    expect(auth.isAuthenticated()).toBeTrue();
  });
});
