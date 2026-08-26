/**
 * Enregistrement natif des trajets.
 *
 * Le service Android tourne application fermee : il ne peut donc pas prevenir
 * la page au moment ou il enregistre. Il depose ses traces sur le disque du
 * telephone, et l'application vient les chercher a son ouverture — c'est le
 * sens de `collectSessions()`.
 *
 * Le format d'echange est le GPX, deja produit par le service et deja lu par
 * `trackImportService`. Aucun format supplementaire n'est introduit : une trace
 * enregistree par le telephone suit exactement le meme chemin qu'un fichier
 * importe a la main, donc le meme filtrage et les memes tests.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const Tracker = registerPlugin('AgilmeaTracker');

/** L'enregistrement natif n'existe que dans la coque Android. */
export function isRecorderAvailable() {
  return Capacitor.isNativePlatform();
}

/**
 * Etat des autorisations et de l'exemption de batterie.
 * @returns {Promise<{location: boolean, backgroundLocation: boolean,
 *   notifications: boolean, bluetooth: boolean, batteryUnrestricted: boolean}>}
 */
export function readiness() {
  return Tracker.readiness();
}

/**
 * Demande une autorisation, et une seule.
 *
 * Android refuse d'accorder la position en arriere-plan si elle est demandee
 * en meme temps que la position simple : l'appelant enchaine donc les demandes
 * une par une, dans l'ordre.
 */
export function requestPermission(alias) {
  return Tracker.requestPermission({ alias });
}

export function requestBatteryExemption() {
  return Tracker.requestBatteryExemption();
}

export function openSystemSettings() {
  return Tracker.openSettings();
}

/** Appareils Bluetooth deja appaires avec le telephone. */
export async function pairedDevices() {
  const { devices } = await Tracker.pairedDevices();
  return devices || [];
}

export function getVehicle() {
  return Tracker.getVehicle();
}

export function setVehicle(device) {
  return Tracker.setVehicle(device ? { address: device.address, name: device.name } : {});
}

/* ------------------------------------------------------------------ */
/* Journal de diagnostic                                               */
/* ------------------------------------------------------------------ */

/**
 * Le service enregistre application fermee : quand il echoue, personne n'est
 * la pour le voir. Le journal est la seule facon de savoir apres coup ce qui
 * s'est passe — et surtout, ce qui ne s'est pas passe.
 */
export async function readJournal() {
  if (!isRecorderAvailable()) return { journal: '', path: '' };
  return Tracker.readJournal();
}

export function clearJournal() {
  return Tracker.clearJournal();
}

/** Consigne un evenement d'interface, pour recoller les faits ensuite. */
export function note(message) {
  if (!isRecorderAvailable()) return Promise.resolve();
  return Tracker.note({ message }).catch(() => {});
}

/** Enregistrement en cours : distance et nombre de points, pour l'affichage. */
export function recordingStatus() {
  return Tracker.status();
}

export function startRecording() {
  return Tracker.startRecording();
}

export function stopRecording() {
  return Tracker.stopRecording();
}

/**
 * Recupere les trajets enregistres depuis la derniere ouverture.
 *
 * Une session n'est effacee du telephone qu'apres un import reussi : en cas
 * d'erreur, elle reste disponible pour la tentative suivante plutot que d'etre
 * perdue. Un doublon est en revanche efface, puisque la trace est deja connue.
 *
 * @param {object} handlers
 * @param {Function} handlers.importGpx     depuis `createTrackImportService`
 * @param {Function} handlers.isDuplicate   idem
 * @param {Function} handlers.discard       efface une trace en doublon
 * @returns {Promise<{imported: number, duplicates: number, problems: string[]}>}
 */
export async function collectSessions({ importGpx, isDuplicate, discard }) {
  const summary = { imported: 0, duplicates: 0, problems: [] };
  if (!isRecorderAvailable()) return summary;

  const { sessions } = await Tracker.listSessions();

  for (const session of sessions || []) {
    try {
      const { gpx } = await Tracker.readSession({ name: session.name });
      const track = await importGpx({ name: session.name, text: gpx });

      if (await isDuplicate(track)) {
        await discard(track);
        summary.duplicates += 1;
      } else {
        summary.imported += 1;
      }

      await Tracker.deleteSession({ name: session.name });
    } catch (error) {
      // La session reste sur le telephone : on reessaiera a la prochaine
      // ouverture plutot que de perdre un trajet.
      summary.problems.push(`${session.name} : ${error.message || error}`);
    }
  }

  return summary;
}
