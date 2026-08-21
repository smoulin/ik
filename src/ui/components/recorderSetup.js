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
} from '../../services/tracks/nativeRecorder.js';

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

export async function openRecorderSetup({ onChanged = () => {} } = {}) {
  const dialog = el('dialog', { class: 'recorder-setup' });
  const body = el('div');

  dialog.append(
    el('h2', { text: 'Enregistrement automatique' }),
    body,
    el('div', { class: 'button-row' }, [
      el('button', { text: 'Fermer', onClick: () => dialog.close() }),
    ]),
  );

  dialog.addEventListener('close', () => {
    dialog.remove();
    onChanged();
  });

  document.body.append(dialog);
  dialog.showModal();

  await render();

  async function render() {
    body.replaceChildren(el('p', { class: 'hint', text: 'Lecture des autorisations…' }));

    const [state, vehicle] = await Promise.all([readiness(), getVehicle()]);

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
    );
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

    const picker = el('dialog', { class: 'recorder-setup' }, [
      el('h2', { text: 'Appareil du véhicule' }),
      el(
        'div',
        { class: 'device-list' },
        devices.map((device) =>
          el('button', {
            text: `${device.name}\n${device.address}`,
            onClick: async () => {
              await setVehicle(device);
              picker.close();
              await render();
            },
          }),
        ),
      ),
      el('div', { class: 'button-row' }, [
        el('button', { text: 'Annuler', type: 'button', onClick: () => picker.close() }),
      ]),
    ]);

    picker.addEventListener('close', () => picker.remove());
    document.body.append(picker);
    picker.showModal();
  }
}
