/**
 * Resolution « adresse -> coordonnees ».
 *
 * Trois niveaux, du moins couteux au plus couteux :
 *   1. coordonnees deja connues (favori choisi, suggestion selectionnee) — gratuit ;
 *   2. cache local persistant (§34) ;
 *   3. fournisseur en ligne, en respectant son delai minimal entre deux appels.
 *
 * En pratique, une adresse choisie dans l'autocompletion arrive deja avec ses
 * coordonnees : le calcul d'un trajet ne declenche alors aucune requete de
 * geocodage, contrairement a la version 0.1.1.
 */

import { GeoProviderError } from './types.js';

export function createGeocodingService({ providers = [], cacheRepository = null } = {}) {
  /** Derniere date d'appel par fournisseur, pour respecter `minDelayMs`. */
  const lastCallAt = new Map();

  async function respectRateLimit(provider) {
    const delay = provider.minDelayMs || 0;
    if (!delay) return;
    const last = lastCallAt.get(provider.id) || 0;
    const wait = delay - (Date.now() - last);
    if (wait > 0) await sleep(wait);
  }

  /**
   * @param {string} address
   * @param {{signal?: AbortSignal, coords?: {latitude: number, longitude: number}|null}} options
   */
  async function resolve(address, { signal, coords = null } = {}) {
    // 1. Coordonnees deja connues.
    if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
      return { ...coords, label: address, provider: 'connu', source: 'coords' };
    }

    const query = String(address || '').trim();
    if (!query) {
      throw new GeoProviderError('Adresse vide.', { kind: 'not-found' });
    }

    // 2. Cache persistant.
    if (cacheRepository) {
      const cached = await cacheRepository.get(query);
      if (cached) {
        return {
          latitude: cached.latitude,
          longitude: cached.longitude,
          label: cached.label || query,
          provider: cached.provider,
          source: 'cache',
        };
      }
    }

    // 3. Fournisseurs, en cascade.
    let lastError = null;
    for (const provider of providers) {
      try {
        await respectRateLimit(provider);
        lastCallAt.set(provider.id, Date.now());
        const result = await provider.geocode(query, { signal });
        if (cacheRepository) {
          await cacheRepository.set(query, {
            latitude: result.latitude,
            longitude: result.longitude,
            label: result.label,
            provider: result.provider,
          });
        }
        return { ...result, source: 'provider' };
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        lastError = error;
      }
    }

    throw (
      lastError ||
      new GeoProviderError(`Adresse introuvable : ${query}`, { kind: 'not-found' })
    );
  }

  /**
   * Sens inverse : « coordonnees -> adresse ».
   *
   * Une trace GPS n'arrive qu'avec des points ; sans ce service, ses extremites
   * resteraient anonymes. Les fournisseurs qui n'exposent pas `reverse` sont
   * simplement sautes : la methode est optionnelle au contrat.
   *
   * @param {{latitude: number, longitude: number}} point
   * @param {{signal?: AbortSignal}} options
   * @returns {Promise<GeocodingResult & {source: string}>}
   */
  async function describe({ latitude, longitude } = {}, { signal } = {}) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new GeoProviderError('Coordonnées invalides.', { kind: 'not-found' });
    }

    const key = reverseCacheKey(latitude, longitude);

    // 1. Cache persistant — meme magasin que le sens direct : une entree y
    // associe deja des coordonnees a un libelle, c'est exactement ce qu'il
    // faut ici, dans l'autre sens de lecture.
    if (cacheRepository) {
      const cached = await cacheRepository.get(key);
      if (cached?.label) {
        return {
          latitude: cached.latitude,
          longitude: cached.longitude,
          label: cached.label,
          provider: cached.provider,
          source: 'cache',
        };
      }
    }

    // 2. Fournisseurs, en cascade, en sautant ceux qui ne savent pas faire.
    let lastError = null;
    for (const provider of providers) {
      if (typeof provider.reverse !== 'function') continue;
      try {
        await respectRateLimit(provider);
        lastCallAt.set(provider.id, Date.now());
        const result = await provider.reverse(latitude, longitude, { signal });
        if (!result?.label) {
          throw new GeoProviderError('Aucune adresse connue à cet endroit.', {
            provider: provider.id,
            kind: 'not-found',
          });
        }
        if (cacheRepository) {
          await cacheRepository.set(key, {
            latitude: result.latitude,
            longitude: result.longitude,
            label: result.label,
            provider: result.provider,
          });
        }
        return { ...result, source: 'provider' };
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        lastError = error;
      }
    }

    throw (
      lastError ||
      new GeoProviderError('Aucune adresse connue à cet endroit.', { kind: 'not-found' })
    );
  }

  return { resolve, describe };
}

/**
 * Cle de cache d'un point.
 *
 * Arrondi a quatre decimales, soit une grille d'environ 11 m : deux passages au
 * meme endroit tombent le plus souvent dans la meme case, ce qui est tout
 * l'interet du cache. Au metre pres, chaque releve serait unique et le cache ne
 * servirait a rien.
 *
 * « Le plus souvent » et non « toujours » : deux points voisins de part et
 * d'autre d'une frontiere de case ont des cles differentes. Le cout est une
 * requete de plus, jamais une adresse fausse — le cache est une economie, pas
 * une regle de correction.
 *
 * Le signe est ecrit en lettres (`n`/`s`, `e`/`w`) parce que la normalisation
 * des cles supprime la ponctuation : « -0,1204 » et « 0,1204 » se
 * confondraient, et deux points separes de plusieurs centaines de kilometres
 * partageraient la meme adresse.
 */
export function reverseCacheKey(latitude, longitude) {
  const lat = `${latitude < 0 ? 's' : 'n'}${Math.abs(latitude).toFixed(4)}`;
  const lon = `${longitude < 0 ? 'w' : 'e'}${Math.abs(longitude).toFixed(4)}`;
  return `reverse ${lat} ${lon}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
