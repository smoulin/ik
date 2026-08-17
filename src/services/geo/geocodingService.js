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

  return { resolve };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
