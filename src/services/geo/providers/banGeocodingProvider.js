/**
 * Geocodage principal : API Adresse (BAN).
 *
 * Meme service que l'autocompletion, mais en mode « resolution ponctuelle ».
 * Aucun delai impose entre deux appels, contrairement a Nominatim.
 */

import { GeoProviderError } from '../types.js';

const ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

export function createBanGeocodingProvider({ fetchImpl = globalThis.fetch } = {}) {
  return {
    id: 'ban',
    label: 'Base Adresse Nationale',
    attribution: 'Base Adresse Nationale (data.gouv.fr) — licence ODbL',
    minDelayMs: 0,

    async geocode(address, { signal } = {}) {
      const url = new URL(ENDPOINT);
      url.searchParams.set('q', address);
      url.searchParams.set('limit', '1');

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
      const feature = data?.features?.[0];
      if (!feature) {
        throw new GeoProviderError(`Adresse introuvable : ${address}`, {
          provider: 'ban',
          kind: 'not-found',
        });
      }

      const [longitude, latitude] = feature.geometry?.coordinates || [];
      return {
        latitude: Number(latitude),
        longitude: Number(longitude),
        label: feature.properties?.label || address,
        provider: 'ban',
      };
    },
  };
}
