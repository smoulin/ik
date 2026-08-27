/**
 * Import d'une trace GPS et transformation en trajet.
 *
 * Le fichier GPX apporte la seule information qu'aucun calcul d'itineraire ne
 * peut fournir : la distance REELLEMENT parcourue, par la route effectivement
 * empruntee. C'est donc la source la plus fiable pour un etat de frais.
 *
 * Le service ne connait ni le DOM ni IndexedDB directement : il recoit ses
 * depots, ce qui le rend testable avec de simples doublures.
 */

import { parseGpx } from '../../domain/tracks/gpxParser.js';
import {
  computeTrackDistance,
  simplifyGeometry,
  toKilometers,
} from '../../domain/tracks/trackDistance.js';
import { haversineMeters } from '../../shared/polyline.js';
import { formatAddressOneLine } from '../../domain/models.js';

/**
 * Rayon en deca duquel une extremite de trace est consideree comme etant a un
 * lieu favori. 200 m couvre le stationnement autour d'une adresse sans risquer
 * de confondre deux lieux distincts.
 */
export const PLACE_MATCH_RADIUS_M = 200;

export function createTrackImportService({
  trackRepository,
  favoritePlaceRepository,
  geocodingService = null,
}) {
  /**
   * Analyse un fichier GPX et enregistre la trace correspondante.
   *
   * @param {{name: string, text: string}} file
   * @returns {Promise<object>} la trace enregistree
   */
  async function importGpx({ name = '', text }) {
    const { points } = parseGpx(text);
    const measured = computeTrackDistance(points);

    if (measured.usedCount < 2 || measured.distanceMeters <= 0) {
      throw new Error('Cette trace ne contient pas de déplacement exploitable.');
    }

    const places = favoritePlaceRepository ? await favoritePlaceRepository.list() : [];
    const geometry = simplifyGeometry(measured.geometry);

    const first = measured.geometry[0];
    const last = measured.geometry[measured.geometry.length - 1];

    return trackRepository.save({
      source: 'gpx',
      fileName: name,
      startedAt: measured.startedAt ? measured.startedAt.toISOString() : '',
      endedAt: measured.endedAt ? measured.endedAt.toISOString() : '',
      distanceMeters: measured.distanceMeters,
      rawDistanceMeters: measured.rawDistanceMeters,
      quality: {
        pointCount: measured.pointCount,
        usedCount: measured.usedCount,
        droppedForAccuracy: measured.droppedForAccuracy,
        droppedForNoise: measured.droppedForNoise,
        droppedForSpeed: measured.droppedForSpeed,
        durationSeconds: measured.durationSeconds,
      },
      start: describeEndpoint(first, places),
      end: describeEndpoint(last, places),
      geometry,
      status: 'pending',
    });
  }

  /** Refuse une trace deja importee : meme debut, meme fin, meme instant. */
  async function isDuplicate(track) {
    const existing = await trackRepository.list();
    return existing.some(
      (other) =>
        other.id !== track.id &&
        other.startedAt === track.startedAt &&
        Math.round(other.distanceMeters) === Math.round(track.distanceMeters),
    );
  }

  /**
   * Donne une adresse aux extremites qu'aucun lieu favori n'a nommees.
   *
   * Etape volontairement separee de l'import : `importGpx` ne fait aucune
   * requete, et une trace enregistree sans reseau arrive quand meme dans la
   * liste. Le nommage est au mieux-effort — il ne doit jamais faire perdre un
   * trajet, seulement l'enrichir quand c'est possible.
   *
   * @param {object[]} tracks
   * @returns {Promise<number>} nombre de traces effectivement renommees
   */
  async function nameEndpoints(tracks = []) {
    if (!geocodingService?.describe) return 0;

    let named = 0;

    for (const track of tracks) {
      const start = await describeEndpointAddress(track.start);
      const end = await describeEndpointAddress(track.end);
      if (!start.changed && !end.changed) continue;

      await trackRepository.save({ ...track, start: start.endpoint, end: end.endpoint });
      // La trace en memoire suit l'enregistrement : l'appelant affiche souvent
      // la liste qu'il vient de passer, sans la relire.
      track.start = start.endpoint;
      track.end = end.endpoint;
      named += 1;
    }

    return named;
  }

  /**
   * Un seul point. Une extremite deja nommee, ou dont le nommage a deja echoue,
   * n'est pas redemandee : c'est ce que retient `labelSource: 'none'`.
   */
  async function describeEndpointAddress(endpoint) {
    if (!endpoint || endpoint.label || endpoint.labelSource) {
      return { endpoint, changed: false };
    }

    try {
      const found = await geocodingService.describe({
        latitude: endpoint.latitude,
        longitude: endpoint.longitude,
      });
      if (!found?.label) throw new Error('sans libellé');
      return {
        endpoint: { ...endpoint, label: found.label, labelSource: 'address' },
        changed: true,
      };
    } catch {
      return { endpoint: { ...endpoint, labelSource: 'none' }, changed: true };
    }
  }

  return { importGpx, isDuplicate, nameEndpoints };
}

/**
 * Nomme une extremite de trace a partir des lieux favoris connus.
 * Un depart pres de « Domicile » et une arrivee pres de « Bureau » suffisent
 * alors a decrire le trajet sans aucune saisie.
 */
export function describeEndpoint(coordinates, places = [], radius = PLACE_MATCH_RADIUS_M) {
  if (!coordinates) return null;
  const [latitude, longitude] = coordinates;

  const nearest = findNearestPlace([latitude, longitude], places, radius);

  return {
    latitude,
    longitude,
    label: nearest ? placeLabel(nearest.place) : '',
    placeId: nearest ? nearest.place.id : null,
    labelSource: nearest ? 'favorite' : '',
  };
}

/** Lieu favori le plus proche dans le rayon, ou null. */
export function findNearestPlace(coordinates, places = [], radius = PLACE_MATCH_RADIUS_M) {
  let best = null;

  for (const place of places) {
    const latitude = place.latitude ?? place.address?.latitude;
    const longitude = place.longitude ?? place.address?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const distance = haversineMeters(coordinates, [latitude, longitude]);
    if (distance > radius) continue;
    if (!best || distance < best.distance) best = { place, distance };
  }

  return best;
}

/**
 * Un favori porte un nom choisi par l'utilisateur — « Domicile », « Bureau ».
 * C'est lui qu'on affiche : il dit ce que l'adresse ne dit pas. L'adresse ne
 * sert que de repli, pour un favori enregistre sans nom.
 */
function placeLabel(place) {
  return place.name || formatAddressOneLine(place.address) || '';
}

/**
 * Traduit une trace en valeurs pretes pour le formulaire de trajet.
 * La distance provient de la mesure, jamais d'une estimation.
 */
export function trackToTripDraft(track) {
  if (!track) return null;
  return {
    date: (track.startedAt || '').slice(0, 10),
    from: track.start?.label || '',
    to: track.end?.label || '',
    fromCoords: track.start
      ? { latitude: track.start.latitude, longitude: track.start.longitude }
      : null,
    toCoords: track.end ? { latitude: track.end.latitude, longitude: track.end.longitude } : null,
    km: toKilometers(track.distanceMeters),
    distanceSource: 'gps',
    trackId: track.id,
  };
}
