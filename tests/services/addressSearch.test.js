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

/** Doublure rendant des suggestions completes, pour tester le classement. */
function fakeRichProvider(entries, { id = 'fake' } = {}) {
  return {
    id,
    label: id,
    attribution: '',
    suggest: async () =>
      entries.map((entry, index) =>
        createSuggestion({ id: `${id}:${index}`, provider: id, ...entry }),
      ),
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

  /*
   * Le nom seul rendrait l'etat de frais illisible pour un tiers — « Domicile »
   * ne prouve rien. L'adresse seule ne disait pas, a la saisie, quel lieu on
   * venait de choisir. Le champ porte donc les deux.
   */
  it('renseigne le nom ET l’adresse du favori dans le champ', () => {
    const suggestion = favoriteToSuggestion(domicile);
    expect(suggestion.label).toBe('Domicile');
    expect(suggestion.fullLabel).toBe('Domicile — 12 rue Exemple, 38000 Grenoble');
    expect(suggestion.latitude).toBeCloseTo(45.188, 5);
  });

  it('se limite au nom pour un favori sans adresse', () => {
    const suggestion = favoriteToSuggestion({ id: 'p9', name: 'Atelier', address: {} });
    expect(suggestion.fullLabel).toBe('Atelier');
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

describe('fusion des annuaires', () => {
  it('fait remonter le resultat qui repond a la saisie, quelle que soit sa source', async () => {
    // L'annuaire d'adresses ne connait pas les commerces : interroge sur un nom
    // d'enseigne, il repond des communes et des routes homonymes. En cascade,
    // ces reponses hors sujet remplissaient la liste et masquaient l'annuaire
    // de lieux, seul a connaitre le magasin.
    const adresses = fakeRichProvider(
      [
        { label: 'La Cote-Saint-Andre', secondary: '38260 La Cote-Saint-Andre' },
        { label: 'Route de Saint Andre la Cote', secondary: '69440 Chabaniere' },
        { label: 'Route de la Cote Saint-Andre', secondary: '38260 Sardieu' },
      ],
      { id: 'ban' },
    );
    const lieux = fakeRichProvider(
      [{ label: 'Bricomarche', secondary: 'Chemin des Moilles, 38260 La Cote-Saint-Andre' }],
      { id: 'photon' },
    );

    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [adresses, lieux],
    });

    const { suggestions } = await service.search('bricomarche la cote saint andre');

    expect(suggestions[0].label).toBe('Bricomarche');
    expect(suggestions[0].provider).toBe('photon');
    // Les reponses de l'annuaire d'adresses restent proposees, en dessous.
    expect(suggestions.length).toBeGreaterThan(1);
  });

  it('interroge toutes les sources, meme quand la premiere repond', async () => {
    const appels = [];
    const premier = fakeProvider(['Grenoble'], { id: 'ban', onCall: () => appels.push('ban') });
    const second = fakeProvider(['Grenoble Est'], {
      id: 'photon',
      onCall: () => appels.push('photon'),
    });

    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [premier, second],
    });

    await service.search('grenoble');

    expect(appels).toEqual(['ban', 'photon']);
  });

  it('ne propose qu’une fois un lieu que les deux annuaires decrivent', async () => {
    // Meme endroit, deux ecritures : la comparaison des textes ne suffit pas,
    // les coordonnees les rapprochent.
    const adresses = fakeRichProvider(
      [{ label: '150 Chemin des Moilles', secondary: '38260 La Cote-Saint-Andre', latitude: 45.3931, longitude: 5.2569 }],
      { id: 'ban' },
    );
    const lieux = fakeRichProvider(
      [{ label: 'Chemin des Moilles', secondary: '38260 La Cote-Saint-Andre France', latitude: 45.39312, longitude: 5.25691 }],
      { id: 'photon' },
    );

    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [adresses, lieux],
    });

    const { suggestions } = await service.search('chemin des moilles');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].provider).toBe('ban');
  });

  it('signale la panne plutot que de faire croire a une absence de resultat', async () => {
    // Un annuaire tombe, l'autre ne trouve rien : la liste est vide, mais pour
    // une raison que l'utilisateur doit connaitre.
    const enPanne = {
      id: 'ban',
      suggest: async () => {
        throw new Error('503 Service Unavailable');
      },
    };

    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [enPanne, fakeProvider([], { id: 'photon' })],
    });

    const { suggestions, error } = await service.search('zzzzzzz');

    expect(suggestions).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('503');
  });

  it('sert l’annuaire encore debout quand l’autre tombe', async () => {
    const enPanne = {
      id: 'ban',
      suggest: async () => {
        throw new Error('503');
      },
    };

    const service = createAddressSearchService({
      favoritePlaceRepository: fakeFavorites([]),
      recentAddressRepository: fakeRecents(),
      providers: [enPanne, fakeProvider(['Secours'], { id: 'photon' })],
    });

    const { suggestions, error } = await service.search('grenoble');

    expect(error).toBeNull();
    expect(suggestions[0].provider).toBe('photon');
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
