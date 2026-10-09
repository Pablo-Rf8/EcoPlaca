import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section aria-labelledby="not-found-title">
      <span class="codigo" aria-hidden="true">404</span>
      <h1 id="not-found-title">Página no encontrada</h1>
      <p>La dirección solicitada no existe. Puedes volver al catálogo para explorar los dispositivos disponibles.</p>
      <a routerLink="/catalogo">Volver al catálogo <span aria-hidden="true">→</span></a>
    </section>
  `,
  styles: [`
    :host { display: block; padding: clamp(1rem, 6vw, 4rem) 0; }
    section {
      max-width: 620px;
      margin: 0 auto;
      padding: clamp(1.5rem, 5vw, 3rem);
      border: 1px solid #dce7ec;
      border-top: 4px solid #2ec4b6;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 4px 20px rgb(27 73 101 / 6%);
      text-align: center;
      color: #1b4965;
      overflow-wrap: anywhere;
    }
    .codigo { display: block; color: #047857; font-size: clamp(3.5rem, 12vw, 5rem); font-weight: 800; line-height: 1.1; }
    h1 { margin: 1rem 0; font-size: clamp(1.5rem, 4vw, 2rem); line-height: 1.25; }
    p { margin: 0 0 1.75rem; color: #475569; line-height: 1.7; }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .5rem;
      min-height: 44px;
      padding: .8rem 1.25rem;
      border-radius: 8px;
      border-bottom: 3px solid #2ec4b6;
      background: #1b4965;
      color: #fff;
      font-weight: 600;
      text-decoration: none;
    }
    a:hover { background: #14384e; }
    a:focus-visible { outline: 3px solid #047857; outline-offset: 4px; }
    @media (max-width: 420px) { a { display: flex; width: 100%; } }
  `]
})
export class NotFoundComponent {}
