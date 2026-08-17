/**
 * Cache de resolution « adresse -> coordonnees » (cf. §34).
 *
 * Evite de redemander au fournisseur une adresse deja resolue : c'est a la fois
 * une exigence des conditions d'utilisation de Nominatim et un gain de rapidite.
 */

import { STORES, withTransaction, requestToPromise } from '../db.js';
import { normalizeAddressKey } from '../../shared/normalize.js';

export const MAX_GEO_CACHE_ENTRIES = 300;

async function get(address) {
  const key = normalizeAddressKey(address);
  if (!key) return null;
  const record = await withTransaction(STORES.GEO_CACHE, 'readonly', (stores) =>
    requestToPromise(stores[STORES.GEO_CACHE].get(key)),
  );
  return record || null;
}

async function set(address, { latitude, longitude, label = '', provider = '' }) {
  const key = normalizeAddressKey(address);
  if (!key || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const entry = {
    key,
    query: String(address).trim(),
    latitude,
    longitude,
    label,
    provider,
    createdAt: new Date().toISOString(),
  };

  await withTransaction(STORES.GEO_CACHE, 'readwrite', (stores) => {
    stores[STORES.GEO_CACHE].put(entry);
  });

  await prune();
  return entry;
}

async function prune() {
  const records = await withTransaction(STORES.GEO_CACHE, 'readonly', (stores) =>
    requestToPromise(stores[STORES.GEO_CACHE].getAll()),
  );
  if (records.length <= MAX_GEO_CACHE_ENTRIES) return;
  const excess = records
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, records.length - MAX_GEO_CACHE_ENTRIES);
  await withTransaction(STORES.GEO_CACHE, 'readwrite', (stores) => {
    for (const record of excess) stores[STORES.GEO_CACHE].delete(record.key);
  });
}

async function clear() {
  await withTransaction(STORES.GEO_CACHE, 'readwrite', (stores) => {
    stores[STORES.GEO_CACHE].clear();
  });
}

export const geoCacheRepository = { get, set, clear, prune };
