/**
 * Decoupage d'une adresse francaise ecrite sur une seule ligne.
 *
 * Utile des qu'une suggestion ne fournit pas le code postal et la ville
 * separement : c'est le cas des adresses recemment utilisees et des lieux
 * favoris crees sans ces champs. Sans ce decoupage, choisir une adresse
 * deja connue laissait les champs « code postal » et « ville » vides.
 *
 * Fonction pure, sans dependance.
 */

/**
 * Un code postal francais : 5 chiffres isoles, suivis du nom de commune.
 * On prend la DERNIERE occurrence : « 12 rue du 8 Mai 1945 38000 Grenoble »
 * ne doit pas se laisser piéger par le numero de voie.
 */
const POSTAL_CITY = /\b(\d{5})\s*[,]?\s+([^,\d][^,]*)$/;

/**
 * @param {string} label  « 3 Rue des Pins 38100 Grenoble »
 * @returns {{line1: string, postalCode: string, city: string}}
 *          line1 vaut le libelle entier si aucun code postal n'est trouve.
 */
export function splitFrenchAddress(label) {
  const text = String(label ?? '').trim();
  if (!text) return { line1: '', postalCode: '', city: '' };

  const match = POSTAL_CITY.exec(text);
  if (!match) return { line1: text, postalCode: '', city: '' };

  const [, postalCode, rawCity] = match;
  const city = rawCity.trim();

  // Tout ce qui precede le code postal constitue la voie.
  const line1 = text.slice(0, match.index).replace(/[,\s]+$/, '').trim();

  return { line1, postalCode, city };
}

/**
 * Complete une suggestion dont le code postal ou la ville manquent, en les
 * deduisant du libelle complet. Ne remplace jamais une valeur deja fournie.
 */
export function completeSuggestionLocality(suggestion) {
  if (!suggestion) return suggestion;
  if (suggestion.postalCode && suggestion.city) return suggestion;

  const source = suggestion.fullLabel || suggestion.label || '';
  const parsed = splitFrenchAddress(source);
  if (!parsed.postalCode) return suggestion;

  return {
    ...suggestion,
    postalCode: suggestion.postalCode || parsed.postalCode,
    city: suggestion.city || parsed.city,
    // `label` sert a remplir le champ « adresse » : il ne doit pas repeter
    // le code postal et la ville, qui ont leurs propres champs.
    label: parsed.line1 || suggestion.label,
  };
}
