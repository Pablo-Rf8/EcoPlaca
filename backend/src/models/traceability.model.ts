export type TraceabilityAction = 
  | 'CATALOGED' 
  | 'DIAGNOSED' 
  | 'REPAIR_STARTED' 
  | 'REPAIRED' 
  | 'RESERVED' 
  | 'DELIVERED' 
  | 'SCRAPPED' 
  | 'RECYCLED';

export interface TraceabilityLog {
  id: number;
  componentId: number;
  actorId?: number | null;
  actorName?: string;
  action: TraceabilityAction;
  details: string;
  recordedAt: Date;
}
