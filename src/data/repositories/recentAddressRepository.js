/**
 * Adresses recemment utilisees (cf. §30).
 *
 * Objectif : plus l'application sert, moins elle a besoin du reseau. Les entrees
 * sont dedoublonnees par cle normalisee et la liste est bornee.
 */

import { STORES, withTransaction, requestToPromise } from '../db.js';
import { normalizeAddressKey } from '../../shared/normalize.js';

/** Nombre maximum d'adresses conservees. Au-dela, les plus anciennes sortent. */
export const MAX_RECENT_ADDRESSES = 40;

async function list() {
  const records = await withTransaction(STORES.RECENT_ADDRESSES, 'readonly', (stores) =>
    requestToPromise(stores[STORES.RECENT_ADDRESSES].getAll()),
  );
  return records.sort((a, b) => String(b.usedAt).localeCompare(String(a.usedAt)));
}

/**
 * Enregistre une adresse utilisee. Si elle existe deja, on incremente son
 * compteur et on remonte sa date d'utilisation plutot que de creer un doublon.
 */
async function record({ label, postalCode = '', city = '', latitude = null, longitude = null }) {
  const key = normalizeAddressKey(label);
  if (!key) return null;

  const existing = await withTransaction(STORES.RECENT_ADDRESSES, 'readonly', (stores) =>
    requestToPromise(stores[STORES.RECENT_ADDRESSES].get(key)),
  );

  const now = new Date().toISOString();
  const entry = {
    key,
    label: String(label).trim(),
    postalCode: postalCode || existing?.postalCode || '',
    city: city || existing?.city || '',
    // On ne perd jamais des coordonnees deja connues au profit de rien.
    latitude: latitude ?? existing?.latitude ?? null,
    longitude: longitude ?? existing?.longitude ?? null,
    useCount: (existing?.useCount || 0) + 1,
    usedAt: now,
    createdAt: existing?.createdAt || now,
  };

  await withTransaction(STORES.RECENT_ADDRESSES, 'readwrite', (stores) => {
    stores[STORES.RECENT_ADDRESSES].put(entry);
  });

  await prune();
  return entry;
}

async function prune() {
  const records = await list();
  if (records.length <= MAX_RECENT_ADDRESSES) return;
  const excess = records.slice(MAX_RECENT_ADDRESSES);
  await withTransaction(STORES.RECENT_ADDRESSES, 'readwrite', (stores) => {
    for (const item of excess) stores[STORES.RECENT_ADDRESSES].delete(item.key);
  });
}

/** Recherche utilisee par l'autocompletion : les prefixes remontent en tete. */
async function search(query, limit = 3) {
  const normalized = normalizeAddressKey(query);
  if (!normalized) return [];
  const records = await list();
  return records
    .filter((item) => item.key.includes(normalized))
    .sort((a, b) => {
      const aStarts = a.key.startsWith(normalized) ? 0 : 1;
      const bStarts = b.key.startsWith(normalized) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return String(b.usedAt).localeCompare(String(a.usedAt));
    })
    .slice(0, limit);
}

async function clear() {
  await withTransaction(STORES.RECENT_ADDRESSES, 'readwrite', (stores) => {
    stores[STORES.RECENT_ADDRESSES].clear();
  });
}

export const recentAddressRepository = { list, record, search, clear, prune };
