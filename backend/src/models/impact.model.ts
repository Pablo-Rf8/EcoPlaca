export interface EnvironmentalImpactSummary {
  totalRescuedComponents: number;
  totalDivertedLandfillKg: number;
  totalCo2AvoidedKg: number;
  activeAvailableComponents: number;
  reservedComponents: number;
  circularizedComponents: number;
  tangibles: {
    treesEquivalent: number;
    carKmEquivalent: number;
    smartphoneCharges: number;
  };
  lastUpdated: string;
}
