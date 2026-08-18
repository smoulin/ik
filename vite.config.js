import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));

/**
 * Chemin de base du site.
 *
 * Par defaut './' : le build fonctionne aussi bien a la racine d'un domaine
 * (Cloudflare Pages, Netlify, Vercel, serveur classique) que dans un sous-dossier
 * (GitHub Pages projet : https://user.github.io/agilmea-ik/).
 * Surchargeable sans toucher au code : BASE_PATH=/agilmea-ik/ npm run build
 */
const base = process.env.BASE_PATH || './';

/** Port du serveur local : impose par l'environnement, ou laisse a Vite. */
const devPort = process.env.PORT ? Number(process.env.PORT) : undefined;

/**
 * Genere le service worker de production a partir du modele src/pwa/sw-template.js.
 *
 * Ecrit maison plutot que via Workbox : ~70 lignes, aucune dependance, et surtout
 * un controle total sur le comportement de mise a jour (point sensible de la v0.1.1,
 * ou le nom de cache fige empechait toute mise a jour).
 *
 * En developpement, aucun service worker n'est genere ni enregistre.
 */
function serviceWorkerPlugin() {
  return {
    name: 'agilmea-service-worker',
    apply: 'build',
    enforce: 'post',
    writeBundle(options, bundle) {
      const outDir = options.dir || resolve(rootDir, 'dist');

      // Assets issus du bundle (JS/CSS haches) + fichiers statiques connus.
      const bundled = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map'))
        .map((name) => `./${name}`);

      const staticAssets = [
        './',
        './manifest.webmanifest',
        './icon-192.png',
        './icon-512.png',
      ];

      const assets = [...new Set([...staticAssets, ...bundled])].sort();

      const template = readFileSync(resolve(rootDir, 'src/pwa/sw-template.js'), 'utf8');
      // replaceAll : le jeton pourrait apparaitre plus d'une fois dans le modele.
      const sw = template
        .replaceAll('__APP_VERSION__', JSON.stringify(pkg.version))
        .replaceAll('__PRECACHE_ASSETS__', JSON.stringify(assets, null, 2));

      if (sw.includes('__APP_VERSION__') || sw.includes('__PRECACHE_ASSETS__')) {
        throw new Error('Service worker : un jeton n’a pas été remplacé.');
      }

      writeFileSync(resolve(outDir, 'sw.js'), sw, 'utf8');
    },
  };
}

export default defineConfig({
  base,
  define: {
    // Version centralisee : une seule source de verite, package.json.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
  // Aucun port fixe : l'application n'a besoin d'aucune adresse particuliere
  // (ni rappel OAuth, ni webhook, et les services d'adresses et de tuiles
  // acceptent toutes les origines). On respecte donc le port fourni par
  // l'environnement, et Vite en choisit un libre a defaut.
  server: {
    port: devPort,
    open: false,
  },
  preview: {
    port: devPort,
    open: false,
  },
  plugins: [serviceWorkerPlugin()],
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    restoreMocks: true,
  },
});
