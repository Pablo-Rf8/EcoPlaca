# EcoPlaca — Tarea 3 implementada

Se crearon y modificaron los archivos de autenticación del proyecto C:\EcoPlaca. El código completo de cada archivo aparece abajo con su ruta exacta.

## Comportamiento

- Login POST /api/auth/login; registro POST /api/auth/register; perfil GET /api/auth/perfil.
- El registro conserva el contrato actual del backend: devuelve el usuario creado y redirige a login; el login devuelve JWT y usuario con rol.
- Signals para usuario y autenticación, restauración del perfil, expiración del JWT, logout y sincronización de logout entre pestañas.
- authGuard conserva returnUrl. roleGuard devuelve un UrlTree y muestra una alerta global cuando falta permiso.
- Catálogo público en /catalogo. Comentarios y notas requieren ADMIN o TECHNICIAN; DONOR puede navegar el catálogo.
- Formularios Standalone con validaciones, errores, indicador de carga y bloqueo de envíos repetidos.
- Navbar reactiva y página 404. Paleta #1B4965 y #2EC4B6.
- Interceptores JWT y errores. El token se envía únicamente a la API configurada, excluyendo login y registro.
- Se quitó la contraseña universal de prueba del backend; BCrypt es obligatorio. Registro público limitado a rolId 2 o 3. JWT_SECRET es obligatorio. Perfil solo para usuarios activos.

## Configuración y límites

Desarrollo: ejecutar el backend en puerto 3000 y el frontend con npm start; proxy.conf.json redirige /api al backend.

Producción: publicar /api mediante reverse proxy bajo el mismo origen del frontend. Para una API en otro dominio, configurar el provider API_URL en app.config.ts y CORS en el servidor. No se realizó despliegue.

localStorage guarda solo el JWT y nunca la contraseña. Sigue siendo accesible a JavaScript y no ofrece protección HttpOnly frente a XSS. La lectura de exp en el cliente sirve para gestionar la sesión; el servidor verifica la firma.

Los guards controlan navegación; la autorización de los endpoints debe aplicarse en el backend. Referencia oficial: https://angular.dev/guide/routing/route-guards

Contraseñas nuevas: mínimo 8 caracteres; BCrypt admite hasta 72 bytes UTF-8. Cuentas seed necesitan hashes BCrypt válidos ahora que se eliminó el acceso de prueba.

## Validación

- Build de producción Angular: aprobado.
- TypeScript backend con --noEmit: aprobado.
- Suite Angular en ChromeHeadless: 12 pruebas aprobadas. Incluye login/logout, restauración del perfil, expiración, rechazo de sesión, guards y alcance del JWT.
- Las pruebas de autenticación usan respuestas HTTP simuladas; no se validó login o registro contra una base MySQL real.

## Código completo

## backend/src/controllers/auth.controller.ts  ```typescript import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { AuthRequest } from '../middleware/auth.middleware';

export const authController = {
  // Inicio de sesión con autenticación BCrypt y generación de JWT
  login: async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      res.status(400).json({
        success: false,
        error: 'Debe ingresar email y contraseña',
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const [rows] = await pool.query<RowDataPacket[]>(`
        SELECT u.id, u.rol_id, r.nombre AS rol_nombre, u.nombre_completo, u.email, u.password_hash, u.activo
        FROM usuarios u
        INNER JOIN roles r ON u.rol_id = r.id
        WHERE u.email = ?
      `, [email]);

      if (!rows || rows.length === 0) {
        res.status(401).json({
          success: false,
          error: 'Credenciales inválidas',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const usuario = rows[0];

      if (!usuario.activo) {
        res.status(403).json({
          success: false,
          error: 'Cuenta inactiva. Contacte al administrador',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Comparación exclusiva con el hash BCrypt almacenado
      const passwordMatch = await bcrypt.compare(password, usuario.password_hash);

      if (!passwordMatch) {
        res.status(401).json({
          success: false,
          error: 'Credenciales inválidas',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const secret: string | undefined = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET no está configurado');
      const token = jwt.sign(
        {
          id: usuario.id,
          email: usuario.email,
          rolId: usuario.rol_id,
          rol: usuario.rol_nombre,
          nombre: usuario.nombre_completo
        },
        secret,
        { expiresIn: '7d' }
      );

      res.status(200).json({
        success: true,
        message: 'Autenticación exitosa',
        data: {
          token,
          usuario: {
            id: usuario.id,
            nombreCompleto: usuario.nombre_completo,
            email: usuario.email,
            rol: usuario.rol_nombre
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error interno de autenticación: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Registro de nuevo donante o técnico
  register: async (req: Request, res: Response): Promise<void> => {
    const { nombreCompleto, email, password, rolId, telefono, direccion } = req.body;

    if (typeof nombreCompleto !== 'string' || nombreCompleto.trim().length < 2 || nombreCompleto.trim().length > 150
        || typeof email !== 'string' || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72
        || (rolId !== undefined && rolId !== 2 && rolId !== 3)) {
      res.status(400).json({
        success: false,
        error: 'Nombre, correo o contraseña inválidos. Selecciona DONOR o TECHNICIAN.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM usuarios WHERE email = ?', [email]);
      if (existing.length > 0) {
        res.status(400).json({
          success: false,
          error: 'El correo electrónico ya se encuentra registrado',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const [result] = await pool.query<ResultSetHeader>(`
        INSERT INTO usuarios (rol_id, nombre_completo, email, password_hash, telefono, direccion)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [rolId || 2, nombreCompleto, email, passwordHash, telefono || null, direccion || null]);

      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          id: result.insertId,
          nombreCompleto,
          email,
          rolId: rolId || 2
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({
        success: false,
        error: `Error al registrar usuario: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Perfil del usuario autenticado
  perfil: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.usuario) {
      res.status(401).json({ success: false, error: 'No autorizado' });
      return;
    }

    try {
      const [rows] = await pool.query<RowDataPacket[]>(`
        SELECT u.id, u.rol_id, r.nombre AS rol_nombre, u.nombre_completo, u.email, u.telefono, u.direccion, u.created_at
        FROM usuarios u
        INNER JOIN roles r ON u.rol_id = r.id
        WHERE u.id = ? AND u.activo = TRUE
      `, [req.usuario.id]);

      if (rows.length === 0) {
        res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        return;
      }

      res.status(200).json({
        success: true,
        data: rows[0],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ success: false, error: err.message });
    }
  }
};
 ``` 
## backend/src/middleware/auth.middleware.ts  ```typescript import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  id: number;
  email: string;
  rolId: number;
  nombre: string;
}

export interface AuthRequest extends Request {
  usuario?: TokenPayload;
}

/**
 * Middleware para validar tokens JWT en cabecera Authorization: Bearer <token>
 */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token: string | undefined = authHeader?.match(/^Bearer ([^ ]+)$/)?.[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Acceso denegado: Token de autenticación no proporcionado',
      timestamp: new Date().toISOString()
    });
    return;
  }

  const secret: string | undefined = process.env.JWT_SECRET;
  if (!secret) { next(new Error('JWT_SECRET no está configurado')); return; }

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      res.status(401).json({
        success: false,
        error: 'Token inválido o expirado',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!decoded || typeof decoded !== 'object' || !Number.isSafeInteger(decoded['id']) || decoded['id'] <= 0) {
      res.status(401).json({ success: false, error: 'Token inválido' }); return;
    }
    req.usuario = decoded as TokenPayload;
    next();
  });
}
 ``` 
## frontend/src/app/services/dispositivos.service.ts  ```typescript import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_URL } from '../config/api.config';
import { Dispositivo } from '../models/dispositivo.model';

export type DispositivoItem = Dispositivo;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DispositivosService {
  private http = inject(HttpClient);
  private readonly apiUrl: string = inject(API_URL) + '/dispositivos';

  // Obtener dispositivos catalogados
  getDispositivos(estado?: string): Observable<DispositivoItem[]> {
    let url = this.apiUrl;
    if (estado && estado !== 'TODOS') {
      url += `?estado=${estado}`;
    }
    return this.http.get<ApiResponse<DispositivoItem[]>>(url).pipe(
      map(res => res.data)
    );
  }

  // Obtener dispositivo por ID
  getDispositivoById(id: number): Observable<DispositivoItem> {
    return this.http.get<ApiResponse<DispositivoItem>>(`${this.apiUrl}/${id}`).pipe(
      map(res => res.data)
    );
  }
}
 ``` 
## frontend/angular.json  ```json {
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "cli": {
    "packageManager": "npm"
  },
  "newProjectRoot": "projects",
  "projects": {
    "frontend": {
      "projectType": "application",
      "schematics": {
        "@schematics/angular:component": {
          "style": "scss"
        }
      },
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist/frontend",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": [
              "zone.js"
            ],
            "tsConfig": "tsconfig.app.json",
            "inlineStyleLanguage": "css",
            "assets": [
              {
                "glob": "**/*",
                "input": "public"
              }
            ],
            "styles": [
              "src/styles.css"
            ],
            "scripts": []
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "500kB",
                  "maximumError": "1MB"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "4kB",
                  "maximumError": "8kB"
                }
              ],
              "outputHashing": "all"
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "options": { "proxyConfig": "proxy.conf.json" },
          "configurations": {
            "production": {
              "buildTarget": "frontend:build:production"
            },
            "development": {
              "buildTarget": "frontend:build:development"
            }
          },
          "defaultConfiguration": "development"
        },
        "extract-i18n": {
          "builder": "@angular-devkit/build-angular:extract-i18n"
        },
        "test": {
          "builder": "@angular-devkit/build-angular:karma",
          "options": {
            "polyfills": [
              "zone.js",
              "zone.js/testing"
            ],
            "tsConfig": "tsconfig.spec.json",
            "inlineStyleLanguage": "css",
            "assets": [
              {
                "glob": "**/*",
                "input": "public"
              }
            ],
            "styles": [
              "src/styles.css"
            ],
            "scripts": []
          }
        }
      }
    }
  }
}
 ``` 
## frontend/src/app/services/auth.service.ts  ```typescript import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
        if (requestedToken === this.token()) this.clearSession();
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
 ``` 
## frontend/src/app/services/auth.service.spec.ts  ```typescript import { TestBed } from '@angular/core/testing';
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
});
 ``` 
## frontend/src/app/guards/guards.spec.ts  ```typescript import { TestBed } from '@angular/core/testing';
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
 ``` 
## frontend/src/app/interceptors/auth.interceptor.spec.ts  ```typescript import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';
describe('JWT request scope', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: AuthService, useValue: { getToken: (): string => 'test-token' } }
    ] });
    http = TestBed.inject(HttpTestingController); client = TestBed.inject(HttpClient);
  });
  afterEach(() => http.verify());
  it('attaches JWT only to private API requests', () => {
    client.get('/api/auth/perfil').subscribe();
    const privateRequest = http.expectOne('/api/auth/perfil');
    expect(privateRequest.request.headers.get('Authorization')).toBe('Bearer test-token');
    privateRequest.flush({});
    for (const url of ['/api/auth/login', '/api/auth/register', 'https://other.example/api/test', '/api-other/test']) {
      client.get(url).subscribe();
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({});
    }
  });
});
 ``` 
## frontend/src/app/app.component.spec.ts  ```typescript import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent], providers: [provideHttpClient(), provideRouter([])]
    }).compileComponents();
    localStorage.removeItem('ecoplaca_token');
  });
  it('renders the authentication links for an anonymous visitor', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Iniciar sesión');
    expect(element.textContent).toContain('Registro');
  });
});
 ``` 
## frontend/src/app/components/navbar/navbar.component.spec.ts  ```typescript import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavbarComponent } from './navbar.component';
import { provideRouter } from '@angular/router';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [provideRouter([]), provideHttpClient()]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the navbar component', () => {
    expect(component).toBeTruthy();
  });
});
 ``` 