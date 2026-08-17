/**
 * Point d'entree de l'application.
 *
 * Ordre de demarrage :
 *   1. migration des donnees v0.1.1 (localStorage -> IndexedDB), si necessaire ;
 *   2. construction de l'interface ;
 *   3. enregistrement du service worker (production uniquement).
 */

import './styles/base.css';
import './styles/print.css';

import { createApp } from './ui/app.js';
import { migrateFromLocalStorage } from './data/migrations.js';
import { registerServiceWorker } from './pwa/registerSw.js';

/** Injectee au build depuis package.json — source unique de la version (§11). */
const APP_VERSION = __APP_VERSION__;

async function bootstrap() {
  try {
    const migration = await migrateFromLocalStorage();
    if (migration.migrated) {
      console.info('[agilmea] donnees v0.1.1 reprises', migration.counts);
    }
  } catch (error) {
    // Une migration en echec ne doit jamais empecher l'application de demarrer.
    console.warn('[agilmea] migration impossible', error);
  }

  try {
    await createApp({ appVersion: APP_VERSION });
  } catch (error) {
    console.error('[agilmea] demarrage impossible', error);
    showFatalError(error);
    return;
  }

  registerServiceWorker({ isDev: import.meta.env.DEV });
}

function showFatalError(error) {
  const main = document.querySelector('main');
  if (!main) return;
  const card = document.createElement('section');
  card.className = 'card warning';
  const title = document.createElement('strong');
  title.textContent = 'Agilmea IK n’a pas pu démarrer';
  const message = document.createElement('p');
  message.textContent = String(error?.message || error);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Vérifie que la navigation privée n’est pas active : elle empêche l’enregistrement local des données.';
  card.append(title, message, hint);
  main.prepend(card);
}

bootstrap();
