import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ComentarioItem {
  id: number;
  autor: string;
  rol: string;
  dispositivoCodigo: string;
  contenido: string;
  fecha: string;
}

@Component({
  selector: 'app-comentarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comentarios.component.html',
  styleUrls: ['./comentarios.component.css']
})
export class ComentariosComponent {
  nuevoComentario = '';
  codigoDispositivo = 'RAEE-2026-0001';

  comentarios = signal<ComentarioItem[]>([
    {
      id: 1,
      autor: 'Ing. Laura Valenzuela',
      rol: 'Técnico Especialista',
      dispositivoCodigo: 'RAEE-2026-0001',
      contenido: 'Placa madre recibida en taller. Se identificó falla en regulador de voltaje VRM. Lista para sustitución de microcomponentes.',
      fecha: '08/10/2026 11:20'
    },
    {
      id: 2,
      autor: 'TecnoEmpresa Donaciones',
      rol: 'Donante Corporativo',
      dispositivoCodigo: 'RAEE-2026-0002',
      contenido: 'Lote de 5 fuentes entregado al centro de acopio central con comprobante de custodia ambiental firmado.',
      fecha: '08/10/2026 09:45'
    }
  ]);

  agregarComentario(): void {
    if (!this.nuevoComentario.trim()) return;

    const nuevo: ComentarioItem = {
      id: Date.now(),
      autor: 'Taller Técnico Re-Boot',
      rol: 'Técnico',
      dispositivoCodigo: this.codigoDispositivo,
      contenido: this.nuevoComentario.trim(),
      fecha: new Date().toLocaleString()
    };

    this.comentarios.update(list => [nuevo, ...list]);
    this.nuevoComentario = '';
  }
}
