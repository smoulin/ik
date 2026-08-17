/**
 * Migration des donnees.
 *
 * Le point sensible de cette version : la v0.1.1 stockait tout dans
 * `localStorage`. La reprise doit etre automatique, silencieuse et NON
 * DESTRUCTIVE — les cles d'origine sont conservees telles quelles pour qu'un
 * retour en arriere reste possible.
 */

import { SCHEMA_VERSION } from '../domain/models.js';
import {
  companyRepository,
  vehicleRepository,
  tripRepository,
  settingsRepository,
} from './repositories/index.js';
import { geoCacheRepository } from './repositories/geoCacheRepository.js';
import { SETTING_KEYS } from './repositories/settingsRepository.js';

/** Cles utilisees par la version 0.1.1. */
export const LEGACY_STATE_KEY = 'ikMultiEnterprises.v1';
export const LEGACY_GEO_CACHE_KEY = 'ikMultiEnterprises.geoCache.v1';

/**
 * Convertit une structure au format v0.1.1 vers le modele actuel.
 * `scheme` devient `calculationMode`, `fixedRate` passe dans `calculationSettings`.
 */
export function migrateLegacyCompany(legacy) {
  return {
    id: legacy.id,
    name: legacy.name,
    legalName: '',
    type: '',
    siren: '',
    siret: '',
    address: {},
    calculationMode: legacy.scheme,
    calculationSettings: { fixedRate: Number(legacy.fixedRate) || 0 },
    active: true,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
}

export function migrateLegacyVehicle(legacy) {
  return {
    id: legacy.id,
    name: legacy.name,
    cv: legacy.cv,
    electric: Boolean(legacy.electric),
    fuel: legacy.fuel,
    active: true,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
}

export function migrateLegacyTrip(legacy) {
  return {
    id: legacy.id,
    date: legacy.date,
    companyId: legacy.companyId,
    vehicleId: legacy.vehicleId,
    from: legacy.from,
    to: legacy.to,
    fromCoords: null,
    toCoords: null,
    km: legacy.km,
    purpose: legacy.purpose || '',
    roundTrip: Boolean(legacy.roundTrip),
    distanceSource: 'manual',
    createdAt: legacy.createdAt,
    updatedAt: legacy.createdAt,
  };
}

/** Verifie qu'un objet ressemble bien a un etat v0.1.1 (ou a une sauvegarde JSON). */
export function isLegacyState(value) {
  return Boolean(
    value &&
      Array.isArray(value.companies) &&
      Array.isArray(value.vehicles) &&
      Array.isArray(value.trips),
  );
}

/** Transforme un etat v0.1.1 complet en jeux d'entites du modele actuel. */
export function migrateLegacyState(legacy) {
  return {
    companies: (legacy.companies || []).map(migrateLegacyCompany),
    vehicles: (legacy.vehicles || []).map(migrateLegacyVehicle),
    trips: (legacy.trips || []).map(migrateLegacyTrip),
  };
}

/**
 * Reprend les donnees de la v0.1.1 si elles existent et que la base est vide.
 *
 * @param {Storage|null} storage  injectable pour les tests
 * @returns {Promise<{migrated: boolean, counts?: object, reason?: string}>}
 */
export async function migrateFromLocalStorage(storage = globalThis.localStorage ?? null) {
  const already = await settingsRepository.get(SETTING_KEYS.MIGRATED_FROM_LOCAL_STORAGE, false);
  if (already) return { migrated: false, reason: 'deja-migre' };

  if (!storage) return { migrated: false, reason: 'pas-de-localstorage' };

  let legacy = null;
  try {
    legacy = JSON.parse(storage.getItem(LEGACY_STATE_KEY));
  } catch {
    legacy = null;
  }

  if (!isLegacyState(legacy)) {
    // Rien a reprendre : on marque quand meme pour ne pas re-tester a chaque lancement.
    await settingsRepository.set(SETTING_KEYS.MIGRATED_FROM_LOCAL_STORAGE, true);
    await settingsRepository.set(SETTING_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
    return { migrated: false, reason: 'aucune-donnee-v0.1.1' };
  }

  // Securite : ne jamais ecraser une base deja alimentee.
  const existingTrips = await tripRepository.count({ includeDeleted: true });
  const existingCompanies = await companyRepository.count({ includeDeleted: true });
  if (existingTrips > 0 || existingCompanies > 0) {
    await settingsRepository.set(SETTING_KEYS.MIGRATED_FROM_LOCAL_STORAGE, true);
    return { migrated: false, reason: 'base-deja-alimentee' };
  }

  const { companies, vehicles, trips } = migrateLegacyState(legacy);

  await companyRepository.saveMany(companies);
  await vehicleRepository.saveMany(vehicles);
  await tripRepository.saveMany(trips);
  await migrateLegacyGeoCache(storage);

  await settingsRepository.set(SETTING_KEYS.MIGRATED_FROM_LOCAL_STORAGE, true);
  await settingsRepository.set(SETTING_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);

  // Les cles v0.1.1 sont volontairement conservees : filet de securite.
  return {
    migrated: true,
    counts: {
      companies: companies.length,
      vehicles: vehicles.length,
      trips: trips.length,
    },
  };
}

/** Reprend le cache d'adresses de la v0.1.1 : { "adresse": {lat, lon, display} }. */
async function migrateLegacyGeoCache(storage) {
  let cache = null;
  try {
    cache = JSON.parse(storage.getItem(LEGACY_GEO_CACHE_KEY));
  } catch {
    return;
  }
  if (!cache || typeof cache !== 'object') return;

  for (const [address, value] of Object.entries(cache)) {
    if (!value) continue;
    await geoCacheRepository.set(address, {
      latitude: Number(value.lat),
      longitude: Number(value.lon),
      label: value.display || '',
      provider: 'nominatim',
    });
  }
}
