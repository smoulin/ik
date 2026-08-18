/**
 * Lecture d'une trace GPX et calcul de la distance reellement parcourue.
 *
 * L'enjeu principal est le filtrage : une somme naive des distances entre
 * points surestime toujours le parcours, a cause de la derive du recepteur a
 * l'arret et des sauts de position occasionnels.
 */

import { describe, it, expect } from 'vitest';
import { parseGpx } from '../../src/domain/tracks/gpxParser.js';
import {
  computeTrackDistance,
  toKilometers,
  simplifyGeometry,
  DEFAULT_FILTERS,
} from '../../src/domain/tracks/trackDistance.js';

/** Trace au format produit par GPSLogger. */
const GPX_REEL = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPSLogger 137 - http://gpslogger.app"
     xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>20260818</name><trkseg>
    <trkpt lat="45.316244" lon="5.229360"><ele>320.0</ele><time>2026-08-18T07:00:00Z</time><hdop>1.2</hdop></trkpt>
    <trkpt lat="45.320000" lon="5.240000"><ele>318.0</ele><time>2026-08-18T07:01:00Z</time><hdop>1.1</hdop></trkpt>
    <trkpt lat="45.330000" lon="5.260000"><ele>310.0</ele><time>2026-08-18T07:03:00Z</time><hdop>1.0</hdop></trkpt>
  </trkseg></trk>
</gpx>`;

/** Une seule position, repetee : vehicule a l'arret, moteur tournant. */
const GPX_ARRET = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
  <trkpt lat="45.316244" lon="5.229360"><time>2026-08-18T07:00:00Z</time></trkpt>
  <trkpt lat="45.316250" lon="5.229366"><time>2026-08-18T07:00:10Z</time></trkpt>
  <trkpt lat="45.316240" lon="5.229352"><time>2026-08-18T07:00:20Z</time></trkpt>
  <trkpt lat="45.316252" lon="5.229371"><time>2026-08-18T07:00:30Z</time></trkpt>
</trkseg></trk></gpx>`;

describe('parseGpx', () => {
  it('lit les points et le nom de la trace', () => {
    const track = parseGpx(GPX_REEL);
    expect(track.name).toBe('20260818');
    expect(track.points).toHaveLength(3);
  });

  it('lit coordonnées, altitude et horodatage', () => {
    const [premier] = parseGpx(GPX_REEL).points;
    expect(premier.latitude).toBeCloseTo(45.316244, 6);
    expect(premier.longitude).toBeCloseTo(5.22936, 6);
    expect(premier.elevation).toBe(320);
    expect(premier.time.toISOString()).toBe('2026-08-18T07:00:00.000Z');
  });

  it('convertit le hdop en précision approximative', () => {
    // hdop 1,2 -> environ 6 m, exploitable par le filtre de précision.
    expect(parseGpx(GPX_REEL).points[0].accuracy).toBeCloseTo(6, 6);
  });

  it('accepte les guillemets simples et les balises auto-fermantes', () => {
    const gpx = `<gpx version='1.1'><trk><trkseg>
      <trkpt lat='45.1' lon='5.7'/>
      <trkpt lat='45.2' lon='5.8'/>
    </trkseg></trk></gpx>`;
    expect(parseGpx(gpx).points).toHaveLength(2);
  });

  it('ignore un point aux coordonnées absentes ou aberrantes', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="45.1" lon="5.7"></trkpt>
      <trkpt lon="5.8"></trkpt>
      <trkpt lat="200" lon="5.9"></trkpt>
      <trkpt lat="45.2" lon="5.8"></trkpt>
    </trkseg></trk></gpx>`;
    expect(parseGpx(gpx).points).toHaveLength(2);
  });

  it('refuse un fichier vide, non GPX, ou sans aucun point', () => {
    expect(() => parseGpx('')).toThrow(/vide/i);
    expect(() => parseGpx('bonjour')).toThrow(/GPX/i);
    expect(() => parseGpx('<gpx><trk></trk></gpx>')).toThrow(/aucun point/i);
  });
});

describe('computeTrackDistance', () => {
  it('additionne les déplacements réels', () => {
    const { points } = parseGpx(GPX_REEL);
    const result = computeTrackDistance(points);

    expect(result.usedCount).toBe(3);
    expect(result.distanceMeters).toBeGreaterThan(2500);
    expect(result.distanceMeters).toBeLessThan(4000);
  });

  it('n’ajoute rien pour un véhicule à l’arrêt', () => {
    // C'est le cas qui gonfle une distance sans filtrage.
    const { points } = parseGpx(GPX_ARRET);
    const result = computeTrackDistance(points);

    expect(result.distanceMeters).toBe(0);
    expect(result.droppedForNoise).toBe(3);
    // La somme brute, elle, est bien positive : c'est la dérive mesurée.
    expect(result.rawDistanceMeters).toBeGreaterThan(0);
  });

  it('écarte un saut de position impossible', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="45.10" lon="5.70"><time>2026-08-18T07:00:00Z</time></trkpt>
      <trkpt lat="46.50" lon="6.60"><time>2026-08-18T07:00:05Z</time></trkpt>
      <trkpt lat="45.11" lon="5.71"><time>2026-08-18T07:01:00Z</time></trkpt>
    </trkseg></trk></gpx>`;
    const result = computeTrackDistance(parseGpx(gpx).points);

    expect(result.droppedForSpeed).toBe(1);
    // Sans ce filtre, le saut ajouterait plus de 150 km.
    expect(result.distanceMeters / 1000).toBeLessThan(5);
  });

  it('écarte les positions trop imprécises', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="45.10" lon="5.70"><hdop>1.0</hdop></trkpt>
      <trkpt lat="45.20" lon="5.80"><hdop>40.0</hdop></trkpt>
      <trkpt lat="45.30" lon="5.90"><hdop>1.0</hdop></trkpt>
    </trkseg></trk></gpx>`;
    const result = computeTrackDistance(parseGpx(gpx).points);

    expect(result.droppedForAccuracy).toBe(1);
    expect(result.usedCount).toBe(2);
  });

  it('conserve les points sans indication de précision', () => {
    const result = computeTrackDistance(parseGpx(GPX_ARRET).points);
    expect(result.droppedForAccuracy).toBe(0);
  });

  it('renseigne début, fin et durée', () => {
    const result = computeTrackDistance(parseGpx(GPX_REEL).points);
    expect(result.startedAt.toISOString()).toBe('2026-08-18T07:00:00.000Z');
    expect(result.endedAt.toISOString()).toBe('2026-08-18T07:03:00.000Z');
    expect(result.durationSeconds).toBe(180);
  });

  it('produit une géométrie utilisable pour la carte', () => {
    const result = computeTrackDistance(parseGpx(GPX_REEL).points);
    expect(result.geometry).toHaveLength(3);
    expect(result.geometry[0]).toEqual([45.316244, 5.22936]);
  });

  it('gère une trace vide ou d’un seul point', () => {
    expect(computeTrackDistance([]).distanceMeters).toBe(0);
    const un = computeTrackDistance([{ latitude: 45, longitude: 5, accuracy: null, time: null }]);
    expect(un.distanceMeters).toBe(0);
    expect(un.usedCount).toBe(1);
  });

  it('accepte des seuils personnalisés', () => {
    const { points } = parseGpx(GPX_ARRET);
    // Avec un seuil de bruit nul, la dérive est comptabilisée.
    const sansFiltre = computeTrackDistance(points, { minStepMeters: 0 });
    expect(sansFiltre.distanceMeters).toBeGreaterThan(0);
    expect(DEFAULT_FILTERS.minStepMeters).toBe(10);
  });
});

describe('utilitaires', () => {
  it('convertit en kilomètres au dixième', () => {
    expect(toKilometers(60500)).toBe(60.5);
    expect(toKilometers(10490)).toBe(10.5);
    expect(toKilometers(1049)).toBe(1);
    expect(toKilometers(0)).toBe(0);
  });

  it('réduit une trace trop longue en gardant les extrémités', () => {
    const points = Array.from({ length: 1000 }, (_, i) => [45 + i / 10000, 5]);
    const simplifiee = simplifyGeometry(points, 100);

    expect(simplifiee.length).toBeLessThanOrEqual(101);
    expect(simplifiee[0]).toEqual(points[0]);
    expect(simplifiee[simplifiee.length - 1]).toEqual(points[points.length - 1]);
  });

  it('laisse intacte une trace déjà courte', () => {
    const points = [
      [45, 5],
      [46, 6],
    ];
    expect(simplifyGeometry(points, 300)).toEqual(points);
  });
});
