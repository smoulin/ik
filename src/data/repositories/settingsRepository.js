/**
 * Reglages applicatifs : simples paires cle / valeur.
 * Sert notamment a designer le beneficiaire principal et a tracer la version
 * du schema de donnees (indispensable aux migrations).
 */

import { STORES, withTransaction, requestToPromise } from '../db.js';

export const SETTING_KEYS = /** @type {const} */ ({
  SCHEMA_VERSION: 'schemaVersion',
  PRIMARY_BENEFICIARY_ID: 'primaryBeneficiaryId',
  LAST_APP_VERSION: 'lastAppVersion',
  MIGRATED_FROM_LOCAL_STORAGE: 'migratedFromLocalStorage',
});

async function get(key, fallback = null) {
  const record = await withTransaction(STORES.SETTINGS, 'readonly', (stores) =>
    requestToPromise(stores[STORES.SETTINGS].get(key)),
  );
  return record ? record.value : fallback;
}

async function set(key, value) {
  await withTransaction(STORES.SETTINGS, 'readwrite', (stores) => {
    stores[STORES.SETTINGS].put({ key, value, updatedAt: new Date().toISOString() });
  });
  return value;
}

async function all() {
  const records = await withTransaction(STORES.SETTINGS, 'readonly', (stores) =>
    requestToPromise(stores[STORES.SETTINGS].getAll()),
  );
  return Object.fromEntries(records.map((record) => [record.key, record.value]));
}

async function remove(key) {
  await withTransaction(STORES.SETTINGS, 'readwrite', (stores) => {
    stores[STORES.SETTINGS].delete(key);
  });
}

async function clear() {
  await withTransaction(STORES.SETTINGS, 'readwrite', (stores) => {
    stores[STORES.SETTINGS].clear();
  });
}

export const settingsRepository = { get, set, all, remove, clear, KEYS: SETTING_KEYS };
