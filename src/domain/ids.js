/**
 * Generation d'identifiants stables.
 *
 * Un identifiant doit rester unique meme si plusieurs appareils creent des
 * enregistrements hors ligne (prerequis d'une synchronisation future, cf. §46).
 * On privilegie donc crypto.randomUUID quand il est disponible.
 */

export function uid(prefix = 'id') {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export function nowIso() {
  return new Date().toISOString();
}
