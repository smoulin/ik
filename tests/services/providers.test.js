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

/**
 * Sens inverse. Les extremites d'une trace GPS n'arrivent qu'en coordonnees :
 * sans lui, elles resteraient anonymes dans la liste des trajets a valider.
 */
describe('geocodage inverse', () => {
  const REVERSE_RESPONSE = {
    type: 'FeatureCollection',
    features: [
      {
        geometry: { type: 'Point', coordinates: [5.1204, 45.2891] },
        properties: { label: '70 Rue du Pont Neuf 38980 Viriville', distance: 14 },
      },
    ],
  };

  // R1
  it('nomme un point releve par le GPS', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(REVERSE_RESPONSE));
    const provider = createBanGeocodingProvider({ fetchImpl });

    const result = await provider.reverse(45.2891, 5.1204);

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe('/reverse/');
    expect(url.searchParams.get('lat')).toBe('45.2891');
    expect(url.searchParams.get('lon')).toBe('5.1204');
    // Aucune cle d'API ne doit transiter (§4).
    expect(url.searchParams.has('key')).toBe(false);

    expect(result.label).toBe('70 Rue du Pont Neuf 38980 Viriville');
    expect(result.distanceMeters).toBe(14);
    expect(result.provider).toBe('ban');
  });

  // R2 — la BAN ne couvre que la France : hors de ses limites, liste vide.
  it('signale un point hors couverture sans le confondre avec une panne', async () => {
    const provider = createBanGeocodingProvider({
      fetchImpl: async () => jsonResponse({ features: [] }),
    });
    await expect(provider.reverse(51.5, -0.12)).rejects.toMatchObject({ kind: 'not-found' });
  });

  // R3
  it('signale un service injoignable', async () => {
    const provider = createBanGeocodingProvider({
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    await expect(provider.reverse(45.2891, 5.1204)).rejects.toMatchObject({
      kind: 'network',
      provider: 'ban',
    });
  });

  it('refuse des coordonnees invalides sans appeler le reseau', async () => {
    const fetchImpl = vi.fn();
    const provider = createBanGeocodingProvider({ fetchImpl });

    await expect(provider.reverse(NaN, 5.12)).rejects.toMatchObject({ kind: 'not-found' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createGeocodingService — describe()', () => {
  /** Cache en memoire, avec la meme interface que le depot persistant. */
  function memoryCache() {
    const entries = new Map();
    return {
      get: async (key) => entries.get(key) || null,
      set: async (key, value) => entries.set(key, value),
    };
  }

  function countingProvider(label = '70 Rue du Pont Neuf 38980 Viriville') {
    const reverse = vi.fn(async (latitude, longitude) => ({
      latitude,
      longitude,
      label: `${label}`,
      provider: 'ban',
    }));
    return { provider: { id: 'ban', reverse }, reverse };
  }

  // R4
  it('sert le second appel depuis le cache', async () => {
    const { provider, reverse } = countingProvider();
    const service = createGeocodingService({
      providers: [provider],
      cacheRepository: memoryCache(),
    });

    await service.describe({ latitude: 45.2891, longitude: 5.1204 });
    const second = await service.describe({ latitude: 45.2891, longitude: 5.1204 });

    expect(reverse).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('cache');
  });

  // R5 — deux releves au meme endroit doivent tomber sur la meme cle, sinon le
  // cache ne servirait a rien : le GPS ne rend jamais deux fois le meme point.
  //
  // La grille d'arrondi ne le garantit qu'a l'interieur d'une meme case : deux
  // points voisins separes par une frontiere coutent une requete de plus. Ce
  // test verifie le cas courant, pas une propriete universelle.
  it('regroupe deux relevés voisins tombant dans la même case', async () => {
    const { provider, reverse } = countingProvider();
    const service = createGeocodingService({
      providers: [provider],
      cacheRepository: memoryCache(),
    });

    await service.describe({ latitude: 45.28911, longitude: 5.12041 });
    await service.describe({ latitude: 45.28914, longitude: 5.12044 });

    expect(reverse).toHaveBeenCalledTimes(1);
  });

  // R6
  it('distingue deux lieux réellement différents', async () => {
    const { provider, reverse } = countingProvider();
    const service = createGeocodingService({
      providers: [provider],
      cacheRepository: memoryCache(),
    });

    await service.describe({ latitude: 45.2891, longitude: 5.1204 });
    await service.describe({ latitude: 45.2909, longitude: 5.1204 });

    expect(reverse).toHaveBeenCalledTimes(2);
  });

  // Le signe doit survivre a la normalisation des cles, qui supprime la
  // ponctuation : sans quoi Brest et un point d'Isere partageraient une entree.
  it('ne confond pas une longitude négative avec son opposée', async () => {
    const { provider, reverse } = countingProvider();
    const service = createGeocodingService({
      providers: [provider],
      cacheRepository: memoryCache(),
    });

    await service.describe({ latitude: 48.39, longitude: -4.486 });
    await service.describe({ latitude: 48.39, longitude: 4.486 });

    expect(reverse).toHaveBeenCalledTimes(2);
  });

  it('saute un fournisseur qui ne sait pas faire l’inverse', async () => {
    const { provider, reverse } = countingProvider();
    const service = createGeocodingService({
      providers: [{ id: 'sans-reverse', geocode: vi.fn() }, provider],
      cacheRepository: null,
    });

    const result = await service.describe({ latitude: 45.2891, longitude: 5.1204 });

    expect(reverse).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('ban');
  });

  it('remonte une erreur typée quand aucun fournisseur ne répond', async () => {
    const service = createGeocodingService({
      providers: [
        {
          id: 'ban',
          reverse: async () => {
            throw new GeoProviderError('injoignable', { provider: 'ban' });
          },
        },
      ],
      cacheRepository: null,
    });

    await expect(service.describe({ latitude: 45.2891, longitude: 5.1204 })).rejects.toBeInstanceOf(
      GeoProviderError,
    );
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
