/**
 * Assemblage de l'interface : onglets, vues, invite d'installation.
 *
 * La navigation compte cinq entrées : Accueil (trajets enregistrés par le GPS,
 * à valider), Tous les trajets, le bouton d'ajout au centre, Rapports et
 * Réglages.
 */

import { byId, qsa, setHidden } from './dom.js';
import { createStore } from './store.js';
import { createHomeView } from './views/homeView.js';
import { createTripView } from './views/tripView.js';
import { createHistoryView } from './views/historyView.js';
import { createReportsView } from './views/reportsView.js';
import { createSettingsView } from './views/settingsView.js';
import { createGeoServices } from '../services/geo/index.js';
import { mountHeaderLogo } from './components/logo.js';

export async function createApp({ appVersion }) {
  mountHeaderLogo(byId('brandLogo'));

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

  const homeView = createHomeView({
    store,
    onChanged: () => refreshAll(),
    // « Compléter » ouvre le formulaire pré-rempli avec la trace mesurée.
    onEditDraft: (draft) => {
      tripView.loadDraft(draft);
      switchTab('trip');
    },
  });

  const historyView = createHistoryView({
    store,
    onEdit: (id) => {
      tripView.edit(id);
      switchTab('trip');
    },
    onDuplicate: (id) => {
      tripView.duplicate(id);
      switchTab('trip');
    },
    onChanged: () => refreshAll(),
  });

  const reportsView = createReportsView({ store, appVersion });

  const settingsView = createSettingsView({
    store,
    geo,
    appVersion,
    onChanged: () => refreshAll(),
  });

  async function refreshAll() {
    tripView.refresh();
    historyView.refresh();
    reportsView.refresh();
    settingsView.refresh();
    await homeView.refresh();
  }

  // Le bouton central ouvre un formulaire vierge, jamais la suite d'une saisie
  // precedente.
  byId('addTripBtn').addEventListener('click', () => tripView.reset());

  await store.load();
  await refreshAll();

  setupInstallPrompt();
  await receiveSharedFile(homeView);

  return { store, geo, refreshAll, switchTab, homeView };
}

/**
 * Fichier GPX partagé depuis une autre application Android.
 *
 * Le service worker place le fichier reçu dans un cache temporaire puis
 * redirige vers l'application avec `?share=1` : c'est le seul moyen de
 * récupérer un envoi POST dans une page.
 */
async function receiveSharedFile(homeView) {
  const params = new URLSearchParams(location.search);
  if (!params.has('share')) return;

  // L'adresse est nettoyée tout de suite : un rechargement ne doit pas
  // rejouer l'import.
  history.replaceState(null, '', location.pathname);

  try {
    const cache = await caches.open('agilmea-share');
    const response = await cache.match('shared-track');
    if (!response) return;
    await cache.delete('shared-track');

    const blob = await response.blob();
    const name = response.headers.get('X-Agilmea-Filename') || 'trajet.gpx';
    await homeView.importSharedFile(new File([blob], name, { type: 'application/gpx+xml' }));
  } catch (error) {
    console.warn('[agilmea] fichier partagé illisible', error);
  }
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
