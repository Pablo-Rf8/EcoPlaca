import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError, timeout } from 'rxjs';
import { API_URL } from '../config/api.config';
import { AuthResponse, LoginCredentials, ProfileResponse, RegisterDTO, RegisterResponse, Usuario } from '../models/usuario.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly apiUrl = inject(API_URL);
  private readonly user = signal<Usuario | null>(null);
  private readonly token = signal<string | null>(null);
  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed<boolean>(() => this.user() !== null && this.token() !== null);
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private restoration: Observable<boolean> | undefined;

  constructor() {
    const token = this.readToken();
    if (token && this.expiration(token) > Date.now()) this.setToken(token);
    else this.clearSession();
    if (typeof window !== 'undefined') {
      const onStorage = (event: StorageEvent): void => {
        if (event.key !== 'ecoplaca_token' && event.key !== null) return;
        this.clearMemory();
        const nextToken = this.readToken();
        if (nextToken && this.expiration(nextToken) > Date.now()) {
          this.setToken(nextToken);
          this.ensureSession().subscribe();
        } else this.logout();
      };
      window.addEventListener('storage', onStorage);
      this.destroyRef.onDestroy((): void => {
        window.removeEventListener('storage', onStorage);
        this.clearMemory();
      });
    }
  }

  login(credentials: LoginCredentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap((response: AuthResponse): void => {
        if (!response.success || !response.data?.token || !response.data.usuario
            || this.expiration(response.data.token) <= Date.now()) {
          throw new Error('Respuesta de autenticación inválida');
        }
        try { localStorage.setItem('ecoplaca_token', response.data.token); }
        catch { throw new Error('No se pudo guardar la sesión. Habilita el almacenamiento del navegador.'); }
        this.setToken(response.data.token);
        this.user.set(response.data.usuario);
      })
    );
  }

  register(data: RegisterDTO): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.apiUrl}/auth/register`, data);
  }

  getProfile(): Observable<Usuario> {
    const requestedToken = this.getToken();
    return this.http.get<ProfileResponse>(`${this.apiUrl}/auth/perfil`).pipe(
      timeout(10000),
      map((response: ProfileResponse): Usuario => {
        const profile = response.data;
        if (!response.success || !profile || !['ADMIN', 'DONOR', 'TECHNICIAN'].includes(profile.rol_nombre)) {
          throw new Error('Perfil de usuario inválido');
        }
        return { id: profile.id, nombreCompleto: profile.nombre_completo,
          email: profile.email, rol: profile.rol_nombre,
          telefono: profile.telefono, direccion: profile.direccion };
      }),
      tap((user: Usuario): void => {
        if (requestedToken && requestedToken === this.getToken()) this.user.set(user);
      }),
      catchError((error: unknown): Observable<never> => {
        // Un corte de red no invalida las credenciales guardadas.
        if (requestedToken === this.token()
            && (!(error instanceof HttpErrorResponse) && error instanceof Error && error.name !== 'TimeoutError'
              || error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))) this.clearSession();
        return throwError((): unknown => error);
      })
    );
  }

  ensureSession(): Observable<boolean> {
    if (!this.getToken()) return of(false);
    if (this.currentUser()) return of(true);
    if (!this.restoration) {
      this.restoration = this.getProfile().pipe(
        map((): boolean => this.isAuthenticated()),
        catchError((): Observable<boolean> => of(false)),
        finalize((): void => { this.restoration = undefined; }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.restoration;
  }

  hasRole(roles: string[]): boolean {
    return !!this.getToken() && !!this.currentUser() && roles.includes(this.currentUser()!.rol);
  }

  getToken(): string | null {
    const token = this.token();
    if (token && this.expiration(token) <= Date.now()) { this.clearSession(); return null; }
    return token;
  }

  logout(): void {
    this.clearSession();
    void this.router.navigate(['/login'], { replaceUrl: true });
  }

  private readToken(): string | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage.getItem('ecoplaca_token'); }
    catch { return null; }
  }
  private expiration(token: string): number {
    try {
      const payload: { exp?: unknown } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : 0;
    } catch { return 0; }
  }
  private setToken(token: string): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.token.set(token);
    const remaining = this.expiration(token) - Date.now();
    this.expiryTimer = setTimeout((): void => {
      if (this.expiration(token) <= Date.now()) this.logout();
      else this.setToken(token);
    }, Math.min(remaining, 2147483647));
  }
  private clearMemory(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.user.set(null);
    this.token.set(null);
  }
  private clearSession(): void {
    this.clearMemory();
    try { localStorage.removeItem('ecoplaca_token'); localStorage.removeItem('ecoplaca_user'); }
    catch { /* El estado en memoria también queda limpio si el almacenamiento está bloqueado. */ }
  }
}
