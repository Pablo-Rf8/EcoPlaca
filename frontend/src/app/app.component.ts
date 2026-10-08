import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ImpactSummaryComponent } from './components/impact-summary/impact-summary.component';
import { ComponentCardComponent } from './components/component-card/component-card.component';
import { FooterComponent } from './components/footer/footer.component';
import { EcoPlacaService, ComponentItem } from './services/ecoplaca.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NavbarComponent,
    ImpactSummaryComponent,
    ComponentCardComponent,
    FooterComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'EcoPlaca';
  private ecoService = inject(EcoPlacaService);

  components = signal<ComponentItem[]>([]);
  loading = signal<boolean>(true);
  reservationMessage = signal<string | null>(null);

  selectedFilter = signal<string>('ALL');

  ngOnInit(): void {
    this.fetchComponents();
  }

  fetchComponents(condition?: string): void {
    this.loading.set(true);
    this.ecoService.getComponents(undefined, condition).subscribe({
      next: (items) => {
        this.components.set(items);
        this.loading.set(false);
      },
      error: () => {
        // Fallback demostrativo si no está conectado el backend al momento
        this.components.set([
          {
            id: 1,
            trackingCode: 'RAEE-2026-0001',
            title: 'Tarjeta Madre Asus Prime B450M-A',
            categoryId: 1,
            categoryName: 'Placas Madre / Motherboards',
            brand: 'ASUS',
            model: 'Prime B450M-A',
            conditionState: 'REPAIRABLE',
            status: 'AVAILABLE',
            weightKg: 0.85,
            co2SavedKg: 30.17,
            location: 'Almacén Central - Rack A1',
            notes: 'Probada con multímetro. Requiere cambio de condensador sólido en fase VRM.'
          },
          {
            id: 2,
            trackingCode: 'RAEE-2026-0002',
            title: 'Fuente de Poder EVGA 600W 80 Plus',
            categoryId: 2,
            categoryName: 'Fuentes de Poder / PSU',
            brand: 'EVGA',
            model: '600 W1',
            conditionState: 'FUNCTIONAL',
            status: 'AVAILABLE',
            weightKg: 1.60,
            co2SavedKg: 29.12,
            location: 'Almacén Central - Rack B3',
            notes: 'Completamente operativa y testeada con probador de fuentes de poder.'
          },
          {
            id: 3,
            trackingCode: 'RAEE-2026-0003',
            title: 'Kit RAM Kingston Fury Beast 16GB (2x8GB) DDR4',
            categoryId: 3,
            categoryName: 'Memorias RAM',
            brand: 'Kingston',
            model: 'Fury Beast DDR4',
            conditionState: 'FUNCTIONAL',
            status: 'RESERVED',
            weightKg: 0.12,
            co2SavedKg: 7.80,
            location: 'Taller Comunitario Re-Boot',
            notes: 'MemTest86 superado al 100% sin errores.'
          }
        ]);
        this.loading.set(false);
      }
    });
  }

  filterBy(condition: string): void {
    this.selectedFilter.set(condition);
    if (condition === 'ALL') {
      this.fetchComponents();
    } else {
      this.fetchComponents(condition);
    }
  }

  handleReservation(item: ComponentItem): void {
    this.ecoService.reserveComponent(item.id).subscribe({
      next: () => {
        this.reservationMessage.set(`¡Pieza "${item.title}" reservada con éxito!`);
        this.fetchComponents();
        setTimeout(() => this.reservationMessage.set(null), 4000);
      },
      error: () => {
        this.reservationMessage.set(`Simulación: Solicitud de reserva registrada para "${item.title}"`);
        setTimeout(() => this.reservationMessage.set(null), 4000);
      }
    });
  }
}
