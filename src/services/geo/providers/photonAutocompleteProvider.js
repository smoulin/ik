/**
 * Fournisseur d'autocompletion de repli : Photon (Komoot), base sur OpenStreetMap.
 *
 * Role : couvrir l'etranger et prendre le relais si l'API Adresse est
 * indisponible. Gratuit, sans cle, autocompletion autorisee. Aucune garantie de
 * service en revanche — d'ou son statut de repli et non de fournisseur principal.
 *
 * Donnees OpenStreetMap sous licence ODbL : attribution requise, aucune
 * contrainte sur le code de l'application.
 */

import { createSuggestion, GeoProviderError } from '../types.js';
import { normalizeText } from '../../../shared/normalize.js';

const ENDPOINT = 'https://photon.komoot.io/api/';

export const PHOTON_ATTRIBUTION = 'Adresses (hors France) : Photon / OpenStreetMap — licence ODbL';

export function createPhotonAutocompleteProvider({ fetchImpl = globalThis.fetch } = {}) {
  return {
    id: 'photon',
    label: 'Photon (OpenStreetMap)',
    attribution: PHOTON_ATTRIBUTION,

    async suggest(query, { limit = 5, signal } = {}) {
      const url = new URL(ENDPOINT);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('lang', 'fr');

      let response;
      try {
        response = await fetchImpl(url.toString(), {
          signal,
          headers: { Accept: 'application/json' },
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new GeoProviderError('Service d’adresses de secours injoignable.', {
          provider: 'photon',
          cause: error,
        });
      }

      if (!response.ok) {
        throw new GeoProviderError('Service d’adresses de secours indisponible.', {
          provider: 'photon',
          kind: 'unavailable',
        });
      }

      const data = await response.json();
      return (data?.features || []).map(toSuggestion).filter(Boolean);
    },
  };
}

function toSuggestion(feature) {
  const properties = feature?.properties;
  if (!properties) return null;

  const [longitude, latitude] = feature.geometry?.coordinates || [];
  const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
  const city = properties.city || properties.county || '';
  const postalCode = properties.postcode || '';
  // Le pays n'est mentionne que s'il n'est pas la France : ce libelle part
  // desormais dans le champ puis dans le rapport, ou « France » n'apprend rien.
  const country = properties.countrycode === 'FR' ? '' : properties.country;
  const locality = [postalCode, city, country].filter(Boolean).join(' ');

  // Nom de l'etablissement — « Bricomarche ». C'est la raison d'etre de ce
  // fournisseur : l'annuaire d'adresses ne connait que des rues. Photon renvoie
  // aussi `name` pour une adresse ordinaire, ou il repete la rue : on ne le
  // retient que s'il apporte autre chose.
  const named = properties.name && normalizeText(properties.name) !== normalizeText(street);
  const name = named ? properties.name : '';

  const primary = name || street || properties.name || '';
  const secondary = name ? [street, locality].filter(Boolean).join(', ') : locality;

  if (!primary && !city) return null;

  return createSuggestion({
    id: `photon:${properties.osm_type || ''}${properties.osm_id || primary}`,
    source: 'provider',
    label: primary || city,
    secondary,
    // Le nom accompagne l'adresse jusque dans le champ, puis dans le rapport :
    // « Bricomarche » justifie le deplacement, l'adresse seule ne dit rien.
    // Meme forme que pour un lieu favori, pour n'avoir qu'une convention.
    ...(name ? { fullLabel: `${name} — ${secondary}` } : {}),
    name,
    postalCode,
    city,
    country: properties.countrycode || properties.country || '',
    latitude,
    longitude,
    provider: 'photon',
  });
}
