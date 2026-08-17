/**
 * Calcul d'itinéraire : OSRM.
 *
 * Le serveur public de demonstration est utilise par defaut. Il est gratuit mais
 * explicitement sans garantie de service et destine a un usage leger — acceptable
 * pour une application personnelle, a remplacer si Agilmea IK devient commercial.
 *
 * L'URL de base est un parametre : basculer vers une instance OSRM auto-hebergee
 * ou vers un fournisseur commercial ne demande aucune modification du reste de
 * l'application (cf. §37).
 */

import { GeoProviderError } from '../types.js';

export const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

export function createOsrmRoutingProvider({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_OSRM_BASE_URL,
} = {}) {
  return {
    id: 'osrm',
    label: 'OSRM',
    attribution: 'Itineraires : OSRM / © OpenStreetMap contributors',

    async route(from, to, { signal } = {}) {
      const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
      const url = `${baseUrl}/route/v1/driving/${coords}?overview=false&alternatives=false&steps=false`;

      let response;
      try {
        response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new GeoProviderError('Service d’itinéraire injoignable.', {
          provider: 'osrm',
          cause: error,
        });
      }

      if (!response.ok) {
        throw new GeoProviderError('Service d’itinéraire indisponible.', {
          provider: 'osrm',
          kind: 'unavailable',
        });
      }

      const data = await response.json();
      const route = data?.routes?.[0];
      if (data?.code !== 'Ok' || !route) {
        throw new GeoProviderError('Aucun itinéraire routier trouvé.', {
          provider: 'osrm',
          kind: 'not-found',
        });
      }

      return {
        distanceMeters: Number(route.distance) || 0,
        durationSeconds: Number(route.duration) || 0,
        geometry: route.geometry ?? null,
        provider: 'osrm',
      };
    },
  };
}
