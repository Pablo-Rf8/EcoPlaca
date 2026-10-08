import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  template: `
    <footer class="eco-footer">
      <div class="footer-container">
        <div class="footer-brand">
          <h3>Eco<span>Placa</span></h3>
          <p>Trazabilidad y gestión circular de residuos electrónicos (RAEE). Conectando donantes con talleres técnicos y recicladores para un futuro sostenible.</p>
        </div>
        <div class="footer-bottom">
          <p>© 2026 EcoPlaca - Plataforma de Código Abierto para la Sostenibilidad Tecnológica.</p>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .eco-footer {
      background: #0b1120;
      color: #94a3b8;
      padding: 3rem 1.5rem 2rem 1.5rem;
      border-top: 1px solid #1e293b;
      margin-top: 4rem;
    }
    .footer-container {
      max-width: 1200px;
      margin: 0 auto;
      text-align: center;
    }
    .footer-brand h3 {
      font-size: 1.5rem;
      color: #ffffff;
      margin-bottom: 0.5rem;
      span { color: #10b981; }
    }
    .footer-brand p {
      max-width: 600px;
      margin: 0 auto 1.5rem auto;
      font-size: 0.9rem;
      line-height: 1.6;
    }
    .footer-bottom {
      border-top: 1px solid #1e293b;
      padding-top: 1.5rem;
      font-size: 0.8rem;
    }
  `]
})
export class FooterComponent {}
