/**
 * Import d'une trace GPS et rapprochement avec les lieux favoris.
 *
 * Le rapprochement est ce qui rend l'import reellement utile : un trajet qui
 * part de « Domicile » et arrive au « Bureau » se decrit tout seul.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../helpers/db.js';
import {
  createTrackImportService,
  findNearestPlace,
  describeEndpoint,
  trackToTripDraft,
  PLACE_MATCH_RADIUS_M,
} from '../../src/services/tracks/trackImportService.js';
import { trackRepository, favoritePlaceRepository } from '../../src/data/repositories/index.js';

/** Chatenay -> Grenoble, quelques points espaces de plusieurs kilometres. */
const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="GPSLogger"><trk><name>trajet</name><trkseg>
  <trkpt lat="45.316244" lon="5.229360"><time>2026-08-18T07:00:00Z</time><hdop>1.0</hdop></trkpt>
  <trkpt lat="45.280000" lon="5.400000"><time>2026-08-18T07:15:00Z</time><hdop>1.0</hdop></trkpt>
  <trkpt lat="45.200000" lon="5.650000"><time>2026-08-18T07:40:00Z</time><hdop>1.0</hdop></trkpt>
  <trkpt lat="45.159593" lon="5.736196"><time>2026-08-18T07:55:00Z</time><hdop>1.0</hdop></trkpt>
</trkseg></trk></gpx>`;

beforeEach(async () => {
  await resetDatabase();
});

describe('findNearestPlace', () => {
  const maison = { id: 'p1', name: 'Maison', latitude: 45.316244, longitude: 5.22936, address: {} };
  const bureau = { id: 'p2', name: 'Bureau', latitude: 45.159593, longitude: 5.736196, address: {} };

  it('retrouve un lieu situé à quelques dizaines de mètres', () => {
    // ~40 m au nord de la maison.
    const trouve = findNearestPlace([45.31660, 5.22936], [maison, bureau]);
    expect(trouve.place.id).toBe('p1');
    expect(trouve.distance).toBeLessThan(PLACE_MATCH_RADIUS_M);
  });

  it('ne retient rien au-delà du rayon', () => {
    // ~1 km : trop loin pour être le même lieu.
    expect(findNearestPlace([45.3252, 5.22936], [maison])).toBeNull();
  });

  it('choisit le plus proche quand deux lieux sont dans le rayon', () => {
    const voisin = { id: 'p3', name: 'Voisin', latitude: 45.31634, longitude: 5.22936, address: {} };
    const trouve = findNearestPlace([45.31630, 5.22936], [maison, voisin]);
    expect(trouve.place.id).toBe('p3');
  });

  it('ignore les lieux sans coordonnées', () => {
    const sansCoords = { id: 'p4', name: 'Inconnu', address: {} };
    expect(findNearestPlace([45.316244, 5.22936], [sansCoords])).toBeNull();
  });

  it('accepte les coordonnées portées par l’adresse', () => {
    const place = { id: 'p5', name: 'X', address: { latitude: 45.316244, longitude: 5.22936 } };
    expect(findNearestPlace([45.316244, 5.22936], [place]).place.id).toBe('p5');
  });
});

describe('describeEndpoint', () => {
  it('reprend l’adresse du lieu favori reconnu', () => {
    const place = {
      id: 'p1',
      name: 'Maison',
      latitude: 45.316244,
      longitude: 5.22936,
      address: { label: '358 Chemin de l’Étang, 38980 Châtenay' },
    };
    const point = describeEndpoint([45.316244, 5.22936], [place]);

    expect(point.placeId).toBe('p1');
    expect(point.label).toBe('358 Chemin de l’Étang, 38980 Châtenay');
  });

  it('laisse le libellé vide si aucun lieu ne correspond', () => {
    const point = describeEndpoint([45.9, 5.9], []);
    expect(point.placeId).toBeNull();
    expect(point.label).toBe('');
    expect(point.latitude).toBeCloseTo(45.9, 6);
  });
});

describe('importGpx', () => {
  const service = () => createTrackImportService({ trackRepository, favoritePlaceRepository });

  it('enregistre une trace mesurée', async () => {
    const track = await service().importGpx({ name: '20260818.gpx', text: GPX });

    expect(track.id).toMatch(/^track_/);
    expect(track.status).toBe('pending');
    expect(track.fileName).toBe('20260818.gpx');
    expect(track.distanceMeters).toBeGreaterThan(40000);
    expect(track.startedAt).toBe('2026-08-18T07:00:00.000Z');
    expect(track.endedAt).toBe('2026-08-18T07:55:00.000Z');
    expect(track.geometry.length).toBeGreaterThan(1);
  });

  it('nomme départ et arrivée d’après les lieux favoris', async () => {
    await favoritePlaceRepository.save({
      name: 'Maison',
      address: { label: '358 Chemin de l’Étang, 38980 Châtenay' },
      latitude: 45.316244,
      longitude: 5.22936,
    });
    await favoritePlaceRepository.save({
      name: 'Bureau',
      address: { label: '3 Rue des Pins, 38100 Grenoble' },
      latitude: 45.159593,
      longitude: 5.736196,
    });

    const track = await service().importGpx({ name: 'trajet.gpx', text: GPX });

    expect(track.start.label).toBe('358 Chemin de l’Étang, 38980 Châtenay');
    expect(track.end.label).toBe('3 Rue des Pins, 38100 Grenoble');
  });

  it('conserve les compteurs de qualité de la trace', async () => {
    const track = await service().importGpx({ name: 'q.gpx', text: GPX });
    expect(track.quality.pointCount).toBe(4);
    expect(track.quality.usedCount).toBe(4);
    expect(track.quality.durationSeconds).toBe(3300);
  });

  it('refuse une trace sans déplacement', async () => {
    const immobile = `<gpx><trk><trkseg>
      <trkpt lat="45.1" lon="5.7"><time>2026-08-18T07:00:00Z</time></trkpt>
      <trkpt lat="45.100001" lon="5.700001"><time>2026-08-18T07:00:10Z</time></trkpt>
    </trkseg></trk></gpx>`;
    await expect(service().importGpx({ name: 'x.gpx', text: immobile })).rejects.toThrow(
      /déplacement/i,
    );
  });

  it('refuse un fichier qui n’est pas un GPX', async () => {
    await expect(service().importGpx({ name: 'x.txt', text: 'bonjour' })).rejects.toThrow(/GPX/i);
  });

  it('repère une trace déjà importée', async () => {
    const s = service();
    const premiere = await s.importGpx({ name: 'a.gpx', text: GPX });
    const seconde = await s.importGpx({ name: 'b.gpx', text: GPX });

    expect(await s.isDuplicate(seconde)).toBe(true);
    expect(premiere.id).not.toBe(seconde.id);
  });
});

describe('trackToTripDraft', () => {
  it('prépare un trajet à partir de la trace, distance mesurée comprise', async () => {
    const track = await createTrackImportService({
      trackRepository,
      favoritePlaceRepository,
    }).importGpx({ name: 't.gpx', text: GPX });

    const draft = trackToTripDraft(track);

    expect(draft.date).toBe('2026-08-18');
    expect(draft.distanceSource).toBe('gps');
    expect(draft.km).toBeCloseTo(track.distanceMeters / 1000, 0);
    expect(draft.trackId).toBe(track.id);
    expect(draft.fromCoords.latitude).toBeCloseTo(45.316244, 5);
  });

  it('tolère une trace absente', () => {
    expect(trackToTripDraft(null)).toBeNull();
  });
});
