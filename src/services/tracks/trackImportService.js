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

export function createTrackImportService({ trackRepository, favoritePlaceRepository }) {
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

  return { importGpx, isDuplicate };
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

function placeLabel(place) {
  const address = formatAddressOneLine(place.address);
  return address || place.name || '';
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
