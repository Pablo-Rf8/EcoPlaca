import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { authGuard } from './auth.guard';
import { roleGuard } from './role.guard';
describe('Functional authentication and role guards', () => {
  const state = { url: '/comentarios?dispositivo=2' } as RouterStateSnapshot;
  const route = { data: { roles: ['ADMIN', 'TECHNICIAN'] } } as unknown as ActivatedRouteSnapshot;
  let auth: { ensureSession: jasmine.Spy; hasRole: jasmine.Spy };
  beforeEach(() => {
    auth = { ensureSession: jasmine.createSpy().and.returnValue(of(false)),
      hasRole: jasmine.createSpy().and.returnValue(false) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
  });
  it('redirects anonymous users with the original returnUrl', async () => {
    const result = await firstValueFrom(TestBed.runInInjectionContext(() =>
      authGuard(route, state)) as Observable<boolean | UrlTree>);
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).queryParams['returnUrl']).toBe(state.url);
    expect((result as UrlTree).toString()).toContain('/login');
  });
  it('denies a donor with a visible alert and catalogue redirect', async () => {
    auth.ensureSession.and.returnValue(of(true));
    const result = await firstValueFrom(TestBed.runInInjectionContext(() =>
      roleGuard(route, state)) as Observable<boolean | UrlTree>);
    expect((result as UrlTree).toString()).toBe('/catalogo');
    expect(TestBed.inject(NotificationService).message()).toContain('permiso');
  });
  it('allows authorized users', async () => {
    auth.ensureSession.and.returnValue(of(true));
    auth.hasRole.and.returnValue(true);
    expect(await firstValueFrom(TestBed.runInInjectionContext(() =>
      roleGuard(route, state)) as Observable<boolean | UrlTree>)).toBeTrue();
    expect(auth.hasRole).toHaveBeenCalledWith(['ADMIN', 'TECHNICIAN']);
  });
});
