/**
 * Moteur de calcul des indemnites kilometriques.
 *
 * Fonction pure : on lui passe les trajets, les structures et les vehicules,
 * elle renvoie le montant de chaque trajet. Aucune dependance au DOM, au
 * stockage ou au reseau — c'est ce qui la rend entierement testable.
 */

import { CALCULATION_MODES } from '../models.js';
import { annualIkAmount, ikBracketLabel, getIkScale, normalizeCv } from './ikScale.js';
import { bicRate, getBicScale } from './bicScale.js';
import { CURRENT_IK_SCALE_YEAR, CURRENT_BIC_SCALE_YEAR } from './scales.js';

/**
 * Perimetre sur lequel s'apprecie le cumul annuel du bareme kilometrique.
 *
 * Valeur retenue : 'company-vehicle-year' — chaque structure repart de zero
 * chaque annee pour un vehicule donne. C'est le comportement de la version 0.1.1,
 * conserve a la demande explicite de l'utilisateur.
 *
 * L'alternative 'vehicle-year' (cumul de tous les kilometres d'un meme vehicule,
 * toutes structures confondues) correspond a la lecture fiscale usuelle et
 * produit des montants plus faibles des lors qu'un meme vehicule sert a
 * plusieurs structures. Le basculement ne demande que de changer cette constante :
 * la cle de cumul est le seul point du moteur qui en depend.
 *
 * @type {'company-vehicle-year' | 'vehicle-year'}
 */
export const IK_ACCUMULATION_SCOPE = 'company-vehicle-year';

/** Cle de regroupement du cumul annuel. Seul point d'entree du perimetre ci-dessus. */
export function accumulationKey(trip, scope = IK_ACCUMULATION_SCOPE) {
  const year = tripYear(trip);
  if (scope === 'vehicle-year') return `${trip.vehicleId}|${year}`;
  return `${trip.companyId}|${trip.vehicleId}|${year}`;
}

export function tripYear(trip) {
  return typeof trip?.date === 'string' ? trip.date.slice(0, 4) : '';
}

/**
 * Ordre chronologique d'imputation : par date, puis par ordre de creation.
 *
 * Consequence a connaitre : ajouter apres coup un trajet anterieur decale le
 * cumul et peut donc modifier le montant de trajets deja saisis. C'est le
 * comportement correct pour un bareme par tranches, mais il faut le savoir
 * avant de transmettre un etat de frais.
 */
export function sortTripsForAccumulation(trips) {
  return [...trips].sort((a, b) => {
    const byDate = String(a.date || '').localeCompare(String(b.date || ''));
    if (byDate !== 0) return byDate;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

/**
 * @typedef {object} TripComputation
 * @property {number} amount        montant en euros
 * @property {number} km            distance retenue
 * @property {number} beforeKm      cumul annuel avant ce trajet
 * @property {number} afterKm       cumul annuel apres ce trajet
 * @property {string} rateInfo      texte court affiche dans les listes
 * @property {string} method        libelle de la methode de calcul
 * @property {number|null} scaleYear annee du bareme applique
 * @property {number|null} rate      taux unitaire quand il y en a un
 */

/**
 * Calcule le montant de chaque trajet.
 *
 * @param {Array} trips             trajets a calculer (les supprimes sont ignores)
 * @param {{companies: Array, vehicles: Array, scope?: string}} context
 * @returns {Map<string, TripComputation>} indexee par identifiant de trajet
 */
export function computeTripAmounts(trips, { companies = [], vehicles = [], scope } = {}) {
  const companyById = indexById(companies);
  const vehicleById = indexById(vehicles);

  const accumulated = new Map();
  const results = new Map();

  for (const trip of sortTripsForAccumulation(trips)) {
    if (trip.deletedAt) continue;

    const company = companyById.get(trip.companyId);
    const vehicle = vehicleById.get(trip.vehicleId);
    const km = Math.max(0, Number(trip.km) || 0);

    const key = accumulationKey(trip, scope);
    const beforeKm = accumulated.get(key) || 0;
    const afterKm = beforeKm + km;
    accumulated.set(key, afterKm);

    results.set(trip.id, computeOne({ company, vehicle, km, beforeKm, afterKm }));
  }

  return results;
}

function computeOne({ company, vehicle, km, beforeKm, afterKm }) {
  const base = { km, beforeKm, afterKm };

  switch (company?.calculationMode) {
    case CALCULATION_MODES.IK: {
      // Montant marginal : le franchissement d'une tranche est gere naturellement.
      const amount = annualIkAmount(afterKm, vehicle) - annualIkAmount(beforeKm, vehicle);
      const scale = getIkScale();
      return {
        ...base,
        amount,
        rate: null,
        rateInfo: `${scale.label} · ${ikBracketLabel(afterKm)}`,
        method: `${scale.label} (cumul annuel, ${normalizeCv(vehicle?.cv)} CV${vehicle?.electric ? ' électrique' : ''})`,
        scaleYear: scale.year,
      };
    }

    case CALCULATION_MODES.BIC: {
      const rate = bicRate(vehicle);
      const scale = getBicScale();
      return {
        ...base,
        amount: km * rate,
        rate,
        rateInfo: `${rate.toFixed(3)} €/km`,
        method: `${scale.label} (${rate.toFixed(3)} €/km)`,
        scaleYear: scale.year,
      };
    }

    case CALCULATION_MODES.FIXED: {
      const rate = Number(company?.calculationSettings?.fixedRate) || 0;
      return {
        ...base,
        amount: km * rate,
        rate,
        rateInfo: `${rate.toFixed(3)} €/km`,
        method: `Taux personnalisé (${rate.toFixed(3)} €/km)`,
        scaleYear: null,
      };
    }

    default:
      return {
        ...base,
        amount: 0,
        rate: 0,
        rateInfo: '',
        method: 'Aucun remboursement',
        scaleYear: null,
      };
  }
}

/**
 * Libelle du mode de calcul d'une structure, hors contexte d'un trajet.
 * Le vehicule est facultatif : sans lui, on n'affiche pas de taux BIC — la v0.1.1
 * utilisait arbitrairement le premier vehicule enregistre, ce qui etait trompeur.
 */
export function calculationModeLabel(company, vehicle = null) {
  switch (company?.calculationMode) {
    case CALCULATION_MODES.IK:
      return getIkScale().label;
    case CALCULATION_MODES.BIC: {
      const scale = getBicScale();
      if (!vehicle) return `${scale.label} (taux selon le véhicule)`;
      return `${scale.label} (${bicRate(vehicle).toFixed(3)} €/km)`;
    }
    case CALCULATION_MODES.FIXED: {
      const rate = Number(company?.calculationSettings?.fixedRate) || 0;
      return `Taux personnalisé ${rate.toFixed(3)} €/km`;
    }
    default:
      return 'Aucun remboursement';
  }
}

/** Annee du bareme utilise par une structure, pour l'en-tete des rapports. */
export function scaleYearForCompany(company) {
  switch (company?.calculationMode) {
    case CALCULATION_MODES.IK:
      return CURRENT_IK_SCALE_YEAR;
    case CALCULATION_MODES.BIC:
      return CURRENT_BIC_SCALE_YEAR;
    default:
      return null;
  }
}

function indexById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return map;
}
