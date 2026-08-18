/**
 * Bareme personnalise, defini par l'utilisateur.
 *
 * Meme mecanique que le bareme kilometrique officiel : des tranches de
 * distance appreciees sur le cumul annuel, chacune avec un taux au kilometre
 * et, si besoin, un forfait qui s'y ajoute. C'est exactement la forme du
 * bareme francais — « km x 0,357 + 1 395 » pour la tranche 5 001-20 000 —
 * ce qui permet de reproduire n'importe quel bareme d'entreprise.
 *
 * Un bareme a taux unique est simplement un bareme d'une seule tranche sans
 * limite superieure.
 *
 * Fonctions pures, sans dependance.
 */

/**
 * @typedef {object} ScaleBracket
 * @property {number|null} upToKm  borne haute incluse, null pour « au-dela »
 * @property {number} rate         euros par kilometre
 * @property {number} flatBonus    forfait ajoute au montant de la tranche
 */

/** Tranche par defaut proposee a la creation d'un bareme. */
export function createBracket(input = {}) {
  return {
    upToKm: toPositiveNumberOrNull(input.upToKm),
    rate: Math.max(0, Number(input.rate) || 0),
    flatBonus: Math.max(0, Number(input.flatBonus) || 0),
  };
}

/**
 * Normalise un bareme : tranches triees, bornes coherentes, derniere tranche
 * ouverte. Sans cela, un bareme saisi dans le desordre donnerait des montants
 * imprevisibles.
 */
export function normalizeCustomScale(input) {
  // `input` peut valoir null : une structure passee en mode « barème
  // personnalisé » n'en a pas encore forcement defini un.
  const source = input && typeof input === 'object' ? input : {};

  const brackets = (Array.isArray(source.brackets) ? source.brackets : [])
    .map(createBracket)
    .sort(sortByUpperBound);

  return {
    label: String(source.label || '').trim() || 'Barème personnalisé',
    brackets: brackets.length ? brackets : [createBracket({ upToKm: null, rate: 0 })],
  };
}

/** Les tranches bornees d'abord, dans l'ordre croissant ; « au-dela » en dernier. */
function sortByUpperBound(a, b) {
  if (a.upToKm === null) return 1;
  if (b.upToKm === null) return -1;
  return a.upToKm - b.upToKm;
}

/**
 * Verifie la coherence d'un bareme avant enregistrement.
 * @returns {string[]} messages destines a l'utilisateur, vide si tout va bien
 */
export function validateCustomScale(input) {
  const scale = normalizeCustomScale(input);
  const problems = [];

  if (!scale.brackets.length) {
    problems.push('Ajoute au moins une tranche.');
    return problems;
  }

  const bounded = scale.brackets.filter((b) => b.upToKm !== null);
  const open = scale.brackets.filter((b) => b.upToKm === null);

  if (open.length > 1) {
    problems.push('Une seule tranche peut être sans limite supérieure.');
  }
  if (!open.length) {
    problems.push('La dernière tranche doit être sans limite, pour couvrir les grandes distances.');
  }

  const limits = bounded.map((b) => b.upToKm);
  if (new Set(limits).size !== limits.length) {
    problems.push('Deux tranches ne peuvent pas avoir la même limite.');
  }

  if (scale.brackets.every((b) => b.rate === 0 && b.flatBonus === 0)) {
    problems.push('Indique au moins un taux supérieur à 0.');
  }

  return problems;
}

/**
 * Montant total pour `km` kilometres cumules sur l'annee.
 *
 * Fonction cumulative, comme pour le bareme officiel : le montant d'un trajet
 * isole se calcule par difference, ce qui donne automatiquement le bon taux
 * marginal lorsqu'un trajet fait franchir une tranche.
 */
export function customAnnualAmount(km, scale) {
  const distance = Math.max(0, Number(km) || 0);
  const normalized = normalizeCustomScale(scale);
  const bracket = bracketFor(distance, normalized);
  if (!bracket) return 0;
  return distance * bracket.rate + bracket.flatBonus;
}

/** Tranche applicable a une distance cumulee donnee. */
export function bracketFor(km, scale) {
  const normalized = normalizeCustomScale(scale);
  const distance = Math.max(0, Number(km) || 0);
  return (
    normalized.brackets.find((b) => b.upToKm === null || distance <= b.upToKm) ||
    normalized.brackets[normalized.brackets.length - 1] ||
    null
  );
}

/** Libelle de la tranche atteinte, affiche dans les listes et le rapport. */
export function customBracketLabel(km, scale) {
  const normalized = normalizeCustomScale(scale);
  const distance = Math.max(0, Number(km) || 0);

  // L'index est cherche ici plutot que via bracketFor : celui-ci renormalise
  // le bareme et recree les objets, ce qui rend toute comparaison d'identite
  // inoperante — et faisait perdre la borne basse de la tranche.
  let index = normalized.brackets.findIndex((b) => b.upToKm === null || distance <= b.upToKm);
  if (index === -1) index = normalized.brackets.length - 1;

  const bracket = normalized.brackets[index];
  if (!bracket) return '';

  const previous = index > 0 ? normalized.brackets[index - 1] : null;
  const from = previous && previous.upToKm !== null ? previous.upToKm + 1 : 0;

  if (bracket.upToKm === null) {
    return from > 0 ? `au-delà de ${formatKmBound(from - 1)} km` : 'toutes distances';
  }
  if (from === 0) return `jusqu’à ${formatKmBound(bracket.upToKm)} km`;
  return `de ${formatKmBound(from)} à ${formatKmBound(bracket.upToKm)} km`;
}

/** Resume lisible d'un bareme complet, pour les reglages et le rapport. */
export function describeCustomScale(scale) {
  const normalized = normalizeCustomScale(scale);
  return normalized.brackets
    .map((bracket) => {
      const borne =
        bracket.upToKm === null ? 'au-delà' : `jusqu’à ${formatKmBound(bracket.upToKm)} km`;
      const taux = `${bracket.rate.toFixed(3).replace('.', ',')} €/km`;
      const forfait = bracket.flatBonus ? ` + ${formatKmBound(bracket.flatBonus)} €` : '';
      return `${borne} : ${taux}${forfait}`;
    })
    .join(' · ');
}

/**
 * Separateur de milliers, avec une espace insecable pour eviter une coupure de
 * ligne au milieu d'un nombre. Formatage maison plutot que toLocaleString :
 * le resultat ne doit pas dependre des donnees de localisation de la plateforme.
 */
function formatKmBound(value) {
  return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function toPositiveNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
