/**
 * Calcul de la distance d'un trajet.
 *
 * Assemble geocodage + itineraire, et applique l'aller-retour. Ne connait
 * aucun fournisseur : il recoit un `GeocodingService` et un `RoutingProvider`.
 */

export function createDistanceService({ geocodingService, routingProvider }) {
  /**
   * @param {object} params
   * @param {string} params.from
   * @param {string} params.to
   * @param {{latitude:number,longitude:number}|null} [params.fromCoords]
   * @param {{latitude:number,longitude:number}|null} [params.toCoords]
   * @param {boolean} [params.roundTrip]
   * @param {string} [params.preference]  'fastest' | 'no-highway' | 'no-toll'
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{km: number, oneWayKm: number, durationSeconds: number,
   *                    provider: string, geometry: Array|null,
   *                    fromCoords: object, toCoords: object}>}
   */
  async function computeTripDistance({
    from,
    to,
    fromCoords = null,
    toCoords = null,
    roundTrip = false,
    preference,
    signal,
  }) {
    const origin = await geocodingService.resolve(from, { coords: fromCoords, signal });
    const destination = await geocodingService.resolve(to, { coords: toCoords, signal });

    const route = await routingProvider.route(
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
      { signal, preference },
    );

    const oneWayKm = route.distanceMeters / 1000;
    const km = roundTrip ? oneWayKm * 2 : oneWayKm;

    return {
      km: Math.round(km * 10) / 10,
      oneWayKm: Math.round(oneWayKm * 10) / 10,
      durationSeconds: route.durationSeconds * (roundTrip ? 2 : 1),
      provider: route.provider,
      preference: route.preference ?? null,
      // Trace de l'aller, pour l'affichage de la carte a la demande.
      geometry: route.geometry ?? null,
      fromCoords: { latitude: origin.latitude, longitude: origin.longitude },
      toCoords: { latitude: destination.latitude, longitude: destination.longitude },
    };
  }

  return { computeTripDistance };
}
