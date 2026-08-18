/**
 * Decodage de polyligne et calculs geographiques.
 *
 * La precision est le piege de ce format : OSRM encode en 5 decimales,
 * Valhalla en 6. Se tromper decale le trace d'un facteur 10 — d'ou des tests
 * explicites sur les deux.
 */

import { describe, it, expect } from 'vitest';
import { decodePolyline, haversineMeters, boundsOf } from '../../src/shared/polyline.js';

describe('decodePolyline', () => {
  it('decode l’exemple de reference de Google en precision 5', () => {
    // Exemple officiel : (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);

    expect(points).toHaveLength(3);
    expect(points[0][0]).toBeCloseTo(38.5, 5);
    expect(points[0][1]).toBeCloseTo(-120.2, 5);
    expect(points[2][0]).toBeCloseTo(43.252, 5);
    expect(points[2][1]).toBeCloseTo(-126.453, 5);
  });

  it('applique bien la precision demandee', () => {
    const encoded = '_p~iF~ps|U';
    const p5 = decodePolyline(encoded, 5)[0];
    const p6 = decodePolyline(encoded, 6)[0];

    // Meme chaine, precision differente : rapport de 10 exactement.
    expect(p5[0] / p6[0]).toBeCloseTo(10, 6);
  });

  it('gere les entrees vides ou invalides sans lever', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline(undefined)).toEqual([]);
    expect(decodePolyline(42)).toEqual([]);
  });

  it('s’arrete proprement sur une chaine tronquee', () => {
    // Latitude complete, longitude absente : le point incomplet est ignore.
    const points = decodePolyline('_p~iF', 5);
    expect(points).toEqual([]);
  });

  it('decode des deltas negatifs', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC', 5);
    expect(points[1][1]).toBeLessThan(points[0][1]);
  });
});

describe('haversineMeters', () => {
  it('renvoie 0 pour deux points identiques', () => {
    expect(haversineMeters([45.1885, 5.7245], [45.1885, 5.7245])).toBe(0);
  });

  it('mesure un degre de latitude a environ 111 km', () => {
    const d = haversineMeters([45, 5], [46, 5]);
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111500);
  });

  it('donne une distance a vol d’oiseau plausible Grenoble - Lyon', () => {
    // ~100 km par la route, ~85 km a vol d'oiseau.
    const d = haversineMeters([45.1885, 5.7245], [45.764, 4.8357]);
    expect(d / 1000).toBeGreaterThan(80);
    expect(d / 1000).toBeLessThan(95);
  });

  it('est symetrique', () => {
    const a = [45.1885, 5.7245];
    const b = [45.764, 4.8357];
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe('boundsOf', () => {
  it('encadre une liste de points', () => {
    expect(
      boundsOf([
        [45, 5],
        [46, 4],
        [44, 6],
      ]),
    ).toEqual({ south: 44, west: 4, north: 46, east: 6 });
  });

  it('renvoie null sans point', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf(null)).toBeNull();
  });
});
