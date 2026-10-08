export type ConditionState = 'FUNCTIONAL' | 'REPAIRABLE' | 'SCRAP_RECYCLING';
export type ComponentStatus = 'AVAILABLE' | 'RESERVED' | 'IN_REPAIR' | 'REUSED' | 'RECYCLED';

export interface Category {
  id: number;
  name: string;
  code: string;
  description?: string;
  carbonFactorKgPerKg: number;
}

export interface Component {
  id: number;
  trackingCode: string;
  title: string;
  categoryId: number;
  categoryName?: string;
  donorId: number;
  donorName?: string;
  assignedWorkshopId?: number | null;
  assignedWorkshopName?: string | null;
  brand?: string;
  model?: string;
  serialNumber?: string;
  conditionState: ConditionState;
  status: ComponentStatus;
  weightKg: number;
  co2SavedKg: number;
  location?: string;
  specifications?: Record<string, unknown>;
  notes?: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CreateComponentDTO {
  title: string;
  categoryId: number;
  donorId: number;
  brand?: string;
  model?: string;
  serialNumber?: string;
  conditionState: ConditionState;
  weightKg: number;
  location?: string;
  specifications?: Record<string, unknown>;
  notes?: string;
}
