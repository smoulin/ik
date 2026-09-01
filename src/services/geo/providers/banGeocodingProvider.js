/**
 * Geocodage principal : API Adresse (BAN).
 *
 * Meme service que l'autocompletion, mais en mode « resolution ponctuelle ».
 * Aucun delai impose entre deux appels, contrairement a Nominatim.
 */

import { GeoProviderError } from '../types.js';

const ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';
const REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';

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

      const feature = await firstFeature(url, {
        signal,
        notFound: `Adresse introuvable : ${address}`,
      });

      const [longitude, latitude] = feature.geometry?.coordinates || [];
      return {
        latitude: Number(latitude),
        longitude: Number(longitude),
        label: feature.properties?.label || address,
        provider: 'ban',
      };
    },

    /**
     * Sens inverse : nomme un point releve par le GPS.
     *
     * Sert aux extremites d'une trace enregistree, qui n'arrivent qu'avec des
     * coordonnees. La BAN ne couvre que la France : hors de ses limites elle
     * renvoie une liste vide, traduite ici en « not-found » plutot qu'en panne.
     */
    async reverse(latitude, longitude, { signal } = {}) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new GeoProviderError('Coordonnées invalides.', {
          provider: 'ban',
          kind: 'not-found',
        });
      }

      const url = new URL(REVERSE_ENDPOINT);
      url.searchParams.set('lon', String(longitude));
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('limit', '1');

      const feature = await firstFeature(url, {
        signal,
        notFound: 'Aucune adresse connue à cet endroit.',
      });

      const [foundLongitude, foundLatitude] = feature.geometry?.coordinates || [];
      const properties = feature.properties || {};
      return {
        latitude: Number(foundLatitude),
        longitude: Number(foundLongitude),
        label: properties.label || '',
        distanceMeters: Number(properties.distance) || 0,
        provider: 'ban',
      };
    },
  };

  /**
   * Appel commun aux deux sens : meme service, memes pannes, memes messages.
   * Ne renvoie jamais `undefined` — soit un resultat, soit une erreur typee que
   * l'appelant sait distinguer d'une panne reseau.
   */
  async function firstFeature(url, { signal, notFound }) {
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
      throw new GeoProviderError(notFound, { provider: 'ban', kind: 'not-found' });
    }

    return feature;
  }
}
