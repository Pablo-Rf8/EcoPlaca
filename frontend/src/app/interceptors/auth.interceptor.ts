import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor para adjuntar token JWT de autorización en cabeceras HTTP
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('ecoplaca_token');

  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(authReq);
  }

  return next(req);
};
