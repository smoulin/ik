/**
 * Normalisation de texte, partagee par le cache geographique, les adresses
 * recentes et la recherche de lieux favoris.
 *
 * La regex des diacritiques est construite a partir de sequences d'echappement
 * plutot que de caracteres litteraux : le fichier reste ainsi purement ASCII et
 * insensible aux problemes d'encodage.
 */

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * « 12 Rue Jean-Jaurès, Grenoble » -> « 12 rue jean jaures grenoble »
 * Sert de cle de dedoublonnage et de base de comparaison pour la recherche.
 */
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Alias explicite pour les adresses. */
export const normalizeAddressKey = normalizeText;

/** Vrai si `haystack` contient tous les mots de `needle`. */
export function matchesAllWords(haystack, needle) {
  const words = normalizeText(needle).split(' ').filter(Boolean);
  if (!words.length) return false;
  const target = normalizeText(haystack);
  return words.every((word) => target.includes(word));
}

/** Vrai si un mot de `haystack` commence par `needle` — pour prioriser « Dom » -> « Domicile ». */
export function startsWithWord(haystack, needle) {
  const prefix = normalizeText(needle);
  if (!prefix) return false;
  const target = normalizeText(haystack);
  return target.startsWith(prefix) || target.split(' ').some((word) => word.startsWith(prefix));
}
