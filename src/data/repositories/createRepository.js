/**
 * Fabrique de depot generique.
 *
 * Chaque depot expose la meme API (list / get / save / remove / clear).
 * L'interface de l'application ne manipule que ces methodes : remplacer
 * IndexedDB par autre chose — ou brancher une synchronisation distante —
 * ne demanderait de toucher qu'a ce fichier et a `db.js`.
 */

import { withTransaction, requestToPromise } from '../db.js';
import { touch, softDelete } from '../../domain/models.js';

/**
 * @param {string} storeName
 * @param {(input: object) => object} factory  normalisation de l'entite
 */
export function createRepository(storeName, factory) {
  /** Tous les enregistrements non supprimes. */
  async function list({ includeDeleted = false } = {}) {
    // withTransaction resout avec la valeur de `work` : une promesse y est adoptee.
    const all = await withTransaction(storeName, 'readonly', (stores) =>
      requestToPromise(stores[storeName].getAll()),
    );
    return includeDeleted ? all : all.filter((record) => !record.deletedAt);
  }

  async function get(id) {
    if (!id) return null;
    const record = await withTransaction(storeName, 'readonly', (stores) =>
      requestToPromise(stores[storeName].get(id)),
    );
    return record || null;
  }

  /** Cree ou met a jour. Renvoie l'entite normalisee telle qu'elle est stockee. */
  async function save(input) {
    const existing = input?.id ? await get(input.id) : null;
    const entity = existing
      ? touch({ ...existing, ...factory({ ...existing, ...input }) })
      : factory(input);

    await withTransaction(storeName, 'readwrite', (stores) => {
      stores[storeName].put(entity);
    });
    return entity;
  }

  /** Ecriture en lot, sans normalisation supplementaire (import, migration). */
  async function saveMany(entities) {
    const normalized = entities.map((entity) => factory(entity));
    await withTransaction(storeName, 'readwrite', (stores) => {
      for (const entity of normalized) stores[storeName].put(entity);
    });
    return normalized;
  }

  /**
   * Suppression logique par defaut : l'enregistrement reste en base avec
   * `deletedAt`, ce qui permettra a une synchronisation future de propager la
   * suppression. `{ hard: true }` efface reellement la ligne.
   */
  async function remove(id, { hard = false } = {}) {
    if (hard) {
      await withTransaction(storeName, 'readwrite', (stores) => {
        stores[storeName].delete(id);
      });
      return true;
    }
    const existing = await get(id);
    if (!existing) return false;
    const deleted = softDelete(existing);
    await withTransaction(storeName, 'readwrite', (stores) => {
      stores[storeName].put(deleted);
    });
    return true;
  }

  async function clear() {
    await withTransaction(storeName, 'readwrite', (stores) => {
      stores[storeName].clear();
    });
  }

  async function count(options) {
    const items = await list(options);
    return items.length;
  }

  return { storeName, list, get, save, saveMany, remove, clear, count };
}
