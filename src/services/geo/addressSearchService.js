/**
 * Recherche d'adresses — orchestration des sources.
 *
 * Ordre impose par le cahier des charges (§29) :
 *   1. lieux favoris correspondants      (marques ★, toujours en tete)
 *   2. adresses recemment utilisees      (marquees ↻)
 *   3. fournisseur d'autocompletion en ligne
 *
 * Consequence recherchee : plus l'application sert, moins elle sollicite le reseau.
 *
 * Ce service ne connait ni le DOM ni un fournisseur particulier : tout lui est
 * injecte, ce qui le rend testable avec de simples doublures.
 */

import { createSuggestion } from './types.js';
import { normalizeText, matchesAllWords, startsWithWord } from '../../shared/normalize.js';
import { formatAddressOneLine } from '../../domain/models.js';

/** Nombre de caracteres a partir duquel on interroge le reseau. */
export const MIN_QUERY_LENGTH = 3;

/** Delai d'inactivite avant d'envoyer une requete, en millisecondes. */
export const DEFAULT_DEBOUNCE_MS = 250;

export function createAddressSearchService({
  favoritePlaceRepository,
  recentAddressRepository,
  providers = [],
  cacheSize = 50,
} = {}) {
  /** Cache memoire des reponses reseau, borne, vide a chaque rechargement. */
  const cache = new Map();

  function readCache(key) {
    if (!cache.has(key)) return null;
    const value = cache.get(key);
    // Remonte l'entree : eviction du moins recemment utilise.
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function writeCache(key, value) {
    cache.set(key, value);
    if (cache.size > cacheSize) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  }

  /** Lieux favoris correspondant a la saisie — disponibles des le 1er caractere. */
  async function searchFavorites(query, limit) {
    if (!favoritePlaceRepository) return [];
    const places = await favoritePlaceRepository.list();
    const scored = places
      .map((place) => {
        const haystack = `${place.name} ${formatAddressOneLine(place.address)}`;
        if (!matchesAllWords(haystack, query)) return null;
        // Un favori dont le NOM commence par la saisie passe devant : « Dom » -> « Domicile ».
        const rank = startsWithWord(place.name, query) ? 0 : 1;
        return { place, rank };
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name, 'fr'));

    return scored.slice(0, limit).map(({ place }) => favoriteToSuggestion(place));
  }

  async function searchRecents(query, limit) {
    if (!recentAddressRepository || limit <= 0) return [];
    const records = await recentAddressRepository.search(query, limit);
    return records.map((record) =>
      createSuggestion({
        id: `recent:${record.key}`,
        source: 'recent',
        label: record.label,
        secondary: [record.postalCode, record.city].filter(Boolean).join(' '),
        fullLabel: record.label,
        postalCode: record.postalCode,
        city: record.city,
        latitude: record.latitude,
        longitude: record.longitude,
        provider: 'recent',
      }),
    );
  }

  /**
   * Interroge tous les fournisseurs ensemble, puis fusionne leurs reponses.
   *
   * Les deux annuaires ne savent pas la meme chose : celui des adresses ignore
   * les commerces, celui des lieux les connait mais couvre moins bien les
   * rues. En cascade, le premier a repondre masquait l'autre — chercher
   * « Bricomarche » ne rendait que des communes homonymes.
   *
   * Une panne isolee reste invisible : l'annuaire encore debout sert seul.
   */
  async function searchProviders(query, limit, signal) {
    if (limit <= 0 || !providers.length) return [];

    const cacheKey = `${normalizeText(query)}|${limit}`;
    const cached = readCache(cacheKey);
    if (cached) return cached;

    const settled = await Promise.allSettled(
      providers.map((provider) => provider.suggest(query, { limit, signal })),
    );

    // Une saisie poursuivie annule les requetes : ce n'est pas une panne.
    const aborted = settled.find(
      (outcome) => outcome.status === 'rejected' && outcome.reason?.name === 'AbortError',
    );
    if (aborted) throw aborted.reason;

    const merged = settled.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value : [],
    );

    if (!merged.length) {
      // Tous en echec : on remonte l'erreur pour que l'appelant l'affiche.
      // Zero resultat n'est pas une panne et reste mis en cache.
      const failed = settled.filter((outcome) => outcome.status === 'rejected');
      if (failed.length === settled.length && failed.length) throw failed[0].reason;

      writeCache(cacheKey, []);
      return [];
    }

    const ranked = rankByQuery(merged, query);
    writeCache(cacheKey, ranked);
    return ranked;
  }

  /**
   * Classe les reponses fusionnees par pertinence apparente.
   *
   * Seule regle : une suggestion qui contient TOUS les mots saisis passe
   * devant celles qui n'en contiennent qu'une partie. C'est ce qui fait
   * remonter « Bricomarche, 38260 La Cote-Saint-Andre » au-dessus des
   * « Route de Saint-Andre » que l'annuaire d'adresses renvoie pour la meme
   * saisie. Sans ce classement, la fusion ne servirait a rien : les reponses
   * hors sujet remplissent a elles seules la liste.
   *
   * A pertinence egale, l'ordre des fournisseurs est conserve.
   */
  function rankByQuery(suggestions, query) {
    return suggestions
      .map((suggestion, index) => ({
        suggestion,
        index,
        rank: matchesAllWords(`${suggestion.label} ${suggestion.secondary}`, query) ? 0 : 1,
      }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.suggestion);
  }

  /**
   * Recherche complete, sources fusionnees et dedoublonnees.
   *
   * @param {string} query
   * @param {{limit?: number, signal?: AbortSignal}} options
   * @returns {Promise<{suggestions: import('./types.js').AddressSuggestion[], error: Error|null}>}
   */
  async function search(query, { limit = 6, signal } = {}) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return { suggestions: [], error: null };

    const seen = new Set();
    const output = [];

    const push = (suggestion) => {
      const key = normalizeText(suggestion.fullLabel || suggestion.label);
      if (!key || seen.has(key)) return;

      // Deux annuaires ecrivent rarement une adresse de la meme facon, mais
      // ils la situent au meme endroit. La grille au dix-millieme de degre
      // vaut une dizaine de metres : assez fin pour ne pas confondre deux
      // commerces voisins, assez large pour reconnaitre une meme adresse.
      const spot =
        Number.isFinite(suggestion.latitude) && Number.isFinite(suggestion.longitude)
          ? `@${suggestion.latitude.toFixed(4)},${suggestion.longitude.toFixed(4)}`
          : null;
      if (spot && seen.has(spot)) return;

      seen.add(key);
      if (spot) seen.add(spot);
      output.push(suggestion);
    };

    // 1. Favoris — jusqu'a la moitie de la liste, des le premier caractere.
    const favorites = await searchFavorites(trimmed, Math.max(1, Math.ceil(limit / 2)));
    favorites.forEach(push);

    // 2. Adresses recentes.
    const recents = await searchRecents(trimmed, Math.min(2, limit - output.length));
    recents.forEach(push);

    // 3. Fournisseur en ligne — seulement a partir de MIN_QUERY_LENGTH caracteres.
    let error = null;
    if (trimmed.length >= MIN_QUERY_LENGTH) {
      try {
        const remote = await searchProviders(trimmed, limit - output.length, signal);
        remote.forEach(push);
      } catch (providerError) {
        if (providerError?.name === 'AbortError') throw providerError;
        // Degradation silencieuse : les favoris et recents restent utilisables.
        error = providerError;
      }
    }

    return { suggestions: output.slice(0, limit), error };
  }

  function clearCache() {
    cache.clear();
  }

  return {
    search,
    searchFavorites,
    clearCache,
    /** Taille courante du cache memoire — utile au diagnostic. */
    get cachedQueryCount() {
      return cache.size;
    },
  };
}

/** Convertit un lieu favori en suggestion affichable. */
export function favoriteToSuggestion(place) {
  const addressLabel = formatAddressOneLine(place.address);
  return createSuggestion({
    id: `favorite:${place.id}`,
    source: 'favorite',
    label: place.name,
    secondary: addressLabel,
    // Le nom ET l'adresse sont ecrits dans le champ. Le nom seul rendrait
    // l'etat de frais illisible pour un tiers — « Maison » ne prouve rien ;
    // l'adresse seule ne dit pas a la saisie quel lieu on vient de choisir.
    fullLabel: [place.name, addressLabel].filter(Boolean).join(' — ') || place.name,
    name: place.name,
    postalCode: place.address?.postalCode || '',
    city: place.address?.city || '',
    country: place.address?.country || 'FR',
    latitude: place.latitude ?? place.address?.latitude ?? null,
    longitude: place.longitude ?? place.address?.longitude ?? null,
    provider: 'favorite',
    favoriteId: place.id,
  });
}

/**
 * Controleur de saisie : anti-rebond + annulation de la requete precedente.
 *
 * Isole du DOM pour rester testable : il ne fait qu'appeler des callbacks.
 *
 * @param {object} options
 * @param {{search: Function}} options.service
 * @param {(suggestions: Array, meta: object) => void} options.onResults
 * @param {(error: Error) => void} [options.onError]
 * @param {number} [options.debounceMs]
 * @param {number} [options.minChars]  longueur minimale AVANT toute recherche
 */
export function createSearchController({
  service,
  onResults,
  onError = () => {},
  debounceMs = DEFAULT_DEBOUNCE_MS,
  minChars = 1,
  limit = 6,
  // Les minuteries sont enveloppees dans des fonctions flechees : dans un
  // navigateur, setTimeout detache de `window` leve « Illegal invocation ».
  timerFactory = {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (id) => clearTimeout(id),
  },
}) {
  let timer = null;
  let controller = null;
  let lastQueryId = 0;

  function cancel() {
    if (timer !== null) {
      timerFactory.clear(timer);
      timer = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  function query(text) {
    // Toute nouvelle frappe annule la recherche precedente, en attente ou en vol.
    cancel();

    const trimmed = String(text || '').trim();
    if (trimmed.length < minChars) {
      onResults([], { query: trimmed, reason: 'trop-court' });
      return;
    }

    const queryId = ++lastQueryId;

    timer = timerFactory.set(async () => {
      timer = null;
      controller = new AbortController();
      const signal = controller.signal;

      try {
        const { suggestions, error } = await service.search(trimmed, { limit, signal });
        // Une reponse tardive d'une recherche perimee ne doit jamais s'afficher.
        if (queryId !== lastQueryId) return;
        onResults(suggestions, { query: trimmed, error });
        if (error) onError(error);
      } catch (error) {
        if (error?.name === 'AbortError' || queryId !== lastQueryId) return;
        onResults([], { query: trimmed, error });
        onError(error);
      } finally {
        if (queryId === lastQueryId) controller = null;
      }
    }, debounceMs);
  }

  return { query, cancel };
}
