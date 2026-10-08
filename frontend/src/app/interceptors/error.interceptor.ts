import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { API_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const api = inject(API_URL).replace(/\/$/, '');
  const requestToken = auth.getToken();
  return next(req).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && req.url.startsWith(api + '/')
        && req.url !== api + '/auth/login' && req.url !== api + '/auth/register'
        && (error.status === 401 || (error.status === 403 && req.url === api + '/auth/perfil'))
        && requestToken && requestToken === auth.getToken()) auth.logout();
    return throwError((): unknown => error);
  }));
};
