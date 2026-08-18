/**
 * Montee de version du schema IndexedDB, de 1 vers 2.
 *
 * C'est le risque le plus concret de cette version : la base installee sur le
 * telephone est en version 1 et contient de vraies donnees. L'ajout du magasin
 * des traces GPS ne doit rien perdre.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../helpers/db.js';
import { DB_NAME, STORES, openDb, resetDbConnection } from '../../src/data/db.js';
import {
  companyRepository,
  tripRepository,
  trackRepository,
} from '../../src/data/repositories/index.js';

/** Recree exactement le schema de la version 1, avec quelques donnees. */
function createLegacyDatabaseV1() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(STORES.COMPANIES, { keyPath: 'id' });
      db.createObjectStore(STORES.VEHICLES, { keyPath: 'id' });
      const trips = db.createObjectStore(STORES.TRIPS, { keyPath: 'id' });
      trips.createIndex('byDate', 'date');
      trips.createIndex('byCompany', 'companyId');
      trips.createIndex('byVehicle', 'vehicleId');
      db.createObjectStore(STORES.FAVORITE_PLACES, { keyPath: 'id' });
      db.createObjectStore(STORES.BENEFICIARIES, { keyPath: 'id' });
      db.createObjectStore(STORES.RECENT_ADDRESSES, { keyPath: 'key' });
      db.createObjectStore(STORES.GEO_CACHE, { keyPath: 'key' });
      db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction([STORES.COMPANIES, STORES.TRIPS], 'readwrite');

      tx.objectStore(STORES.COMPANIES).put({
        id: 'company_a',
        name: 'SASU A',
        calculationMode: 'ik2026',
        calculationSettings: { fixedRate: 0 },
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        deletedAt: null,
      });
      tx.objectStore(STORES.TRIPS).put({
        id: 'trip_1',
        date: '2026-08-10',
        companyId: 'company_a',
        vehicleId: 'vehicle_1',
        from: 'Châtenay',
        to: 'Grenoble',
        km: 60.5,
        purpose: 'Client',
        roundTrip: false,
        createdAt: '2026-08-10T09:00:00.000Z',
        updatedAt: '2026-08-10T09:00:00.000Z',
        deletedAt: null,
      });

      tx.oncomplete = () => {
        db.close();
        resetDbConnection();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };

    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  await resetDatabase();
});

describe('migration du schéma 1 vers 2', () => {
  it('conserve intégralement les données existantes', async () => {
    await createLegacyDatabaseV1();

    // La première ouverture par l'application déclenche la montée de version.
    const companies = await companyRepository.list();
    const trips = await tripRepository.list();

    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe('SASU A');
    expect(trips).toHaveLength(1);
    expect(trips[0].km).toBeCloseTo(60.5, 6);
    expect(trips[0].from).toBe('Châtenay');
    // La date de création d'origine est préservée : le cumul annuel ne bouge pas.
    expect(trips[0].createdAt).toBe('2026-08-10T09:00:00.000Z');
  });

  it('ajoute le magasin des traces, vide et fonctionnel', async () => {
    await createLegacyDatabaseV1();

    expect(await trackRepository.list()).toEqual([]);

    const track = await trackRepository.save({
      source: 'gpx',
      fileName: 'test.gpx',
      startedAt: '2026-08-18T07:00:00.000Z',
      distanceMeters: 1000,
    });
    expect(track.id).toMatch(/^track_/);
    expect(await trackRepository.list()).toHaveLength(1);
  });

  it('porte bien la version 2 après ouverture', async () => {
    await createLegacyDatabaseV1();
    await companyRepository.list();

    const db = await openDb();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toContain(STORES.TRACKS);
  });

  it('crée directement une base en version 2 sur une installation neuve', async () => {
    const db = await openDb();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toContain(STORES.TRACKS);
    expect([...db.objectStoreNames]).toContain(STORES.TRIPS);
  });
});
