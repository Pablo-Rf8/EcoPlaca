import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentItem } from '../../services/ecoplaca.service';

@Component({
  selector: 'app-component-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './component-card.component.html',
  styleUrls: ['./component-card.component.scss']
})
export class ComponentCardComponent {
  @Input({ required: true }) item!: ComponentItem;
  @Output() reserve = new EventEmitter<ComponentItem>();

  onReserve(): void {
    this.reserve.emit(this.item);
  }

  getConditionLabel(condition: string): string {
    switch (condition) {
      case 'FUNCTIONAL': return '100% Funcional';
      case 'REPAIRABLE': return 'Reparable / Taller';
      case 'SCRAP_RECYCLING': return 'Para Reciclaje Material';
      default: return condition;
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'AVAILABLE': return 'status-available';
      case 'RESERVED': return 'status-reserved';
      case 'IN_REPAIR': return 'status-repair';
      default: return 'status-default';
    }
  }
}
