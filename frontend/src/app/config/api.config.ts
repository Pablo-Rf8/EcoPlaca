import { InjectionToken } from '@angular/core';
// Producción: publicar /api bajo el mismo origen mediante un reverse proxy.
// Para otro origen, proporcionar API_URL en app.config.ts.
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root', factory: (): string => '/api'
});
