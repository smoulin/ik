/**
 * Contrats des fournisseurs geographiques.
 *
 * RIEN dans le metier ni dans l'interface ne doit dependre d'un fournisseur
 * particulier (cf. §33 et §37). Remplacer l'API Adresse par un serveur Agilmea
 * ou par un fournisseur commercial doit se limiter a ecrire un nouveau module
 * respectant ces contrats, sans toucher au reste de l'application.
 *
 * Ce fichier ne contient que des types et des fabriques : aucune implementation.
 */

import { completeSuggestionLocality } from '../../shared/address.js';

/**
 * Suggestion d'adresse normalisee, quelle que soit sa provenance.
 *
 * @typedef {object} AddressSuggestion
 * @property {string} id            identifiant stable dans la liste de resultats
 * @property {'favorite'|'recent'|'provider'} source
 * @property {string} label         ligne principale affichee (ex. « 12 rue Jean Jaures »)
 * @property {string} secondary     ligne secondaire (ex. « 38000 Grenoble »)
 * @property {string} fullLabel     adresse complete, valeur ecrite dans le champ
 * @property {string} name          nom du lieu quand il y en a un (favori)
 * @property {string} postalCode
 * @property {string} city
 * @property {string} country
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {string} provider      identifiant technique de l'origine
 * @property {string} [favoriteId]  present uniquement pour un lieu favori
 */

/**
 * @typedef {object} AutocompleteProvider
 * @property {string} id
 * @property {string} label
 * @property {string} attribution              mention legale a afficher
 * @property {(query: string, options?: {limit?: number, signal?: AbortSignal}) => Promise<AddressSuggestion[]>} suggest
 */

/**
 * @typedef {object} GeocodingResult
 * @property {number} latitude
 * @property {number} longitude
 * @property {string} label
 * @property {string} provider
 * @property {number} [distanceMeters]  ecart entre le point demande et l'adresse
 *   trouvee — renseigne par le geocodage inverse uniquement
 */

/**
 * @typedef {object} GeocodingProvider
 * @property {string} id
 * @property {string} label
 * @property {string} attribution
 * @property {(address: string, options?: {signal?: AbortSignal}) => Promise<GeocodingResult>} geocode
 * @property {((latitude: number, longitude: number, options?: {signal?: AbortSignal}) => Promise<GeocodingResult>)} [reverse]
 *   Sens inverse : « coordonnees -> adresse ». OPTIONNEL — un fournisseur qui
 *   ne sait pas le faire reste conforme au contrat, et la cascade le saute.
 *   Sert a nommer les extremites d'une trace GPS, qui n'arrivent qu'avec des
 *   coordonnees.
 * @property {number} [minDelayMs]  delai minimal impose entre deux appels
 */

/**
 * Resultat d'itineraire — forme imposee par le cahier des charges (§33).
 *
 * @typedef {object} RouteResult
 * @property {number} distanceMeters
 * @property {number} durationSeconds
 * @property {any} geometry          null si le fournisseur n'en renvoie pas
 * @property {string} provider
 */

/**
 * @typedef {object} RoutingProvider
 * @property {string} id
 * @property {string} label
 * @property {string} attribution
 * @property {(from: {latitude: number, longitude: number}, to: {latitude: number, longitude: number}, options?: {signal?: AbortSignal}) => Promise<RouteResult>} route
 */

/**
 * Fabrique une suggestion complete a partir d'un objet partiel.
 *
 * Le code postal et la ville sont deduits du libelle quand la source ne les
 * fournit pas — cas des adresses recentes et des favoris incomplets. Sans
 * cela, choisir une adresse deja connue laissait ces champs vides dans les
 * formulaires beneficiaire, structure et lieu favori.
 */
export function createSuggestion(input) {
  const raw = buildSuggestion(input);
  return completeSuggestionLocality(raw);
}

function buildSuggestion(input) {
  const label = String(input.label || '').trim();
  const secondary = String(input.secondary || '').trim();
  return {
    id: String(input.id || `${input.provider || 'x'}:${label}:${secondary}`),
    source: input.source || 'provider',
    label,
    secondary,
    fullLabel: String(input.fullLabel || [label, secondary].filter(Boolean).join(', ')).trim(),
    name: String(input.name || '').trim(),
    postalCode: String(input.postalCode || '').trim(),
    city: String(input.city || '').trim(),
    country: String(input.country || 'FR').trim(),
    latitude: toNumberOrNull(input.latitude),
    longitude: toNumberOrNull(input.longitude),
    provider: String(input.provider || ''),
    ...(input.favoriteId ? { favoriteId: input.favoriteId } : {}),
  };
}

/** Convertit une suggestion en adresse du modele de donnees. */
export function suggestionToAddress(suggestion) {
  if (!suggestion) return null;
  return {
    label: suggestion.fullLabel || suggestion.label,
    line1: suggestion.label,
    line2: '',
    postalCode: suggestion.postalCode,
    city: suggestion.city,
    country: suggestion.country || 'FR',
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
  };
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Erreur metier des fournisseurs : permet a l'interface de distinguer les cas. */
export class GeoProviderError extends Error {
  constructor(message, { provider = '', cause = null, kind = 'network' } = {}) {
    super(message);
    this.name = 'GeoProviderError';
    this.provider = provider;
    this.kind = kind; // 'network' | 'not-found' | 'unavailable' | 'aborted'
    this.cause = cause;
  }
}
