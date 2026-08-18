/**
 * Calcul d'itineraire : Valhalla (serveur public FOSSGIS).
 *
 * Retenu parce qu'il est le seul fournisseur gratuit, sans cle ni carte
 * bancaire, capable de calculer un itineraire EVITANT les autoroutes ou les
 * peages. OSRM en est incapable : son serveur public refuse les exclusions et
 * ne renvoie jamais d'alternative.
 *
 * Deux limites mesurees, a garder en tete :
 *  - les distances sont superieures a celles de ViaMichelin (63,9 km contre
 *    60,6 sur le trajet de reference) ;
 *  - les DUREES sont franchement fausses hors autoroute (1 h 37 annoncee pour
 *    un parcours realise en 51 min). L'interface doit donc mettre la distance
 *    en avant et la duree en retrait.
 *
 * Conditions d'usage : serveur de demonstration offert par FOSSGIS e.V.,
 * limite a 1 requete par seconde et par utilisateur, explicitement inadapte a
 * un service commercial. `baseUrl` est un parametre : basculer vers une offre
 * payante (Stadia Maps, Interline) ou une instance dediee ne demandera aucune
 * modification ailleurs.
 */

import { GeoProviderError } from '../types.js';
import { decodePolyline } from '../../../shared/polyline.js';

export const DEFAULT_VALHALLA_BASE_URL = 'https://valhalla1.openstreetmap.de';

export const VALHALLA_ATTRIBUTION = 'Itineraires : Valhalla (FOSSGIS) / © OpenStreetMap contributors';

/** Preferences d'itineraire proposees a l'utilisateur. */
export const ROUTE_PREFERENCES = /** @type {const} */ ({
  FASTEST: 'fastest',
  NO_HIGHWAY: 'no-highway',
  NO_TOLL: 'no-toll',
});

/**
 * Traduction en options de cout Valhalla.
 * `use_highways` et `use_tolls` vont de 0 (a eviter) a 1 (sans reticence).
 */
const COSTING_OPTIONS = {
  [ROUTE_PREFERENCES.FASTEST]: { use_highways: 1, use_tolls: 1 },
  [ROUTE_PREFERENCES.NO_HIGHWAY]: { use_highways: 0, use_tolls: 1 },
  [ROUTE_PREFERENCES.NO_TOLL]: { use_highways: 1, use_tolls: 0 },
};

/** Libelles affichables, dans l'ordre d'affichage souhaite. */
export const ROUTE_PREFERENCE_LABELS = [
  { value: ROUTE_PREFERENCES.FASTEST, label: 'Le plus rapide' },
  { value: ROUTE_PREFERENCES.NO_HIGHWAY, label: 'Sans autoroute' },
  { value: ROUTE_PREFERENCES.NO_TOLL, label: 'Sans péage' },
];

export function normalizeRoutePreference(value) {
  return Object.values(ROUTE_PREFERENCES).includes(value) ? value : ROUTE_PREFERENCES.FASTEST;
}

export function createValhallaRoutingProvider({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_VALHALLA_BASE_URL,
} = {}) {
  return {
    id: 'valhalla',
    label: 'Valhalla (FOSSGIS)',
    attribution: VALHALLA_ATTRIBUTION,
    /** Politique du serveur public : 1 requete par seconde et par utilisateur. */
    minDelayMs: 1100,
    supportsPreferences: true,

    /**
     * @param {{latitude: number, longitude: number}} from
     * @param {{latitude: number, longitude: number}} to
     * @param {{signal?: AbortSignal, preference?: string}} options
     */
    async route(from, to, { signal, preference } = {}) {
      const auto = COSTING_OPTIONS[normalizeRoutePreference(preference)];

      const body = {
        locations: [
          { lat: from.latitude, lon: from.longitude },
          { lat: to.latitude, lon: to.longitude },
        ],
        costing: 'auto',
        units: 'kilometers',
        costing_options: { auto },
      };

      let response;
      try {
        response = await fetchImpl(`${baseUrl}/route`, {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new GeoProviderError('Service d’itinéraire injoignable.', {
          provider: 'valhalla',
          cause: error,
        });
      }

      if (!response.ok) {
        throw new GeoProviderError('Service d’itinéraire indisponible.', {
          provider: 'valhalla',
          kind: 'unavailable',
        });
      }

      const data = await response.json();
      const summary = data?.trip?.summary;

      if (!summary || !Number.isFinite(Number(summary.length))) {
        throw new GeoProviderError('Aucun itinéraire routier trouvé.', {
          provider: 'valhalla',
          kind: 'not-found',
        });
      }

      // Chaque segment encode ses deltas depuis SA propre origine : il faut
      // decoder segment par segment puis concatener les points. Concatener les
      // chaines encodees produirait un trace faux des le deuxieme segment.
      const geometry = (data.trip.legs || [])
        .filter((leg) => leg?.shape)
        .flatMap((leg) => decodePolyline(leg.shape, 6));

      return {
        // `units: kilometers` : la reponse est en km, le contrat attend des metres.
        distanceMeters: Number(summary.length) * 1000,
        durationSeconds: Number(summary.time) || 0,
        geometry: geometry.length ? geometry : null,
        provider: 'valhalla',
        preference: normalizeRoutePreference(preference),
      };
    },
  };
}
