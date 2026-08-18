/* eslint-env serviceworker */
/**
 * Service worker Agilmea IK - genere au build par vite.config.js, qui remplace
 * les deux jetons declares juste en dessous par la version et la liste des assets.
 *
 * Strategie :
 *  - navigation (le document HTML) : reseau d'abord, cache en repli hors ligne
 *    -> une nouvelle version est detectee des le premier chargement en ligne ;
 *  - assets de meme origine : cache d'abord (ils sont haches, donc immuables) ;
 *  - tout le reste (API adresses, itineraires) : jamais intercepte
 *    -> corrige le bug v0.1.1 ou l'index.html etait renvoye a la place du JSON.
 *
 * Ce fichier n'utilise que de l'ASCII : il est reecrit par le build, on evite
 * ainsi toute question d'encodage.
 */

const APP_VERSION = __APP_VERSION__;
const CACHE_NAME = `agilmea-ik-v${APP_VERSION}`;
const PRECACHE_ASSETS = __PRECACHE_ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((error) => {
        // Un asset manquant ne doit pas empecher l'installation du worker.
        console.warn('[sw] precache partiel', error);
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  // Envoye par l'application quand l'utilisateur clique sur « Mettre a jour ».
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});

/** Cache technique du fichier recu par partage Android. */
const SHARE_CACHE = 'agilmea-share';

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Fichier GPX partage depuis une autre application : le POST ne peut pas
  // etre lu par la page. On depose donc le fichier dans un cache, puis on
  // redirige vers l'application, qui viendra le recuperer.
  if (request.method === 'POST' && new URL(request.url).searchParams.has('share-target')) {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const file = form.get('track');
          if (file) {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              'shared-track',
              new Response(file, { headers: { 'X-Agilmea-Filename': file.name || 'trajet.gpx' } }),
            );
          }
        } catch (error) {
          console.warn('[sw] partage illisible', error);
        }
        return Response.redirect('./?share=1', 303);
      })(),
    );
    return;
  }

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ne jamais intercepter les appels vers les services externes (adresses, itineraires).
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || (await caches.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok && fresh.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (error) {
        throw error;
      }
    })(),
  );
});
