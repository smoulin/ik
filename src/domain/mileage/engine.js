/**
 * Moteur de calcul des indemnites kilometriques.
 *
 * Fonction pure : on lui passe les trajets, les structures et les vehicules,
 * elle renvoie le montant de chaque trajet. Aucune dependance au DOM, au
 * stockage ou au reseau — c'est ce qui la rend entierement testable.
 */

import { CALCULATION_MODES } from '../models.js';
import { annualIkAmount, ikBracketLabel, resolveIkScale, normalizeCv } from './ikScale.js';
import { bicRate, resolveBicScale } from './bicScale.js';
import {
  customAnnualAmount,
  customBracketLabel,
  describeCustomScale,
  normalizeCustomScale,
} from './customScale.js';
import { formatRate } from '../../shared/format.js';

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
 * @property {boolean} scaleProvisional vrai quand l'annee du trajet n'a pas
 *   encore de bareme publie : le dernier connu a servi
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

    // L'annee du trajet choisit le bareme : un trajet de 2024 se valorise au
    // bareme 2024, meme saisi aujourd'hui. Elle etait deja calculee pour le
    // cumul annuel, mais n'etait pas transmise — d'ou des trajets passes
    // valorises au dernier bareme connu.
    results.set(
      trip.id,
      computeOne({ company, vehicle, km, beforeKm, afterKm, year: tripYear(trip) }),
    );
  }

  return results;
}

function computeOne({ company, vehicle, km, beforeKm, afterKm, year }) {
  const base = { km, beforeKm, afterKm };

  switch (company?.calculationMode) {
    case CALCULATION_MODES.IK: {
      const { scale, appliedYear, provisional } = resolveIkScale(year);
      // Montant marginal : le franchissement d'une tranche est gere naturellement.
      const amount =
        annualIkAmount(afterKm, vehicle, appliedYear) -
        annualIkAmount(beforeKm, vehicle, appliedYear);
      return {
        ...base,
        amount,
        rate: null,
        rateInfo: `${scale.label} · ${ikBracketLabel(afterKm)}${provisionalSuffix(provisional)}`,
        method: `${scale.label} (cumul annuel, ${normalizeCv(vehicle?.cv)} CV${vehicle?.electric ? ' électrique' : ''})${provisionalSuffix(provisional)}`,
        scaleYear: appliedYear,
        scaleProvisional: provisional,
      };
    }

    case CALCULATION_MODES.BIC: {
      const { scale, appliedYear, provisional } = resolveBicScale(year);
      const rate = bicRate(vehicle, appliedYear);
      return {
        ...base,
        amount: km * rate,
        rate,
        rateInfo: `${formatRate(rate)}${provisionalSuffix(provisional)}`,
        method: `${scale.label} (${formatRate(rate)})${provisionalSuffix(provisional)}`,
        scaleYear: appliedYear,
        scaleProvisional: provisional,
      };
    }

    case CALCULATION_MODES.FIXED: {
      const rate = Number(company?.calculationSettings?.fixedRate) || 0;
      return {
        ...base,
        amount: km * rate,
        rate,
        rateInfo: formatRate(rate),
        method: `Taux personnalisé (${formatRate(rate)})`,
        scaleYear: null,
        scaleProvisional: false,
      };
    }

    case CALCULATION_MODES.CUSTOM: {
      const scale = normalizeCustomScale(company?.calculationSettings?.customScale);
      // Meme calcul marginal que le bareme officiel : le franchissement d'une
      // tranche en cours d'annee est donc gere sans cas particulier.
      const amount = customAnnualAmount(afterKm, scale) - customAnnualAmount(beforeKm, scale);
      return {
        ...base,
        amount,
        rate: null,
        rateInfo: `${scale.label} · ${customBracketLabel(afterKm, scale)}`,
        method: `${scale.label} (cumul annuel — ${describeCustomScale(scale)})`,
        scaleYear: null,
        scaleProvisional: false,
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
        scaleProvisional: false,
      };
  }
}

/**
 * Libelle du mode de calcul d'une structure, hors contexte d'un trajet.
 * Le vehicule est facultatif : sans lui, on n'affiche pas de taux BIC — la v0.1.1
 * utilisait arbitrairement le premier vehicule enregistre, ce qui etait trompeur.
 *
 * `year` est l'annee des deplacements decrits. Sans elle, le libelle annoncerait
 * le dernier bareme connu pour des trajets qui n'en relevent pas.
 */
export function calculationModeLabel(company, vehicle = null, year = undefined) {
  switch (company?.calculationMode) {
    case CALCULATION_MODES.IK: {
      const { scale, provisional } = resolveIkScale(year);
      return `${scale.label}${provisionalSuffix(provisional)}`;
    }
    case CALCULATION_MODES.BIC: {
      const { scale, appliedYear, provisional } = resolveBicScale(year);
      const suffix = provisionalSuffix(provisional);
      if (!vehicle) return `${scale.label} (taux selon le véhicule)${suffix}`;
      return `${scale.label} (${formatRate(bicRate(vehicle, appliedYear))})${suffix}`;
    }
    case CALCULATION_MODES.CUSTOM: {
      const scale = normalizeCustomScale(company?.calculationSettings?.customScale);
      return `${scale.label} — ${describeCustomScale(scale)}`;
    }
    case CALCULATION_MODES.FIXED: {
      const rate = Number(company?.calculationSettings?.fixedRate) || 0;
      return `Taux personnalisé ${formatRate(rate)}`;
    }
    default:
      return 'Aucun remboursement';
  }
}

/**
 * Mention accolee a un bareme qui n'est pas celui de l'annee demandee.
 *
 * Le cas courant est l'annee en cours : son bareme ne parait qu'au printemps
 * suivant. Le montant est calcule avec le dernier connu, ce qui est la pratique,
 * mais le rapport doit le dire — sinon rien ne rappelle qu'il faudra le
 * reediter si le nouveau texte change les taux.
 */
function provisionalSuffix(provisional) {
  return provisional ? ' · barème provisoire' : '';
}

function indexById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return map;
}
