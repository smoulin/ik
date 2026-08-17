/**
 * Aide de test : repart d'une base vide entre deux tests.
 */

import { openDb, resetDbConnection, DB_NAME } from '../../src/data/db.js';

export async function resetDatabase() {
  // Ferme la connexion en cours, sinon la suppression reste bloquee.
  try {
    const db = await openDb();
    db.close();
  } catch {
    /* base jamais ouverte : rien a fermer */
  }
  resetDbConnection();

  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

  resetDbConnection();
}

/** Faux localStorage, pour tester la migration sans navigateur. */
export function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    get size() {
      return data.size;
    },
  };
}
