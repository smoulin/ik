/**
 * Formatage francais — fonctions pures, utilisables aussi bien par le metier
 * (libelles de rapport) que par l'interface.
 */

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** '2026-08-17' -> '17/08/2026'. Chaine vide si la date est absente ou invalide. */
export function formatDateFr(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** '2026-08' -> 'aout 2026'. */
export function formatMonthFr(year, monthIndexOneBased) {
  const name = MONTHS_FR[Number(monthIndexOneBased) - 1];
  return name ? `${name} ${year}` : String(year);
}

export function formatNumberFr(value, maximumFractionDigits = 1) {
  return Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits });
}

export function formatKm(value) {
  return `${formatNumberFr(value, 1)} km`;
}

/** Taux unitaire : « 0,139 €/km ». Trois decimales, virgule francaise. */
export function formatRate(value) {
  return `${Number(value || 0).toFixed(3).replace('.', ',')} €/km`;
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });
}

/**
 * Lit un nombre saisi a la francaise, virgule decimale comprise.
 *
 * Indispensable sur telephone : le clavier numerique francais propose une
 * virgule. Avec un <input type="number">, « 10,5 » rend le champ invalide et
 * `.value` renvoie une chaine vide — la distance etait alors enregistree a 0
 * sans le moindre avertissement. Les champs concernes sont donc des champs
 * texte avec inputmode="decimal", et c'est cette fonction qui les interprete.
 *
 * @returns {number|null} null si la saisie est vide ou illisible
 */
export function parseDecimal(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim().replace(/\s/g, '');
  if (!text) return null;

  // Une seule virgule decimale, jamais de separateur de milliers ambigu.
  const normalized = text.replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/**
 * Inverse de parseDecimal : remplit un champ de saisie a la francaise.
 * Une distance calculee s'affiche « 103,9 » et non « 103.9 ».
 */
export function formatDecimalInput(value, decimals = null) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const text = decimals === null ? String(number) : number.toFixed(decimals);
  return text.replace('.', ',');
}

/** Aujourd'hui au format AAAA-MM-JJ, en heure locale (et non UTC). */
export function todayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Dernier jour du mois, pour les periodes de rapport. */
export function lastDayOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}
