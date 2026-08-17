/**
 * Recherche d'adresses : priorite des favoris, cache, anti-rebond, annulation.
 *
 * Aucun appel reseau : les fournisseurs sont des doublures. Les tests ne
 * dependent donc jamais de la disponibilite d'un service externe (§35).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAddressSearchService,
  createSearchController,
  favoriteToSuggestion,
  MIN_QUERY_LENGTH,
} from '../../src/services/geo/addressSearchService.js';
import { createSuggestion } from '../../src/services/geo/types.js';
import { createFavoritePlace } from '../../src/domain/models.js';

/* ------------------------------------------------------------------ */
/* Doublures                                                           */
/* ------------------------------------------------------------------ */

function fakeFavorites(places) {
  return { list: async () => places };
}

function fakeRecents(records = []) {
  return {
    search: async (query, limit) =>
      records
        .filter((record) => record.label.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit),
  };
}

function fakeProvider(results, { id = 'fake', onCall = () => {} } = {}) {
  return {
    id,
    label: id,
    attribution: '',
    suggest: async (query, options) => {
      onCall(query, options);
      return results.map((label, index) =>
        createSuggestion({
          id: `${id}:${index}`,
          label,
          secondary: '38000 Grenoble',
          latitude: 45 + index / 1000,
          longitude: 5,
          provider: id,
        }),
      );
    },
  };
}

const domicile = createFavoritePlace({
  id: 'p1',
  name: 'Domicile',
  address: { line1: '12 rue Exemple', postalCode: '38000', city: 'Grenoble' },
  latitude: 45.188,
  longitude: 5.724,
});

const bureau = createFavoritePlace({
  id: 'p2',
  name: 'Bureau Grenoble',
  address: { line1: '1 place Victor Hugo', postalCode: '38000', city: 'Grenoble' },
});

/* ------------------------------------------------------------------ */

describe('priorite des sources', () => {
  it('place les favoris avant tout le reste', async () => {
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([domicile, bureau]),
      recentAddressRepository: fakeRecents([{ label: 'Domaine de la Source', key: 'x' }]),
      providers: [fakeProvider(['Domont', 'Dommartin'])],
    });

    const { suggestions } = await service.search('Dom');

    expect(suggestions[0].source).toBe('favorite');
    expect(suggestions[0].name).toBe('Domicile');
    const sources = suggestions.map((s) => s.source);
    expect(sources.indexOf('favorite')).toBeLessThan(sources.indexOf('recent'));
    expect(sources.indexOf('recent')).toBeLessThan(sources.indexOf('provider'));
  });

  it('propose un favori des le premier caractere, sans appeler le reseau', async () => {
    const onCall = vi.fn();
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([domicile]),
      recentAddressRepository: fakeRecents(),
      providers: [fakeProvider(['peu importe'], { onCall })],
    });

    const { suggestions } = await service.search('D');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].source).toBe('favorite');
    expect(onCall).not.toHaveBeenCalled();
    expect(MIN_QUERY_LENGTH).toBe(3);
  });

  it('fait remonter le favori dont le NOM commence par la saisie', async () => {
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([bureau, domicile]),
      recentAddressRepository: fakeRecents(),
      providers: [],
    });

    const { suggestions } = await service.search('Dom');
    expect(suggestions[0].name).toBe('Domicile');
  });

  it('retrouve un favori par son adresse et pas seulement par son nom', async () => {
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([domicile]),
      recentAddressRepository: fakeRecents(),
      providers: [],
    });

    const { suggestions } = await service.search('Victor');
    expect(suggestions).toHaveLength(0);

    const found = await service.search('rue Exemple');
    expect(found.suggestions[0].name).toBe('Domicile');
  });

  it('ignore les accents et la casse', async () => {
    const place = createFavoritePlace({ id: 'p9', name: 'Chambéry', address: {} });
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([place]),
      recentAddressRepository: fakeRecents(),
      providers: [],
    });

    expect((await service.search('chambery')).suggestions).toHaveLength(1);
  });

  it('renseigne l’adresse du favori dans le champ, pas son surnom', () => {
    const suggestion = favoriteToSuggestion(domicile);
    expect(suggestion.label).toBe('Domicile');
    expect(suggestion.fullLabel).toBe('12 rue Exemple, 38000 Grenoble');
    expect(suggestion.latitude).toBeCloseTo(45.188, 5);
  });
});

describe('dedoublonnage et limite', () => {
  it('supprime les doublons entre sources', async () => {
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents([{ label: 'Lyon Part-Dieu', key: 'lyon part dieu' }]),
      providers: [fakeProvider(['Lyon Part-Dieu'])],
    });

    const { suggestions } = await service.search('Lyon Part-Dieu');
    const labels = suggestions.map((s) => s.fullLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('respecte la limite demandee', async () => {
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [fakeProvider(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])],
    });

    const { suggestions } = await service.search('rue', { limit: 4 });
    expect(suggestions.length).toBeLessThanOrEqual(4);
  });

  it('renvoie une liste vide pour une saisie vide', async () => {
    const service = createAddressSearchService({ providers: [] });
    expect((await service.search('   ')).suggestions).toEqual([]);
  });
});

describe('cache reseau', () => {
  it('ne redemande pas au fournisseur une requete deja resolue', async () => {
    const onCall = vi.fn();
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [fakeProvider(['12 rue Jean Jaures'], { onCall })],
    });

    await service.search('12 rue jean jau');
    await service.search('12 rue jean jau');
    await service.search('12 RUE JEAN JAU');

    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it('vide le cache a la demande', async () => {
    const onCall = vi.fn();
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [fakeProvider(['resultat'], { onCall })],
    });

    await service.search('grenoble');
    service.clearCache();
    await service.search('grenoble');

    expect(onCall).toHaveBeenCalledTimes(2);
  });
});

describe('repli entre fournisseurs', () => {
  it('bascule sur le fournisseur suivant en cas de panne', async () => {
    const failing = {
      id: 'ban',
      suggest: async () => {
        throw new Error('503');
      },
    };

    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [failing, fakeProvider(['Secours'], { id: 'photon' })],
    });

    const { suggestions, error } = await service.search('grenoble');
    expect(error).toBeNull();
    expect(suggestions[0].provider).toBe('photon');
  });

  it('conserve favoris et recents meme si tous les fournisseurs echouent', async () => {
    const failing = {
      id: 'ban',
      suggest: async () => {
        throw new Error('hors ligne');
      },
    };

    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([domicile]),
      recentAddressRepository: fakeRecents(),
      providers: [failing],
    });

    const { suggestions } = await service.search('Domicile');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].source).toBe('favorite');
  });

  it('remonte l’erreur quand tous les fournisseurs echouent', async () => {
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [
        {
          id: 'ban',
          suggest: async () => {
            throw new Error('503 Service Unavailable');
          },
        },
      ],
    });

    const { suggestions, error } = await service.search('grenoble');
    expect(suggestions).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('503');
  });

  it('ne signale pas d’erreur quand le fournisseur repond simplement « aucun resultat »', async () => {
    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [fakeProvider([])],
    });

    const { suggestions, error } = await service.search('zzzzzzzz');
    expect(suggestions).toEqual([]);
    expect(error).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Anti-rebond et annulation                                           */
/* ------------------------------------------------------------------ */

describe('createSearchController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function controllerWith(searchImpl, options = {}) {
    const onResults = vi.fn();
    const controller = createSearchController({
      service: { search: searchImpl },
      onResults,
      debounceMs: 250,
      minChars: 1,
      ...options,
    });
    return { controller, onResults };
  }

  it('n’envoie qu’une seule requete pour une frappe continue', async () => {
    const search = vi.fn(async () => ({ suggestions: [], error: null }));
    const { controller } = controllerWith(search);

    controller.query('1');
    controller.query('12');
    controller.query('12 r');
    controller.query('12 rue');

    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('12 rue', expect.objectContaining({ limit: 6 }));
  });

  it('attend le delai complet avant d’interroger le service', async () => {
    const search = vi.fn(async () => ({ suggestions: [], error: null }));
    const { controller } = controllerWith(search);

    controller.query('grenoble');
    await vi.advanceTimersByTimeAsync(200);
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('annule la requete en vol quand la saisie continue', async () => {
    const signals = [];
    const search = vi.fn(
      (query, { signal }) =>
        new Promise((resolve) => {
          signals.push(signal);
          signal.addEventListener('abort', () => resolve({ suggestions: [], error: null }));
        }),
    );

    const { controller } = controllerWith(search);

    controller.query('gre');
    await vi.advanceTimersByTimeAsync(250);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    controller.query('greno');
    expect(signals[0].aborted).toBe(true);
  });

  it('ignore une reponse tardive appartenant a une recherche perimee', async () => {
    let resolveFirst;
    const search = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async () => ({
        suggestions: [createSuggestion({ label: 'recent', provider: 'x' })],
        error: null,
      }));

    const { controller, onResults } = controllerWith(search);

    controller.query('gre');
    await vi.advanceTimersByTimeAsync(250);

    controller.query('greno');
    await vi.advanceTimersByTimeAsync(250);

    // La premiere requete repond APRES la seconde.
    resolveFirst({
      suggestions: [createSuggestion({ label: 'perime', provider: 'x' })],
      error: null,
    });
    await vi.advanceTimersByTimeAsync(0);

    const labels = onResults.mock.calls.map(([suggestions]) => suggestions[0]?.label);
    expect(labels).not.toContain('perime');
    expect(labels).toContain('recent');
  });

  it('vide la liste sous le nombre minimum de caracteres', async () => {
    const search = vi.fn(async () => ({ suggestions: [], error: null }));
    const { controller, onResults } = controllerWith(search, { minChars: 2 });

    controller.query('a');
    await vi.advanceTimersByTimeAsync(300);

    expect(search).not.toHaveBeenCalled();
    expect(onResults).toHaveBeenCalledWith([], expect.objectContaining({ reason: 'trop-court' }));
  });

  it('cancel() empeche toute requete', async () => {
    const search = vi.fn(async () => ({ suggestions: [], error: null }));
    const { controller } = controllerWith(search);

    controller.query('grenoble');
    controller.cancel();
    await vi.advanceTimersByTimeAsync(500);

    expect(search).not.toHaveBeenCalled();
  });
});
