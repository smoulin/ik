/**
 * Assemblage de l'interface : onglets, vues, invite d'installation.
 */

import { byId, qsa, setHidden } from './dom.js';
import { createStore } from './store.js';
import { createTripView } from './views/tripView.js';
import { createHistoryView } from './views/historyView.js';
import { createReportsView } from './views/reportsView.js';
import { createSettingsView } from './views/settingsView.js';
import { createGeoServices } from '../services/geo/index.js';

export async function createApp({ appVersion }) {
  const store = createStore();
  const geo = createGeoServices();

  function switchTab(name) {
    qsa('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${name}`));
    qsa('.bottom-nav [data-tab]').forEach((button) =>
      button.classList.toggle('active', button.dataset.tab === name),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  qsa('[data-tab]').forEach((button) =>
    button.addEventListener('click', () => switchTab(button.dataset.tab)),
  );

  const tripView = createTripView({
    store,
    geo,
    switchTab,
    onSaved: () => refreshAll(),
  });

  const historyView = createHistoryView({
    store,
    onEdit: (id) => tripView.edit(id),
    onDuplicate: (id) => tripView.duplicate(id),
    onChanged: () => refreshAll(),
  });

  const reportsView = createReportsView({ store, appVersion });

  const settingsView = createSettingsView({
    store,
    geo,
    appVersion,
    onChanged: () => refreshAll(),
  });

  function refreshAll() {
    tripView.refresh();
    historyView.refresh();
    reportsView.refresh();
    settingsView.refresh();
  }

  store.subscribe(() => {
    /* Les vues sont rafraichies explicitement apres chaque action. */
  });

  await store.load();
  refreshAll();

  setupInstallPrompt();

  return { store, geo, refreshAll, switchTab };
}

/** Invite d'installation Android (« Ajouter a l'ecran d'accueil »). */
function setupInstallPrompt() {
  const installBtn = byId('installBtn');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setHidden(installBtn, false);
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    setHidden(installBtn, true);
  });

  window.addEventListener('appinstalled', () => setHidden(installBtn, true));
}
