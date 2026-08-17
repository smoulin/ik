/**
 * Acces IndexedDB — la seule couche de l'application qui connait IndexedDB.
 *
 * Volontairement minimaliste (pas de bibliotheque tierce) : une promesse autour
 * de l'API native, plus un helper de transaction. Tout le reste de l'application
 * passe par les depots de `data/repositories`.
 */

export const DB_NAME = 'agilmea-ik';
export const DB_VERSION = 1;

export const STORES = /** @type {const} */ ({
  COMPANIES: 'companies',
  VEHICLES: 'vehicles',
  TRIPS: 'trips',
  FAVORITE_PLACES: 'favoritePlaces',
  BENEFICIARIES: 'beneficiaries',
  RECENT_ADDRESSES: 'recentAddresses',
  GEO_CACHE: 'geoCache',
  SETTINGS: 'settings',
});

let dbPromise = null;

/** Ouvre (et cree au besoin) la base. Idempotent. */
export function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible dans cet environnement.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const from = event.oldVersion;

      if (from < 1) {
        createStore(db, STORES.COMPANIES);
        createStore(db, STORES.VEHICLES);

        const trips = createStore(db, STORES.TRIPS);
        trips.createIndex('byDate', 'date');
        trips.createIndex('byCompany', 'companyId');
        trips.createIndex('byVehicle', 'vehicleId');

        createStore(db, STORES.FAVORITE_PLACES);
        createStore(db, STORES.BENEFICIARIES);

        db.createObjectStore(STORES.RECENT_ADDRESSES, { keyPath: 'key' });
        db.createObjectStore(STORES.GEO_CACHE, { keyPath: 'key' });
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Si un autre onglet demande une montee de version, on libere la base.
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => reject(request.error || new Error('Ouverture de la base impossible.'));
    request.onblocked = () =>
      reject(new Error('La base est utilisee par un autre onglet. Ferme les autres onglets.'));
  });

  return dbPromise;
}

function createStore(db, name) {
  return db.createObjectStore(name, { keyPath: 'id' });
}

/** Reinitialise le cache de connexion — utilise par les tests. */
export function resetDbConnection() {
  dbPromise = null;
}

/**
 * Execute `work` dans une transaction et resout quand elle est reellement validee.
 *
 * @param {string|string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {(stores: Record<string, IDBObjectStore>) => any} work
 */
export async function withTransaction(storeNames, mode, work) {
  const db = await openDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)]));

    let result;
    try {
      result = work(stores);
    } catch (error) {
      tx.abort();
      reject(error);
      return;
    }

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Transaction en echec.'));
    tx.onabort = () => reject(tx.error || new Error('Transaction annulee.'));
  });
}

/** Transforme une IDBRequest en promesse. */
export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
