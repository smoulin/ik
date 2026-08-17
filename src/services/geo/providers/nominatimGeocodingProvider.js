/**
 * Geocodage de repli : Nominatim (OpenStreetMap).
 *
 * Conserve depuis la v0.1.1 pour les adresses hors France, ou si l'API Adresse
 * ne trouve rien. Sa politique d'usage impose au maximum une requete par
 * seconde et la mise en cache des resultats : `minDelayMs` est respecte par
 * `geocodingService`, et le cache est gere par `geoCacheRepository`.
 *
 * Elle interdit en revanche l'autocompletion frappe par frappe : ce fournisseur
 * n'est donc JAMAIS utilise pour les suggestions.
 */

import { GeoProviderError } from '../types.js';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export function createNominatimGeocodingProvider({ fetchImpl = globalThis.fetch } = {}) {
  return {
    id: 'nominatim',
    label: 'Nominatim (OpenStreetMap)',
    attribution: '© OpenStreetMap contributors',
    /** Politique d'usage Nominatim : 1 requete par seconde maximum. */
    minDelayMs: 1100,

    async geocode(address, { signal } = {}) {
      const url = new URL(ENDPOINT);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '0');
      url.searchParams.set('accept-language', 'fr');
      url.searchParams.set('q', address);

      let response;
      try {
        response = await fetchImpl(url.toString(), {
          signal,
          headers: { Accept: 'application/json' },
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new GeoProviderError('Service de recherche d’adresse injoignable.', {
          provider: 'nominatim',
          cause: error,
        });
      }

      if (!response.ok) {
        throw new GeoProviderError('Service de recherche d’adresse indisponible.', {
          provider: 'nominatim',
          kind: 'unavailable',
        });
      }

      const data = await response.json();
      if (!Array.isArray(data) || !data.length) {
        throw new GeoProviderError(`Adresse introuvable : ${address}`, {
          provider: 'nominatim',
          kind: 'not-found',
        });
      }

      return {
        latitude: Number(data[0].lat),
        longitude: Number(data[0].lon),
        label: data[0].display_name || address,
        provider: 'nominatim',
      };
    },
  };
}
