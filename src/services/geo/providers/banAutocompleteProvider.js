/**
 * Fournisseur d'autocompletion : API Adresse (Base Adresse Nationale).
 *
 * Pourquoi celui-ci (verification demandee au §4) :
 *  - service public francais (data.gouv.fr / DINUM), gratuit ;
 *  - AUCUNE cle d'API, aucun compte, aucune carte bancaire
 *    -> rien de secret ne se retrouve dans le JavaScript public ;
 *  - l'autocompletion est un usage explicitement prevu (parametre `autocomplete=1`),
 *    contrairement a Nominatim dont la politique d'usage l'interdit ;
 *  - la reponse contient deja les coordonnees : une adresse choisie dans la liste
 *    n'a plus besoin d'etre geocodee ensuite ;
 *  - donnees sous licence ODbL : attribution requise, aucune contrainte sur le
 *    code de l'application (compatible avec une commercialisation ulterieure).
 *
 * Limite assumee : couverture France uniquement. Le repli Photon prend le relais
 * pour l'etranger.
 */

import { createSuggestion, GeoProviderError } from '../types.js';

const ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

export const BAN_ATTRIBUTION = 'Adresses : Base Adresse Nationale (data.gouv.fr) — licence ODbL';

export function createBanAutocompleteProvider({ fetchImpl = globalThis.fetch } = {}) {
  return {
    id: 'ban',
    label: 'Base Adresse Nationale',
    attribution: BAN_ATTRIBUTION,

    async suggest(query, { limit = 5, signal } = {}) {
      const url = new URL(ENDPOINT);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('autocomplete', '1');

      let response;
      try {
        response = await fetchImpl(url.toString(), {
          signal,
          headers: { Accept: 'application/json' },
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new GeoProviderError('Service d’adresses injoignable.', {
          provider: 'ban',
          cause: error,
        });
      }

      if (!response.ok) {
        throw new GeoProviderError('Service d’adresses indisponible.', {
          provider: 'ban',
          kind: 'unavailable',
        });
      }

      const data = await response.json();
      return (data?.features || []).map(toSuggestion).filter(Boolean);
    },
  };
}

function toSuggestion(feature) {
  const properties = feature?.properties;
  if (!properties) return null;

  const [longitude, latitude] = feature.geometry?.coordinates || [];
  const city = properties.city || '';
  const postalCode = properties.postcode || '';

  // `name` = « 12 rue Jean Jaures » pour une adresse, le nom de la commune sinon.
  const primary = properties.name || properties.label || '';
  const secondary = [postalCode, city].filter(Boolean).join(' ');

  return createSuggestion({
    id: `ban:${properties.id || properties.label}`,
    source: 'provider',
    label: primary,
    secondary,
    fullLabel: properties.label || [primary, secondary].filter(Boolean).join(', '),
    postalCode,
    city,
    country: 'FR',
    latitude,
    longitude,
    provider: 'ban',
  });
}
