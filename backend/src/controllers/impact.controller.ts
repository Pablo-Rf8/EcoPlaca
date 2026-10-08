import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response.util';
import { componentController } from './component.controller';
import { calculateTangibleEquivalents } from '../utils/carbonCalculator.util';
import { EnvironmentalImpactSummary } from '../models/impact.model';

export const impactController = {
  // Obtener resumen en tiempo real del impacto ambiental del proyecto EcoPlaca
  getImpactSummary: async (req: Request, res: Response): Promise<void> => {
    const components = componentController.getInternalData();

    const totalRescued = components.length;
    const totalWeight = components.reduce((acc, curr) => acc + (curr.weightKg || 0), 0);
    const totalCo2 = components.reduce((acc, curr) => acc + (curr.co2SavedKg || 0), 0);

    const available = components.filter(c => c.status === 'AVAILABLE').length;
    const reserved = components.filter(c => c.status === 'RESERVED').length;
    const circularized = components.filter(c => ['REUSED', 'RECYCLED'].includes(c.status)).length;

    const tangibles = calculateTangibleEquivalents(totalCo2, totalWeight);

    const summary: EnvironmentalImpactSummary = {
      totalRescuedComponents: totalRescued,
      totalDivertedLandfillKg: Math.round(totalWeight * 100) / 100,
      totalCo2AvoidedKg: Math.round(totalCo2 * 100) / 100,
      activeAvailableComponents: available,
      reservedComponents: reserved,
      circularizedComponents: circularized,
      tangibles,
      lastUpdated: new Date().toISOString()
    };

    sendSuccess(res, summary, 'Resumen de impacto ambiental en tiempo real calculado');
  }
};
