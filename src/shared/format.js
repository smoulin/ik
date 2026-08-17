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

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });
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
