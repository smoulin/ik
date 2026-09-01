/**
 * Bareme forfaitaire carburant BIC : taux au kilometre.
 * Fonction pure, sans effet de bord.
 */

import { BIC_FUEL_SCALES, BIC_SCALE_YEARS, LATEST_BIC_SCALE_YEAR } from './scales.js';

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

/**
 * Bareme d'une annee de depense, et ce qu'il vaut vraiment.
 *
 * Meme regle que pour le bareme kilometrique : `provisional` signale une annee
 * sans bareme publie. Elle compte davantage ici, car ce bareme est republie
 * chaque annee et baisse — appliquer celui de l'an dernier n'est pas neutre.
 *
 * @param {number} year annee de la depense
 * @returns {{scale: object, appliedYear: number, provisional: boolean}}
 */
export function resolveBicScale(year) {
  const requested = Number(year);

  if (BIC_FUEL_SCALES[requested]) {
    return { scale: BIC_FUEL_SCALES[requested], appliedYear: requested, provisional: false };
  }

  const fallback =
    Number.isFinite(requested) && requested < BIC_SCALE_YEARS.first
      ? BIC_SCALE_YEARS.first
      : LATEST_BIC_SCALE_YEAR;

  return { scale: BIC_FUEL_SCALES[fallback], appliedYear: fallback, provisional: true };
}

export function getBicScale(year = LATEST_BIC_SCALE_YEAR) {
  return resolveBicScale(year).scale;
}

/** Taux en euros par kilometre pour un vehicule donne. */
export function bicRate(vehicle, year = LATEST_BIC_SCALE_YEAR) {
  if (!vehicle) return 0;
  const scale = getBicScale(year);
  const group = scale.rates[bicCvGroup(vehicle.cv)];
  return group?.[vehicle.fuel] ?? 0;
}
