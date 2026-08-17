/**
 * Migration des donnees v0.1.1 (localStorage) vers IndexedDB.
 *
 * C'est le test le plus important de cette version : il protege les donnees
 * reelles deja saisies sur le telephone.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase, createFakeStorage } from '../helpers/db.js';
import {
  migrateFromLocalStorage,
  migrateLegacyState,
  isLegacyState,
  LEGACY_STATE_KEY,
  LEGACY_GEO_CACHE_KEY,
} from '../../src/data/migrations.js';
import {
  companyRepository,
  vehicleRepository,
  tripRepository,
} from '../../src/data/repositories/index.js';
import { geoCacheRepository } from '../../src/data/repositories/geoCacheRepository.js';

const LEGACY_STATE = {
  version: '0.1.1',
  companies: [
    { id: 'company_a', name: 'SASU A', scheme: 'ik2026', fixedRate: 0 },
    { id: 'company_b', name: 'EI LMP', scheme: 'fixed', fixedRate: 0.139 },
  ],
  vehicles: [{ id: 'vehicle_1', name: 'GLC', cv: 5, electric: false, fuel: 'diesel' }],
  trips: [
    {
      id: 'trip_1',
      date: '2026-08-01',
      companyId: 'company_a',
      vehicleId: 'vehicle_1',
      from: 'Grenoble',
      to: 'Lyon',
      km: 110.4,
      purpose: 'Client X',
      roundTrip: true,
      createdAt: '2026-08-01T09:00:00.000Z',
    },
  ],
};

beforeEach(async () => {
  await resetDatabase();
});

describe('detection du format v0.1.1', () => {
  it('reconnait un etat v0.1.1', () => {
    expect(isLegacyState(LEGACY_STATE)).toBe(true);
    expect(isLegacyState({ companies: [] })).toBe(false);
    expect(isLegacyState(null)).toBe(false);
  });
});

describe('conversion du modele', () => {
  it('transpose scheme et fixedRate vers le nouveau modele', () => {
    const { companies } = migrateLegacyState(LEGACY_STATE);
    expect(companies[0].calculationMode).toBe('ik2026');
    expect(companies[1].calculationMode).toBe('fixed');
    expect(companies[1].calculationSettings.fixedRate).toBeCloseTo(0.139, 6);
  });

  it('conserve les identifiants d’origine', () => {
    const { companies, vehicles, trips } = migrateLegacyState(LEGACY_STATE);
    expect(companies.map((c) => c.id)).toEqual(['company_a', 'company_b']);
    expect(vehicles[0].id).toBe('vehicle_1');
    expect(trips[0].id).toBe('trip_1');
  });
});

describe('migrateFromLocalStorage', () => {
  it('reprend les donnees v0.1.1 dans IndexedDB', async () => {
    const storage = createFakeStorage({
      [LEGACY_STATE_KEY]: JSON.stringify(LEGACY_STATE),
    });

    const result = await migrateFromLocalStorage(storage);

    expect(result.migrated).toBe(true);
    expect(result.counts).toEqual({ companies: 2, vehicles: 1, trips: 1 });

    const companies = await companyRepository.list();
    const vehicles = await vehicleRepository.list();
    const trips = await tripRepository.list();

    expect(companies).toHaveLength(2);
    expect(vehicles).toHaveLength(1);
    expect(trips).toHaveLength(1);

    const trip = trips[0];
    expect(trip.from).toBe('Grenoble');
    expect(trip.km).toBeCloseTo(110.4, 6);
    expect(trip.roundTrip).toBe(true);
    expect(trip.purpose).toBe('Client X');
    // La date de creation d'origine est preservee : le cumul annuel reste identique.
    expect(trip.createdAt).toBe('2026-08-01T09:00:00.000Z');
  });

  it('ne detruit pas les cles localStorage d’origine', async () => {
    const storage = createFakeStorage({
      [LEGACY_STATE_KEY]: JSON.stringify(LEGACY_STATE),
    });
    await migrateFromLocalStorage(storage);
    expect(storage.getItem(LEGACY_STATE_KEY)).toBeTruthy();
  });

  it('reprend aussi le cache d’adresses', async () => {
    const storage = createFakeStorage({
      [LEGACY_STATE_KEY]: JSON.stringify(LEGACY_STATE),
      [LEGACY_GEO_CACHE_KEY]: JSON.stringify({
        'grenoble': { lat: 45.188, lon: 5.724, display: 'Grenoble, France' },
      }),
    });

    await migrateFromLocalStorage(storage);
    const cached = await geoCacheRepository.get('Grenoble');
    expect(cached).not.toBeNull();
    expect(cached.latitude).toBeCloseTo(45.188, 5);
  });

  it('ne s’execute qu’une seule fois', async () => {
    const storage = createFakeStorage({
      [LEGACY_STATE_KEY]: JSON.stringify(LEGACY_STATE),
    });

    expect((await migrateFromLocalStorage(storage)).migrated).toBe(true);
    const second = await migrateFromLocalStorage(storage);
    expect(second.migrated).toBe(false);
    expect(second.reason).toBe('deja-migre');
    expect(await companyRepository.list()).toHaveLength(2);
  });

  it('n’ecrase jamais une base deja alimentee', async () => {
    await companyRepository.save({ name: 'Structure existante' });

    const storage = createFakeStorage({
      [LEGACY_STATE_KEY]: JSON.stringify(LEGACY_STATE),
    });

    const result = await migrateFromLocalStorage(storage);
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('base-deja-alimentee');

    const companies = await companyRepository.list();
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe('Structure existante');
  });

  it('ne fait rien s’il n’y a aucune donnee v0.1.1', async () => {
    const result = await migrateFromLocalStorage(createFakeStorage());
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('aucune-donnee-v0.1.1');
  });

  it('tolere un contenu localStorage corrompu', async () => {
    const storage = createFakeStorage({ [LEGACY_STATE_KEY]: '{ ceci n est pas du json' });
    const result = await migrateFromLocalStorage(storage);
    expect(result.migrated).toBe(false);
  });

  it('ne plante pas en l’absence de localStorage', async () => {
    const result = await migrateFromLocalStorage(null);
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('pas-de-localstorage');
  });
});
