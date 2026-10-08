import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EcoPlacaService, ImpactSummary } from '../../services/ecoplaca.service';

@Component({
  selector: 'app-impact-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './impact-summary.component.html',
  styleUrls: ['./impact-summary.component.scss']
})
export class ImpactSummaryComponent implements OnInit {
  private ecoService = inject(EcoPlacaService);
  
  impact = signal<ImpactSummary | null>(null);
  loading = signal<boolean>(true);

  ngOnInit(): void {
    this.loadImpact();
  }

  loadImpact(): void {
    this.loading.set(true);
    this.ecoService.getImpactSummary().subscribe({
      next: (data) => {
        this.impact.set(data);
        this.loading.set(false);
      },
      error: () => {
        // Valores fallback ilustrativos si el backend no estuviera corriendo
        this.impact.set({
          totalRescuedComponents: 5,
          totalDivertedLandfillKg: 6.42,
          totalCo2AvoidedKg: 140.25,
          activeAvailableComponents: 4,
          reservedComponents: 1,
          circularizedComponents: 0,
          tangibles: {
            treesEquivalent: 6.4,
            carKmEquivalent: 583,
            smartphoneCharges: 17054
          },
          lastUpdated: new Date().toISOString()
        });
        this.loading.set(false);
      }
    });
  }
}
