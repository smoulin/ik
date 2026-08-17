/**
 * Fournisseurs geographiques : lecture des reponses, gestion des erreurs.
 * Le reseau est entierement simule (§35 : « ne pas dependre d'un service externe »).
 */

import { describe, it, expect, vi } from 'vitest';
import { createBanAutocompleteProvider } from '../../src/services/geo/providers/banAutocompleteProvider.js';
import { createPhotonAutocompleteProvider } from '../../src/services/geo/providers/photonAutocompleteProvider.js';
import { createBanGeocodingProvider } from '../../src/services/geo/providers/banGeocodingProvider.js';
import { createOsrmRoutingProvider } from '../../src/services/geo/providers/osrmRoutingProvider.js';
import { createGeocodingService } from '../../src/services/geo/geocodingService.js';
import { createDistanceService } from '../../src/services/geo/distanceService.js';
import { GeoProviderError } from '../../src/services/geo/types.js';

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

const BAN_RESPONSE = {
  type: 'FeatureCollection',
  features: [
    {
      geometry: { type: 'Point', coordinates: [5.7245, 45.1885] },
      properties: {
        id: '38185_1234_00012',
        label: '12 Rue Jean Jaures 38000 Grenoble',
        name: '12 Rue Jean Jaures',
        postcode: '38000',
        city: 'Grenoble',
        context: '38, Isere',
      },
    },
  ],
};

describe('API Adresse (BAN) — autocompletion', () => {
  it('construit une requete d’autocompletion limitee', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(BAN_RESPONSE));
    const provider = createBanAutocompleteProvider({ fetchImpl });

    await provider.suggest('12 rue jean jau', { limit: 5 });

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin).toBe('https://api-adresse.data.gouv.fr');
    expect(url.searchParams.get('q')).toBe('12 rue jean jau');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('autocomplete')).toBe('1');
    // Aucune cle d'API ne doit transiter (§4).
    expect(url.searchParams.has('key')).toBe(false);
    expect(url.searchParams.has('apiKey')).toBe(false);
  });

  it('normalise la reponse en suggestion affichable', async () => {
    const provider = createBanAutocompleteProvider({
      fetchImpl: async () => jsonResponse(BAN_RESPONSE),
    });

    const [suggestion] = await provider.suggest('12 rue jean jau');

    expect(suggestion.label).toBe('12 Rue Jean Jaures');
    expect(suggestion.secondary).toBe('38000 Grenoble');
    expect(suggestion.fullLabel).toBe('12 Rue Jean Jaures 38000 Grenoble');
    expect(suggestion.postalCode).toBe('38000');
    expect(suggestion.city).toBe('Grenoble');
    // Les coordonnees viennent avec : plus besoin de geocoder ensuite.
    expect(suggestion.latitude).toBeCloseTo(45.1885, 4);
    expect(suggestion.longitude).toBeCloseTo(5.7245, 4);
    expect(suggestion.source).toBe('provider');
  });

  it('renvoie une liste vide sans resultat', async () => {
    const provider = createBanAutocompleteProvider({
      fetchImpl: async () => jsonResponse({ features: [] }),
    });
    expect(await provider.suggest('zzzz')).toEqual([]);
  });

  it('signale un service indisponible', async () => {
    const provider = createBanAutocompleteProvider({
      fetchImpl: async () => jsonResponse({}, false),
    });
    await expect(provider.suggest('grenoble')).rejects.toBeInstanceOf(GeoProviderError);
  });

  it('laisse remonter une annulation sans la transformer en panne', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const provider = createBanAutocompleteProvider({
      fetchImpl: async () => {
        throw abortError;
      },
    });
    await expect(provider.suggest('grenoble')).rejects.toThrow('aborted');
  });
});

describe('Photon — autocompletion de repli', () => {
  it('assemble numero et rue', async () => {
    const provider = createPhotonAutocompleteProvider({
      fetchImpl: async () =>
        jsonResponse({
          features: [
            {
              geometry: { coordinates: [4.85, 45.75] },
              properties: {
                osm_id: 42,
                housenumber: '10',
                street: 'Rue de la Republique',
                postcode: '69002',
                city: 'Lyon',
                country: 'France',
                countrycode: 'FR',
              },
            },
          ],
        }),
    });

    const [suggestion] = await provider.suggest('10 rue de la rep');
    expect(suggestion.label).toBe('10 Rue de la Republique');
    expect(suggestion.city).toBe('Lyon');
    expect(suggestion.provider).toBe('photon');
  });
});

describe('geocodage', () => {
  it('lit les coordonnees de l’API Adresse', async () => {
    const provider = createBanGeocodingProvider({
      fetchImpl: async () => jsonResponse(BAN_RESPONSE),
    });
    const result = await provider.geocode('12 rue Jean Jaures Grenoble');
    expect(result.latitude).toBeCloseTo(45.1885, 4);
    expect(result.provider).toBe('ban');
  });

  it('signale une adresse introuvable', async () => {
    const provider = createBanGeocodingProvider({
      fetchImpl: async () => jsonResponse({ features: [] }),
    });
    await expect(provider.geocode('zzzz')).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('createGeocodingService', () => {
  it('utilise les coordonnees deja connues sans appeler le reseau', async () => {
    const geocode = vi.fn();
    const service = createGeocodingService({ providers: [{ id: 'x', geocode }] });

    const result = await service.resolve('Domicile', {
      coords: { latitude: 45.1, longitude: 5.7 },
    });

    expect(result.source).toBe('coords');
    expect(geocode).not.toHaveBeenCalled();
  });

  it('lit le cache avant d’interroger un fournisseur', async () => {
    const geocode = vi.fn();
    const cacheRepository = {
      get: async () => ({ latitude: 45, longitude: 5, label: 'Grenoble', provider: 'ban' }),
      set: vi.fn(),
    };

    const service = createGeocodingService({ providers: [{ id: 'x', geocode }], cacheRepository });
    const result = await service.resolve('Grenoble');

    expect(result.source).toBe('cache');
    expect(geocode).not.toHaveBeenCalled();
  });

  it('memorise une resolution reseau dans le cache', async () => {
    const set = vi.fn();
    const service = createGeocodingService({
      providers: [
        {
          id: 'ban',
          geocode: async () => ({ latitude: 45, longitude: 5, label: 'Grenoble', provider: 'ban' }),
        },
      ],
      cacheRepository: { get: async () => null, set },
    });

    await service.resolve('Grenoble');
    expect(set).toHaveBeenCalledWith('Grenoble', expect.objectContaining({ latitude: 45 }));
  });

  it('bascule sur le fournisseur suivant si le premier echoue', async () => {
    const service = createGeocodingService({
      providers: [
        {
          id: 'ban',
          geocode: async () => {
            throw new GeoProviderError('introuvable', { kind: 'not-found' });
          },
        },
        {
          id: 'nominatim',
          geocode: async () => ({ latitude: 51, longitude: 0, label: 'Londres', provider: 'nominatim' }),
        },
      ],
    });

    const result = await service.resolve('Londres');
    expect(result.provider).toBe('nominatim');
  });
});

describe('itineraire et distance', () => {
  const routingProvider = createOsrmRoutingProvider({
    fetchImpl: async () =>
      jsonResponse({ code: 'Ok', routes: [{ distance: 110400, duration: 4800 }] }),
  });

  const geocodingService = {
    resolve: async (address) => ({
      latitude: address === 'Grenoble' ? 45.18 : 45.75,
      longitude: address === 'Grenoble' ? 5.72 : 4.85,
      label: address,
      provider: 'test',
      source: 'coords',
    }),
  };

  it('renvoie la distance en kilometres arrondie au dixieme', async () => {
    const service = createDistanceService({ geocodingService, routingProvider });
    const result = await service.computeTripDistance({ from: 'Grenoble', to: 'Lyon' });

    expect(result.km).toBeCloseTo(110.4, 6);
    expect(result.oneWayKm).toBeCloseTo(110.4, 6);
    expect(result.provider).toBe('osrm');
  });

  it('double la distance pour un aller-retour', async () => {
    const service = createDistanceService({ geocodingService, routingProvider });
    const result = await service.computeTripDistance({
      from: 'Grenoble',
      to: 'Lyon',
      roundTrip: true,
    });

    expect(result.km).toBeCloseTo(220.8, 6);
    expect(result.oneWayKm).toBeCloseTo(110.4, 6);
    expect(result.durationSeconds).toBe(9600);
  });

  it('signale l’absence d’itineraire', async () => {
    const failing = createOsrmRoutingProvider({
      fetchImpl: async () => jsonResponse({ code: 'NoRoute', routes: [] }),
    });
    const service = createDistanceService({ geocodingService, routingProvider: failing });

    await expect(service.computeTripDistance({ from: 'A', to: 'B' })).rejects.toMatchObject({
      kind: 'not-found',
    });
  });

  it('permet de changer d’instance OSRM sans toucher au reste', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: 'Ok', routes: [{ distance: 1000, duration: 60 }] }),
    );
    const provider = createOsrmRoutingProvider({ fetchImpl, baseUrl: 'https://osrm.agilmea.test' });

    await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });

    expect(fetchImpl.mock.calls[0][0]).toContain('https://osrm.agilmea.test/route/v1/driving/2,1;4,3');
  });
});
