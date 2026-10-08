export type ReservationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
export type IntendedUse = 'REFURBISHMENT' | 'PARTS_HARVESTING' | 'MATERIAL_RECYCLING';

export interface Reservation {
  id: number;
  componentId: number;
  componentTitle?: string;
  trackingCode?: string;
  requesterId: number;
  requesterName?: string;
  status: ReservationStatus;
  intendedUse: IntendedUse;
  notes?: string;
  requestedAt: Date;
  resolvedAt?: Date | null;
}

export interface CreateReservationDTO {
  componentId: number;
  requesterId: number;
  intendedUse: IntendedUse;
  notes?: string;
}
