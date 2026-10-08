import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-not-found', standalone: true, imports: [RouterLink],
  template: '<section><h1>404 · Página no encontrada</h1><p>La dirección solicitada no existe.</p><a routerLink="/catalogo">Volver al catálogo</a></section>',
  styles: ['section{padding:3rem;text-align:center;color:#1B4965}a{color:#1B4965;text-decoration-color:#2EC4B6}']
})
export class NotFoundComponent {}
