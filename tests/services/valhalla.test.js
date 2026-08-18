/**
 * Fournisseur d'itineraire Valhalla.
 * Reseau entierement simule : aucun appel reel, aucune dependance a un service.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createValhallaRoutingProvider,
  ROUTE_PREFERENCES,
  ROUTE_PREFERENCE_LABELS,
  normalizeRoutePreference,
} from '../../src/services/geo/providers/valhallaRoutingProvider.js';
import { createDistanceService } from '../../src/services/geo/distanceService.js';
import { GeoProviderError } from '../../src/services/geo/types.js';

/** Reponse minimale conforme a l'API Valhalla. */
function tripResponse({ km = 60.5, seconds = 3120, shape = '_p~iF~ps|U_ulLnnqC' } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      trip: {
        status: 0,
        summary: { length: km, time: seconds },
        legs: [{ shape }],
      },
    }),
  };
}

function bodyOf(fetchMock, callIndex = 0) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body);
}

describe('construction de la requete', () => {
  it('envoie un POST sur /route avec les deux points', async () => {
    const fetchImpl = vi.fn(async () => tripResponse());
    const provider = createValhallaRoutingProvider({ fetchImpl });

    await provider.route({ latitude: 45.1, longitude: 5.7 }, { latitude: 45.7, longitude: 4.8 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://valhalla1.openstreetmap.de/route');
    expect(init.method).toBe('POST');

    const body = bodyOf(fetchImpl);
    expect(body.costing).toBe('auto');
    expect(body.locations).toEqual([
      { lat: 45.1, lon: 5.7 },
      { lat: 45.7, lon: 4.8 },
    ]);
  });

  it('traduit chaque preference en options de cout', async () => {
    const cases = [
      [ROUTE_PREFERENCES.FASTEST, { use_highways: 1, use_tolls: 1 }],
      [ROUTE_PREFERENCES.NO_HIGHWAY, { use_highways: 0, use_tolls: 1 }],
      [ROUTE_PREFERENCES.NO_TOLL, { use_highways: 1, use_tolls: 0 }],
    ];

    for (const [preference, expected] of cases) {
      const fetchImpl = vi.fn(async () => tripResponse());
      const provider = createValhallaRoutingProvider({ fetchImpl });
      await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, {
        preference,
      });
      expect(bodyOf(fetchImpl).costing_options.auto).toEqual(expected);
    }
  });

  it('retombe sur « le plus rapide » si la preference est inconnue', async () => {
    const fetchImpl = vi.fn(async () => tripResponse());
    const provider = createValhallaRoutingProvider({ fetchImpl });

    await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, {
      preference: 'fantaisie',
    });

    expect(bodyOf(fetchImpl).costing_options.auto).toEqual({ use_highways: 1, use_tolls: 1 });
  });

  it('n’envoie aucune cle d’API', async () => {
    const fetchImpl = vi.fn(async () => tripResponse());
    const provider = createValhallaRoutingProvider({ fetchImpl });
    await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });

    const serialized = JSON.stringify(fetchImpl.mock.calls[0]);
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toMatch(/token/i);
  });
});

describe('lecture de la reponse', () => {
  it('convertit les kilometres de l’API en metres du contrat', async () => {
    const provider = createValhallaRoutingProvider({
      fetchImpl: async () => tripResponse({ km: 60.5, seconds: 3120 }),
    });

    const route = await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });

    expect(route.distanceMeters).toBeCloseTo(60500, 6);
    expect(route.durationSeconds).toBe(3120);
    expect(route.provider).toBe('valhalla');
  });

  it('decode la geometrie en points, pas en chaine', async () => {
    const provider = createValhallaRoutingProvider({ fetchImpl: async () => tripResponse() });
    const route = await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });

    expect(Array.isArray(route.geometry)).toBe(true);
    expect(route.geometry.length).toBeGreaterThan(1);
    expect(route.geometry[0]).toHaveLength(2);
  });

  it('concatene les POINTS de plusieurs segments, pas les chaines encodees', async () => {
    // Chaque segment encode ses deltas depuis sa propre origine : concatener
    // les chaines produirait un trace faux des le deuxieme segment.
    const oneLeg = createValhallaRoutingProvider({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          trip: { status: 0, summary: { length: 1, time: 1 }, legs: [{ shape: '_p~iF~ps|U' }] },
        }),
      }),
    });
    const twoLegs = createValhallaRoutingProvider({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          trip: {
            status: 0,
            summary: { length: 2, time: 2 },
            legs: [{ shape: '_p~iF~ps|U' }, { shape: '_p~iF~ps|U' }],
          },
        }),
      }),
    });

    const a = await oneLeg.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });
    const b = await twoLegs.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });

    expect(a.geometry).toHaveLength(1);
    expect(b.geometry).toHaveLength(2);
    // Les deux segments identiques donnent deux fois le meme point.
    expect(b.geometry[0]).toEqual(b.geometry[1]);
  });

  it('renvoie la preference appliquee', async () => {
    const provider = createValhallaRoutingProvider({ fetchImpl: async () => tripResponse() });
    const route = await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, {
      preference: ROUTE_PREFERENCES.NO_TOLL,
    });
    expect(route.preference).toBe('no-toll');
  });

  it('accepte une reponse sans geometrie', async () => {
    const provider = createValhallaRoutingProvider({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ trip: { status: 0, summary: { length: 10, time: 60 }, legs: [] } }),
      }),
    });
    const route = await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });
    expect(route.geometry).toBeNull();
    expect(route.distanceMeters).toBe(10000);
  });
});

describe('erreurs', () => {
  it('signale un service indisponible', async () => {
    const provider = createValhallaRoutingProvider({
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    await expect(
      provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('signale l’absence d’itineraire', async () => {
    const provider = createValhallaRoutingProvider({
      fetchImpl: async () => ({ ok: true, json: async () => ({ error_code: 442 }) }),
    });
    await expect(
      provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }),
    ).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('laisse remonter une annulation sans la convertir en panne', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const provider = createValhallaRoutingProvider({
      fetchImpl: async () => {
        throw abort;
      },
    });
    await expect(
      provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }),
    ).rejects.toThrow('aborted');
  });

  it('enveloppe une panne reseau', async () => {
    const provider = createValhallaRoutingProvider({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(
      provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }),
    ).rejects.toBeInstanceOf(GeoProviderError);
  });
});

describe('configuration', () => {
  it('permet de changer d’instance sans toucher au reste', async () => {
    const fetchImpl = vi.fn(async () => tripResponse());
    const provider = createValhallaRoutingProvider({
      fetchImpl,
      baseUrl: 'https://valhalla.agilmea.test',
    });
    await provider.route({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://valhalla.agilmea.test/route');
  });

  it('declare le delai impose par le serveur public', () => {
    expect(createValhallaRoutingProvider().minDelayMs).toBeGreaterThanOrEqual(1000);
  });

  it('expose les libelles dans l’ordre d’affichage', () => {
    expect(ROUTE_PREFERENCE_LABELS.map((o) => o.value)).toEqual([
      'fastest',
      'no-highway',
      'no-toll',
    ]);
  });

  it('normalise les preferences', () => {
    expect(normalizeRoutePreference('no-toll')).toBe('no-toll');
    expect(normalizeRoutePreference(undefined)).toBe('fastest');
    expect(normalizeRoutePreference('')).toBe('fastest');
  });
});

describe('integration avec le service de distance', () => {
  const geocodingService = {
    resolve: async (address) => ({
      latitude: address === 'A' ? 45.1 : 45.7,
      longitude: address === 'A' ? 5.7 : 4.8,
      label: address,
      provider: 'test',
      source: 'coords',
    }),
  };

  it('transmet la preference au fournisseur et remonte la geometrie', async () => {
    const route = vi.fn(async () => ({
      distanceMeters: 62000,
      durationSeconds: 4140,
      geometry: [
        [45.1, 5.7],
        [45.7, 4.8],
      ],
      provider: 'valhalla',
      preference: 'no-toll',
    }));

    const service = createDistanceService({ geocodingService, routingProvider: { route } });
    const result = await service.computeTripDistance({
      from: 'A',
      to: 'B',
      preference: 'no-toll',
    });

    expect(route.mock.calls[0][2]).toMatchObject({ preference: 'no-toll' });
    expect(result.km).toBeCloseTo(62, 6);
    expect(result.preference).toBe('no-toll');
    expect(result.geometry).toHaveLength(2);
  });

  it('double la distance en aller-retour sans dupliquer le trace', async () => {
    const route = async () => ({
      distanceMeters: 62000,
      durationSeconds: 4140,
      geometry: [
        [45.1, 5.7],
        [45.7, 4.8],
      ],
      provider: 'valhalla',
    });

    const service = createDistanceService({ geocodingService, routingProvider: { route } });
    const result = await service.computeTripDistance({ from: 'A', to: 'B', roundTrip: true });

    expect(result.km).toBeCloseTo(124, 6);
    expect(result.oneWayKm).toBeCloseTo(62, 6);
    // Le trace reste celui de l'aller : l'afficher deux fois n'aurait pas de sens.
    expect(result.geometry).toHaveLength(2);
  });
});
