/**
 * Bareme kilometrique : calcul du montant cumule annuel.
 * Fonction pure, sans effet de bord.
 */

import { IK_SCALES, IK_SCALE_YEARS, LATEST_IK_SCALE_YEAR, IK_BRACKETS } from './scales.js';

/**
 * Le bareme s'arrete a 7 CV : en dessous de 3 CV on applique la ligne « 3 CV »,
 * au-dessus de 7 CV la ligne « 7 CV et plus ».
 */
export function normalizeCv(cv) {
  const value = Number(cv);
  if (!Number.isFinite(value) || value <= 3) return 3;
  if (value >= 7) return 7;
  return Math.round(value);
}

/**
 * Bareme d'une annee de deplacement, et ce qu'il vaut vraiment.
 *
 * `provisional` est vrai des que l'annee demandee n'a pas de bareme publie :
 * l'annee en cours, dont le bareme ne paraitra qu'au printemps suivant, comme
 * une annee anterieure a la plus ancienne connue. Le montant reste calcule —
 * refuser serait pire — mais l'appelant doit pouvoir le dire.
 *
 * @param {number} year annee du deplacement
 * @returns {{scale: object, appliedYear: number, provisional: boolean}}
 */
export function resolveIkScale(year) {
  const requested = Number(year);

  if (IK_SCALES[requested]) {
    return { scale: IK_SCALES[requested], appliedYear: requested, provisional: false };
  }

  const fallback =
    Number.isFinite(requested) && requested < IK_SCALE_YEARS.first
      ? IK_SCALE_YEARS.first
      : LATEST_IK_SCALE_YEAR;

  return { scale: IK_SCALES[fallback], appliedYear: fallback, provisional: true };
}

export function getIkScale(year = LATEST_IK_SCALE_YEAR) {
  return resolveIkScale(year).scale;
}

/** Coefficients applicables a un vehicule donne. */
export function getIkCoefficients(vehicle, year = LATEST_IK_SCALE_YEAR) {
  const scale = getIkScale(year);
  const table = vehicle?.electric ? scale.electric : scale.thermal;
  return table[normalizeCv(vehicle?.cv)];
}

/**
 * Montant total du bareme pour `km` kilometres cumules sur l'annee.
 *
 * C'est une fonction cumulative : le montant d'un trajet isole se calcule par
 * difference (voir engine.js), ce qui donne automatiquement le bon taux marginal
 * lorsqu'un trajet fait franchir une tranche.
 */
export function annualIkAmount(km, vehicle, year = LATEST_IK_SCALE_YEAR) {
  const distance = Math.max(0, Number(km) || 0);
  if (!vehicle) return 0;
  const c = getIkCoefficients(vehicle, year);
  if (!c) return 0;
  if (distance <= IK_BRACKETS.low) return distance * c.a;
  if (distance <= IK_BRACKETS.high) return distance * c.b + c.c;
  return distance * c.d;
}

/** Libelle de la tranche atteinte, pour l'affichage dans le rapport. */
export function ikBracketLabel(cumulativeKm) {
  const km = Math.max(0, Number(cumulativeKm) || 0);
  if (km <= IK_BRACKETS.low) return 'jusqu’à 5 000 km';
  if (km <= IK_BRACKETS.high) return 'de 5 001 à 20 000 km';
  return 'au-delà de 20 000 km';
}
