import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
export const nonBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim().length > 0 ? null : { required: true };
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se pudo conectar con la API. Intenta nuevamente.';
    if (error.status === 401) return 'Correo o contraseña incorrectos.';
    return typeof error.error?.error === 'string' ? error.error.error : 'No se pudo completar la solicitud.';
  }
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
