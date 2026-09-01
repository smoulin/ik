/**
 * Configuration de l'enregistrement automatique, dans la coque Android.
 *
 * Tout se joue sur des autorisations qu'Android n'accorde que dans un ordre
 * precis, et sur une exemption de batterie sans laquelle le declenchement par
 * le Bluetooth ne partira jamais. Cet ecran rend ces prerequis visibles :
 * tant qu'une ligne est rouge, l'enregistrement ne fonctionnera pas, et il vaut
 * mieux le dire que laisser l'utilisateur decouvrir un trajet manquant.
 */

import { el } from '../dom.js';
import {
  readiness,
  requestPermission,
  requestBatteryExemption,
  openSystemSettings,
  pairedDevices,
  getVehicle,
  setVehicle,
  readJournal,
  clearJournal,
  note,
} from '../../services/tracks/nativeRecorder.js';
import { deliverFile } from '../../services/platform/fileDelivery.js';

const STEPS = [
  {
    key: 'location',
    label: 'Position',
    action: () => requestPermission('location'),
  },
  {
    key: 'backgroundLocation',
    label: 'Position en arrière-plan',
    hint: 'À régler sur « Toujours autoriser » : sans cela, l’enregistrement s’arrête dès que l’écran s’éteint.',
    action: () => requestPermission('backgroundLocation'),
  },
  {
    key: 'notifications',
    label: 'Notifications',
    hint: 'Le repère qui indique qu’un trajet est en cours.',
    action: () => requestPermission('notifications'),
  },
  {
    key: 'bluetooth',
    label: 'Bluetooth',
    hint: 'Pour lire le nom des appareils appairés.',
    action: () => requestPermission('bluetooth'),
  },
  {
    key: 'batteryUnrestricted',
    label: 'Batterie sans restriction',
    hint: 'C’est elle qui autorise le démarrage automatique quand l’application dort.',
    action: () => requestBatteryExemption(),
  },
];

/**
 * Boite modale qui se range vraiment.
 *
 * Le rangement ne peut pas dependre du seul evenement `close` : certaines
 * WebView ne l'emettent pas — c'est verifiable, un `<dialog>` neuf n'en emet
 * aucun dans le navigateur de test. La boite disparaitrait alors de l'ecran
 * tout en restant dans le document, et l'appelant ne serait jamais prevenu :
 * apres avoir accorde une autorisation, la page ne se rafraichirait pas.
 *
 * Tous les chemins de fermeture — croix, Echap, evenement natif — appellent
 * donc le meme rangement, execute une seule fois.
 */
function createDialog(className, onClosed = () => {}) {
  const dialog = el('dialog', { class: className });
  let closed = false;

  function finish() {
    if (closed) return;
    closed = true;
    dialog.remove();
    onClosed();
  }

  function close() {
    if (dialog.open) dialog.close();
    finish();
  }

  dialog.addEventListener('close', finish);
  dialog.addEventListener('cancel', finish);
  // Echap ferme la boite sans passer par JavaScript : ce guetteur assure le
  // rangement meme quand l'evenement natif n'arrive pas.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') finish();
  });

  return { dialog, close };
}

/**
 * Titre d'une boite modale, et la croix qui la ferme.
 *
 * Un bouton « Fermer » en pied obligeait a faire defiler tout le journal pour
 * ressortir de la boite. La croix reste visible en haut a droite, ou le geste
 * est attendu.
 */
function dialogHead(title, close) {
  return el('div', { class: 'dialog-head' }, [
    el('h2', { text: title }),
    el('button', {
      class: 'dialog-close',
      type: 'button',
      text: '✕',
      'aria-label': 'Fermer',
      onClick: close,
    }),
  ]);
}

export async function openRecorderSetup({ onChanged = () => {} } = {}) {
  const { dialog, close } = createDialog('recorder-setup', onChanged);
  const body = el('div');

  dialog.append(dialogHead('Enregistrement automatique', close), body);

  document.body.append(dialog);
  dialog.showModal();

  note('Ecran de configuration ouvert.');
  await render();

  async function render() {
    body.replaceChildren(el('p', { class: 'hint', text: 'Lecture des autorisations…' }));

    const [state, vehicle, diary] = await Promise.all([readiness(), getVehicle(), safeJournal()]);

    body.replaceChildren(
      el('h3', { text: '1. Autorisations' }),
      ...STEPS.map((step) => renderStep(step, state[step.key])),
      el('button', {
        class: 'ghost',
        text: 'Ouvrir les réglages Android',
        onClick: async () => {
          await openSystemSettings();
        },
      }),
      el('h3', { text: '2. Véhicule' }),
      el('p', {
        class: 'hint',
        text: vehicle?.name
          ? `Déclencheur : ${vehicle.name}`
          : 'Aucun véhicule choisi — le déclenchement automatique est inactif.',
      }),
      el('button', { text: 'Choisir l’appareil Bluetooth', onClick: chooseVehicle }),
      el('h3', { text: '3. Journal' }),
      el('p', {
        class: 'hint',
        text:
          'Le service enregistre application fermée : si un trajet manque, ' +
          'c’est ici qu’on en trouve la raison.',
      }),
      el('pre', { class: 'diary', text: lastLines(diary.journal, 25) || 'Journal vide.' }),
      el('div', { class: 'button-row equal' }, [
        el('button', { text: 'Partager le journal', onClick: () => shareJournal(diary.journal) }),
        el('button', {
          text: 'Effacer',
          onClick: async () => {
            await clearJournal();
            await render();
          },
        }),
      ]),
    );
  }

  async function safeJournal() {
    return readJournal().catch(() => ({ journal: '', path: '' }));
  }

  function lastLines(text, count) {
    return String(text || '')
      .split('\n')
      .filter(Boolean)
      .slice(-count)
      .join('\n');
  }

  async function shareJournal(journal) {
    if (!journal) {
      window.alert('Le journal est vide.');
      return;
    }
    await deliverFile(journal, 'text/plain', 'agilmea-journal.txt');
  }

  function renderStep(step, ok) {
    return el('div', { class: `setup-step ${ok ? 'ok' : 'todo'}` }, [
      el('div', { class: 'setup-line' }, [
        el('span', { text: step.label }),
        ok
          ? el('span', { class: 'setup-badge', text: 'accordé' })
          : el('button', {
              text: 'Accorder',
              onClick: async () => {
                await step.action();
                await render();
              },
            }),
      ]),
      step.hint && !ok ? el('div', { class: 'hint', text: step.hint }) : null,
    ]);
  }

  async function chooseVehicle() {
    let devices = [];
    try {
      devices = await pairedDevices();
    } catch (error) {
      window.alert(`Impossible de lire les appareils : ${error.message || error}`);
      return;
    }

    if (!devices.length) {
      window.alert('Aucun appareil appairé. Connecte d’abord le téléphone au véhicule.');
      return;
    }

    const { dialog: picker, close: closePicker } = createDialog('recorder-setup');
    picker.append(
      dialogHead('Appareil du véhicule', closePicker),
      el(
        'div',
        { class: 'device-list' },
        devices.map((device) =>
          el('button', {
            text: `${device.name}\n${device.address}`,
            onClick: async () => {
              await setVehicle(device);
              await note(`Vehicule choisi : ${device.name}`);
              closePicker();
              await render();
            },
          }),
        ),
      ),
    );

    document.body.append(picker);
    picker.showModal();
  }
}
