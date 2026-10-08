/**
 * Factores de emisión aproximados (kg CO2eq por kg de material/componente recuperado)
 * Basados en análisis de ciclo de vida (LCA) de hardware y directivas RAEE
 */
export const CATEGORY_CARBON_FACTORS: Record<string, number> = {
  'CAT-MB': 35.5,   // Placas Madre / Motherboards (metales pesados, sustratos PCB complejos)
  'CAT-PSU': 18.2,  // Fuentes de Poder (cobre, transformadores, disipadores de aluminio)
  'CAT-RAM': 65.0,  // Memorias RAM (alta densidad de semiconductores de silicio y oro)
  'CAT-STO': 42.0,  // Discos duros y SSDs
  'CAT-GPU': 55.8,  // Tarjetas Gráficas (chips de alta potencia, cobre y silicio)
  'CAT-CPU': 80.0,  // Procesadores (proceso de fabricación intensivo en carbono)
  'CAT-DISP': 22.4, // Pantallas / Monitores
  'DEFAULT': 25.0   // Factor promedio para componentes mixtos
};

/**
 * Calcula la huella de carbono estimada evitada al reutilizar o reacondicionar una pieza
 * @param weightKg Peso físico del componente en kilogramos
 * @param categoryCode Código de la categoría RAEE
 * @returns kg de CO2 equivalente evitados (redondeado a 2 decimales)
 */
export function calculateAvoidedCo2(weightKg: number, categoryCode: string = 'DEFAULT'): number {
  if (weightKg <= 0) return 0;
  const factor = CATEGORY_CARBON_FACTORS[categoryCode] || CATEGORY_CARBON_FACTORS['DEFAULT'];
  const co2Avoided = weightKg * factor;
  return Math.round(co2Avoided * 100) / 100;
}

/**
 * Calcula métricas equivalentes tangibles para comprensión ciudadana y reportes ambientales
 */
export function calculateTangibleEquivalents(totalCo2AvoidedKg: number, totalWeightDivertedKg: number) {
  return {
    co2AvoidedKg: Math.round(totalCo2AvoidedKg * 100) / 100,
    divertedWeightKg: Math.round(totalWeightDivertedKg * 100) / 100,
    treesEquivalent: Math.round((totalCo2AvoidedKg / 21.77) * 10) / 10, // Árboles absorbiendo CO2 durante 1 año (~21.77 kg/año)
    carKmEquivalent: Math.round(totalCo2AvoidedKg * 4.16), // Km de automóvil de combustión estándar evitados (~0.24 kg CO2/km)
    smartphoneCharges: Math.round(totalCo2AvoidedKg * 121.6), // Cargas completas de smartphones evitadas
  };
}
