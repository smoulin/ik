/**
 * Bareme forfaitaire carburant BIC : taux au kilometre.
 * Fonction pure, sans effet de bord.
 */

import { BIC_FUEL_SCALES, CURRENT_BIC_SCALE_YEAR } from './scales.js';

/** Regroupement de puissance fiscale propre au bareme BIC. */
export function bicCvGroup(cv) {
  const value = Number(cv);
  if (!Number.isFinite(value)) return '3-4';
  if (value <= 4) return '3-4';
  if (value <= 7) return '5-7';
  if (value <= 9) return '8-9';
  if (value <= 11) return '10-11';
  return '12+';
}

export function getBicScale(year = CURRENT_BIC_SCALE_YEAR) {
  return BIC_FUEL_SCALES[year] || BIC_FUEL_SCALES[CURRENT_BIC_SCALE_YEAR];
}

/** Taux en euros par kilometre pour un vehicule donne. */
export function bicRate(vehicle, year = CURRENT_BIC_SCALE_YEAR) {
  if (!vehicle) return 0;
  const scale = getBicScale(year);
  const group = scale.rates[bicCvGroup(vehicle.cv)];
  return group?.[vehicle.fuel] ?? 0;
}
