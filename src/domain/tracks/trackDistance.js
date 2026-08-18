/**
 * Distance reellement parcourue d'apres une trace GPS.
 *
 * Additionner naivement les distances entre points consecutifs SURESTIME
 * toujours le parcours : un recepteur immobile continue de deriver de quelques
 * metres, et un saut de position isole ajoute des kilometres fictifs. Sur un
 * trajet d'une heure, l'ecart atteint couramment plusieurs pourcents.
 *
 * Trois filtres, chacun reglable et teste separement :
 *  - precision annoncee insuffisante -> point ecarte ;
 *  - deplacement inferieur au seuil de bruit -> ignore (vehicule a l'arret) ;
 *  - vitesse implicite aberrante -> saut GPS, point ecarte.
 *
 * Fonctions pures, sans dependance au DOM ni au reseau.
 */

import { haversineMeters } from '../../shared/polyline.js';

export const DEFAULT_FILTERS = {
  /** Au-dela, la position est trop incertaine pour etre exploitee (metres). */
  maxAccuracyMeters: 25,
  /** En deca, on considere que le vehicule n'a pas bouge (metres). */
  minStepMeters: 10,
  /** Au-dela, il s'agit d'un saut de position, pas d'un deplacement (km/h). */
  maxSpeedKmh: 200,
};

/**
 * @param {Array} points  points issus de parseGpx
 * @param {object} [filters]
 * @returns {{
 *   distanceMeters: number, rawDistanceMeters: number,
 *   pointCount: number, usedCount: number,
 *   droppedForAccuracy: number, droppedForNoise: number, droppedForSpeed: number,
 *   startedAt: Date|null, endedAt: Date|null, durationSeconds: number|null,
 *   geometry: Array<[number, number]>
 * }}
 */
export function computeTrackDistance(points, filters = {}) {
  const { maxAccuracyMeters, minStepMeters, maxSpeedKmh } = { ...DEFAULT_FILTERS, ...filters };
  const all = Array.isArray(points) ? points : [];

  const result = {
    distanceMeters: 0,
    rawDistanceMeters: 0,
    pointCount: all.length,
    usedCount: 0,
    droppedForAccuracy: 0,
    droppedForNoise: 0,
    droppedForSpeed: 0,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    geometry: [],
  };

  if (!all.length) return result;

  // 1. Ecarter les positions trop imprecises. `accuracy` absente = on garde :
  // beaucoup d'enregistreurs ne la renseignent pas.
  const usable = all.filter((point) => {
    const tooVague = point.accuracy !== null && point.accuracy > maxAccuracyMeters;
    if (tooVague) result.droppedForAccuracy += 1;
    return !tooVague;
  });

  if (!usable.length) return result;

  let previous = usable[0];
  result.geometry.push([previous.latitude, previous.longitude]);
  result.usedCount = 1;

  for (let i = 1; i < usable.length; i += 1) {
    const current = usable[i];
    const step = haversineMeters(
      [previous.latitude, previous.longitude],
      [current.latitude, current.longitude],
    );

    result.rawDistanceMeters += step;

    // 2. Derive a l'arret : le point existe, mais le vehicule n'a pas bouge.
    if (step < minStepMeters) {
      result.droppedForNoise += 1;
      continue;
    }

    // 3. Saut de position : vitesse impossible entre deux points horodates.
    const seconds = elapsedSeconds(previous, current);
    if (seconds !== null && seconds > 0) {
      const kmh = (step / seconds) * 3.6;
      if (kmh > maxSpeedKmh) {
        result.droppedForSpeed += 1;
        continue;
      }
    }

    result.distanceMeters += step;
    result.geometry.push([current.latitude, current.longitude]);
    result.usedCount += 1;
    previous = current;
  }

  const times = usable.map((p) => p.time).filter(Boolean);
  if (times.length) {
    result.startedAt = times[0];
    result.endedAt = times[times.length - 1];
    result.durationSeconds = Math.max(
      0,
      Math.round((result.endedAt.getTime() - result.startedAt.getTime()) / 1000),
    );
  }

  return result;
}

function elapsedSeconds(a, b) {
  if (!a.time || !b.time) return null;
  return (b.time.getTime() - a.time.getTime()) / 1000;
}

/** Distance en kilometres, arrondie au dixieme comme le reste de l'application. */
export function toKilometers(meters) {
  return Math.round((Number(meters) || 0) / 100) / 10;
}

/**
 * Reduit une trace a un nombre de points raisonnable pour l'affichage.
 * Conserve toujours le premier et le dernier point.
 */
export function simplifyGeometry(geometry, maxPoints = 300) {
  const points = Array.isArray(geometry) ? geometry : [];
  if (points.length <= maxPoints) return points;

  const step = Math.ceil(points.length / maxPoints);
  const kept = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}
