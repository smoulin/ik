/**
 * Enregistrement du service worker et gestion des mises a jour (§22 et §24).
 *
 * En developpement, non seulement on n'enregistre rien, mais on desinscrit
 * activement un worker deja installe et on vide ses caches : sans cela, un
 * service worker laisse par une visite en production servirait indefiniment
 * d'anciens fichiers sur localhost.
 */

import { Capacitor } from '@capacitor/core';
import { byId, setHidden } from '../ui/dom.js';

export function registerServiceWorker({ isDev = false } = {}) {
  if (!('serviceWorker' in navigator)) return;

  // Dans la coque native, l'application est deja servie depuis le telephone :
  // un service worker n'apporterait aucune disponibilite hors ligne
  // supplementaire, et interposerait un second cache entre le code livre et le
  // code execute — donc une source de decalage a chaque mise a jour.
  if (Capacitor.isNativePlatform()) return;

  if (isDev || location.protocol === 'file:') {
    unregisterEverything();
    return;
  }

  // Le demarrage de l'application est asynchrone (IndexedDB) et se termine
  // souvent APRES l'evenement `load` : un simple addEventListener('load') ne se
  // declencherait alors jamais et le service worker ne serait jamais enregistre.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

async function register() {
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    watchForUpdates(registration);
  } catch (error) {
    console.warn('[pwa] enregistrement impossible', error);
  }
}

function watchForUpdates(registration) {
  // Un worker deja en attente : la mise a jour est prete des maintenant.
  if (registration.waiting) showUpdateBanner(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      // « installed » avec un controleur actif = nouvelle version en attente.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner(installing);
      }
    });
  });

  // Le nouveau worker a pris la main : on recharge une seule fois.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  // Verifie l'existence d'une mise a jour a chaque retour dans l'application.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });
}

function showUpdateBanner(worker) {
  const banner = byId('updateBanner');
  const button = byId('updateBtn');
  if (!banner || !button) return;

  setHidden(banner, false);
  button.addEventListener(
    'click',
    () => {
      button.disabled = true;
      button.textContent = 'Mise à jour…';
      worker.postMessage({ type: 'SKIP_WAITING' });
    },
    { once: true },
  );
}

async function unregisterEverything() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('[pwa] nettoyage impossible', error);
  }
}
