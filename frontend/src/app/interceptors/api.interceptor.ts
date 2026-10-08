import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor para redirigir peticiones relativas a la URL base del backend de EcoPlaca
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const backendBaseUrl = 'http://localhost:5000/api';

  // Si la petición no empieza con http/https, anteponemos la URL base de la API
  if (!req.url.startsWith('http://') && !req.url.startsWith('https://')) {
    const apiReq = req.clone({
      url: `${backendBaseUrl}${req.url.startsWith('/') ? '' : '/'}${req.url}`,
      setHeaders: {
        'Accept': 'application/json'
      }
    });
    return next(apiReq);
  }

  return next(req);
};
