import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DispositivosService, DispositivoItem } from '../../services/dispositivos.service';

@Component({
  selector: 'app-galeria-imagenes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './galeria-imagenes.component.html',
  styleUrls: ['./galeria-imagenes.component.css']
})
export class GaleriaImagenesComponent implements OnInit {
  private service = inject(DispositivosService);

  dispositivos = signal<DispositivoItem[]>([]);
  cargando = signal<boolean>(true);
  filtroActual = signal<string>('TODOS');

  ngOnInit(): void {
    this.cargarDispositivos();
  }

  cargarDispositivos(estado?: string): void {
    this.cargando.set(true);
    this.service.getDispositivos(estado).subscribe({
      next: (items) => {
        this.dispositivos.set(items);
        this.cargando.set(false);
      },
      error: () => {
        // Datos demostrativos de respaldo si el backend no responde
        this.dispositivos.set([
          {
            id: 1,
            codigoTrazabilidad: 'RAEE-2026-0001',
            titulo: 'Tarjeta Madre Asus Prime B450M-A II',
            categoriaId: 1,
            categoriaNombre: 'Tarjetas Madre y Circuitos PCB',
            marca: 'ASUS',
            modelo: 'Prime B450M-A II',
            estadoFuncional: 'REPARABLE',
            estadoDisponibilidad: 'DISPONIBLE',
            pesoKg: 0.85,
            co2EvitadoKg: 30.17,
            centroAcopioNombre: 'Centro de Acopio Central - CDMX',
            notas: 'Requiere soldadura de puerto PCIe y diagnóstico de VRM.'
          },
          {
            id: 2,
            codigoTrazabilidad: 'RAEE-2026-0002',
            titulo: 'Fuente de Poder EVGA 600W 80+ White',
            categoriaId: 2,
            categoriaNombre: 'Fuentes de Poder',
            marca: 'EVGA',
            modelo: '600 W1',
            estadoFuncional: 'OPERATIVO',
            estadoDisponibilidad: 'DISPONIBLE',
            pesoKg: 1.60,
            co2EvitadoKg: 29.12,
            centroAcopioNombre: 'Centro de Acopio Central - CDMX',
            notas: 'Voltajes testeados con medidor digital. Líneas 12V y 5V estables.'
          },
          {
            id: 3,
            codigoTrazabilidad: 'RAEE-2026-0003',
            titulo: 'Kit Memoria RAM Kingston HyperX Fury 16GB DDR4',
            categoriaId: 3,
            categoriaNombre: 'Módulos de Memoria RAM',
            marca: 'Kingston',
            modelo: 'HyperX Fury',
            estadoFuncional: 'OPERATIVO',
            estadoDisponibilidad: 'RESERVADO',
            pesoKg: 0.12,
            co2EvitadoKg: 7.80,
            centroAcopioNombre: 'Taller Técnico y Acopio Occidente',
            notas: 'MemTest86 sin errores en 4 pases continuos.'
          }
        ]);
        this.cargando.set(false);
      }
    });
  }

  filtrar(estado: string): void {
    this.filtroActual.set(estado);
    if (estado === 'TODOS') {
      this.cargarDispositivos();
    } else {
      this.cargarDispositivos(estado);
    }
  }
}
