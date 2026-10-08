import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor global para manejo y diagnóstico de errores en peticiones HTTP
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'Ocurrió un error inesperado al conectar con el servidor EcoPlaca.';

      if (error.error instanceof ErrorEvent) {
        // Error de lado del cliente
        errorMessage = `Error: ${error.error.message}`;
      } else {
        // Error del servidor backend
        errorMessage = error.error?.error || error.error?.message || `Error del servidor (${error.status}): ${error.statusText}`;
      }

      console.error('[EcoPlaca HTTP Error]:', {
        url: req.url,
        status: error.status,
        message: errorMessage
      });

      return throwError(() => new Error(errorMessage));
    })
  );
};
