/**
 * Composition des services geographiques.
 *
 * SEUL endroit de l'application ou des fournisseurs concrets sont nommes.
 * Changer de fournisseur (serveur Agilmea, offre commerciale...) se fait ici,
 * sans toucher au metier ni a l'interface.
 */

import { createBanAutocompleteProvider, BAN_ATTRIBUTION } from './providers/banAutocompleteProvider.js';
import {
  createPhotonAutocompleteProvider,
  PHOTON_ATTRIBUTION,
} from './providers/photonAutocompleteProvider.js';
import { createBanGeocodingProvider } from './providers/banGeocodingProvider.js';
import { createNominatimGeocodingProvider } from './providers/nominatimGeocodingProvider.js';
import { createOsrmRoutingProvider } from './providers/osrmRoutingProvider.js';
import { createAddressSearchService } from './addressSearchService.js';
import { createGeocodingService } from './geocodingService.js';
import { createDistanceService } from './distanceService.js';
import { favoritePlaceRepository, recentAddressRepository } from '../../data/repositories/index.js';
import { geoCacheRepository } from '../../data/repositories/geoCacheRepository.js';

/** Mentions legales a afficher dans l'application (licences ODbL). */
export const GEO_ATTRIBUTIONS = [
  BAN_ATTRIBUTION,
  PHOTON_ATTRIBUTION,
  'Itineraires : OSRM / © OpenStreetMap contributors',
];

export function createGeoServices({ fetchImpl = globalThis.fetch } = {}) {
  const autocompleteProviders = [
    createBanAutocompleteProvider({ fetchImpl }),
    createPhotonAutocompleteProvider({ fetchImpl }),
  ];

  const geocodingProviders = [
    createBanGeocodingProvider({ fetchImpl }),
    createNominatimGeocodingProvider({ fetchImpl }),
  ];

  const routingProvider = createOsrmRoutingProvider({ fetchImpl });

  const addressSearchService = createAddressSearchService({
    favoritePlaceRepository,
    recentAddressRepository,
    providers: autocompleteProviders,
  });

  const geocodingService = createGeocodingService({
    providers: geocodingProviders,
    cacheRepository: geoCacheRepository,
  });

  const distanceService = createDistanceService({ geocodingService, routingProvider });

  return { addressSearchService, geocodingService, distanceService, routingProvider };
}
