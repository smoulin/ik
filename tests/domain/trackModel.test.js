/**
 * Trace supprimee : il n'en reste qu'une marque, sans aucune donnee de lieu.
 *
 * La marque ne sert qu'a propager la suppression a l'autre appareil lors d'une
 * fusion. Tout ce qui dirait ou l'on etait — trace, extremites, horaires,
 * distance, nom du fichier — doit avoir disparu.
 */

import { describe, it, expect } from 'vitest';
import { createTrack } from '../../src/domain/models.js';

const pleine = {
  id: 'track_1',
  source: 'native',
  fileName: 'session.gpx',
  startedAt: '2026-09-15T08:00:00.000Z',
  endedAt: '2026-09-15T08:20:00.000Z',
  distanceMeters: 5000,
  rawDistanceMeters: 5300,
  quality: { pointCount: 120, usedCount: 110 },
  start: { latitude: 45.1, longitude: 5.1, label: 'Maison', labelSource: 'favorite' },
  end: { latitude: 45.11, longitude: 5.1, label: 'Salle de sport', labelSource: 'address' },
  geometry: [
    [45.1, 5.1],
    [45.11, 5.1],
  ],
  status: 'pending',
  createdAt: '2026-09-15T08:30:00.000Z',
  updatedAt: '2026-09-15T08:30:00.000Z',
};

describe('createTrack — marque de suppression', () => {
  it('ne garde rien d’une trace supprimee, hormis de quoi propager la suppression', () => {
    const trace = createTrack({ ...pleine, deletedAt: '2026-09-16T10:00:00.000Z' });

    expect(trace.id).toBe('track_1');
    expect(trace.createdAt).toBe('2026-09-15T08:30:00.000Z');
    expect(trace.deletedAt).toBe('2026-09-16T10:00:00.000Z');

    expect(trace.start).toBeNull();
    expect(trace.end).toBeNull();
    expect(trace.geometry).toEqual([]);
    expect(trace.fileName).toBe('');
    expect(trace.source).toBe('');
    expect(trace.startedAt).toBe('');
    expect(trace.endedAt).toBe('');
    expect(trace.distanceMeters).toBe(0);
    expect(trace.rawDistanceMeters).toBe(0);
    expect(trace.quality).toBeNull();

    const texte = JSON.stringify(trace);
    expect(texte).not.toContain('Maison');
    expect(texte).not.toContain('45.1');
  });

  it('vide aussi une ancienne trace ignoree, et la marque comme supprimee', () => {
    const trace = createTrack({ ...pleine, status: 'ignored' });

    expect(trace.start).toBeNull();
    expect(trace.startedAt).toBe('');
    expect(trace.deletedAt).toBeTruthy();
  });

  it('laisse intactes une trace en attente et une trace convertie', () => {
    expect(createTrack(pleine).start.label).toBe('Maison');

    const convertie = createTrack({ ...pleine, status: 'converted', tripId: 'trip_1' });
    expect(convertie.startedAt).toBe('2026-09-15T08:00:00.000Z');
    expect(convertie.deletedAt).toBeNull();
  });
});
