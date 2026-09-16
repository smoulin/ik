# Trajets à valider — balayage, trajets personnels, aller-retour — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alléger l'écran « À valider » (balayage pour supprimer, trajets personnels écartés automatiquement) et lancer le calcul quand on coche « Aller-retour ».

**Architecture:** La règle de correspondance d'un trajet personnel est une fonction pure du domaine (`domain/tracks/personalRoutes.js`). Les règles sont des entités synchronisables (magasin IndexedDB v3, sauvegarde, fusion). Le filtre s'applique dans `homeView.refresh()`, point de passage obligé de toute trace en attente. Le balayage est un composant isolé (`ui/components/swipeToDelete.js`).

**Tech Stack:** JavaScript ES modules, Vite, Vitest + fake-indexeddb, IndexedDB, Capacitor (Android).

## Global Constraints

- Réponses en français ; code, noms de fichiers et commits en anglais. Commentaires du code en français sans accents, comme l'existant.
- Aucune dépendance nouvelle.
- Aucune donnée personnelle dans le dépôt (§31) : les tests utilisent des coordonnées et libellés fictifs.
- Suppression d'une trace à valider (balayage, « Ignorer », trajet personnel) = **marque vide** : il ne reste que `id`, `createdAt`, `updatedAt`, `deletedAt`. Ni tracé, ni lieux, ni adresses, ni horaires, ni distance (décision utilisateur). La marque sert uniquement à propager la suppression par la fusion de sauvegardes.
- La règle d'effacement vit dans `createTrack` : elle s'applique à tous les chemins d'écriture, restauration et fusion comprises.
- Les anciennes traces au statut `ignored`, qui gardaient lieux et adresses, sont vidées de la même façon.
- **La marque disparaît après fusion dans les deux sens** (décision utilisateur) : l'appareil qui reçoit la suppression retire le trajet et n'en garde aucune marque ; l'appareil d'origine efface la sienne dès qu'il fusionne un fichier de l'autre côté exporté après la suppression et où le trajet n'existe plus. Limite acceptée : fusionner ensuite un fichier antérieur à la suppression fait revenir le trajet.
- Pour les traces, une suppression l'emporte toujours sur une version vivante, quelles que soient les dates : le renommage automatique des extrémités modifie `updatedAt` sans que personne ait voulu « annuler » la suppression.
- Rayon de correspondance : **200 m**, dans **les deux sens** (décision utilisateur).
- Trajet correspondant : **ignoré automatiquement**, y compris ceux déjà en attente (décision utilisateur).
- Intitulé du bouton : **« Trajet personnel »**, avec la ligne « Ce trajet et son retour ne seront plus proposés. » (décision utilisateur).
- Supprimer une règle ne restaure pas les trajets déjà écartés.
- Pas de création manuelle de règle depuis les Réglages.
- Aller-retour : jamais de calcul automatique quand la distance vient du GPS.
- Ne pas toucher : `domain/mileage/`, rapports et CSV, `historyView.js`, services géo, `trackImportService.js`, parseur GPX, calcul de distance de trace, coque Android.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/domain/tracks/personalRoutes.js` *(créé)* | Règle pure : construire une règle depuis une trace, dire si une trace correspond, partager une liste |
| `src/domain/models.js` | `createPersonalRoute` |
| `src/data/db.js` | `DB_VERSION = 3`, magasin `personalRoutes` |
| `src/data/repositories/index.js` | `personalRouteRepository` |
| `src/services/backup/backupService.js` | Sauvegarde, inspection, restauration, fusion |
| `src/ui/store.js` | `state.personalRoutes`, `savePersonalRoute`, `deletePersonalRoute` |
| `src/ui/components/swipeToDelete.js` *(créé)* | Geste de balayage, indépendant de l'écran |
| `src/ui/views/homeView.js` | Filtre, bouton « Trajet personnel », branchement du balayage |
| `src/ui/views/settingsView.js` + `index.html` | Bloc « Trajets personnels » |
| `src/ui/views/tripView.js` | Calcul lancé par la case aller-retour |
| `src/styles/base.css` | Styles du balayage |
| `tests/domain/personalRoutes.test.js` *(créé)* | Règle pure |
| `tests/services/backupAndCsv.test.js` | Sauvegarde et fusion des règles |

---

### Task 1: Règle de correspondance (domaine pur)

**Files:**
- Create: `src/domain/tracks/personalRoutes.js`
- Test: `tests/domain/personalRoutes.test.js`

**Interfaces:**
- Consumes: `haversineMeters([lat, lon], [lat, lon])` de `src/shared/polyline.js`
- Produces:
  - `PERSONAL_ROUTE_RADIUS_M = 200`
  - `routeFromTrack(track) → { a: {latitude, longitude, label}, b: {...} } | null`
  - `matchesPersonalRoute(track, route, radius?) → boolean`
  - `partitionByPersonalRoutes(tracks, routes, radius?) → { kept: Track[], personal: Track[] }`

- [ ] **Step 1: Écrire les tests en échec**

```js
// tests/domain/personalRoutes.test.js
import { describe, it, expect } from 'vitest';
import {
  PERSONAL_ROUTE_RADIUS_M,
  routeFromTrack,
  matchesPersonalRoute,
  partitionByPersonalRoutes,
} from '../../src/domain/tracks/personalRoutes.js';

// Lieux fictifs, ~1,1 km d'ecart en latitude.
const HOME = { latitude: 45.1, longitude: 5.1, label: 'Maison' };
const GYM = { latitude: 45.11, longitude: 5.1, label: 'Salle de sport' };
const WORK = { latitude: 45.2, longitude: 5.3, label: 'Bureau' };

const track = (start, end, id = 't') => ({ id, start, end, status: 'pending' });
// ~100 m au nord : dans le rayon.
const near = (p) => ({ ...p, latitude: p.latitude + 0.0009 });
// ~330 m au nord : hors rayon.
const far = (p) => ({ ...p, latitude: p.latitude + 0.003 });

describe('routeFromTrack', () => {
  it('reprend les deux extremites et leurs libelles', () => {
    const route = routeFromTrack(track(HOME, GYM));
    expect(route.a).toEqual({ latitude: 45.1, longitude: 5.1, label: 'Maison' });
    expect(route.b).toEqual({ latitude: 45.11, longitude: 5.1, label: 'Salle de sport' });
  });

  it('refuse une trace sans coordonnees exploitables', () => {
    expect(routeFromTrack(track(null, GYM))).toBeNull();
    expect(routeFromTrack(track({ latitude: NaN, longitude: 5 }, GYM))).toBeNull();
  });
});

describe('matchesPersonalRoute', () => {
  const route = routeFromTrack(track(HOME, GYM));

  it('reconnait le meme trajet', () => {
    expect(matchesPersonalRoute(track(HOME, GYM), route)).toBe(true);
  });

  it('reconnait le trajet retour avec la meme regle', () => {
    expect(matchesPersonalRoute(track(GYM, HOME), route)).toBe(true);
  });

  it('tolere un ecart GPS dans le rayon', () => {
    expect(matchesPersonalRoute(track(near(HOME), near(GYM)), route)).toBe(true);
  });

  it('ne reconnait pas un point hors rayon', () => {
    expect(matchesPersonalRoute(track(far(HOME), GYM), route)).toBe(false);
  });

  it('exige les DEUX extremites : un seul lieu commun ne suffit pas', () => {
    expect(matchesPersonalRoute(track(HOME, WORK), route)).toBe(false);
    expect(matchesPersonalRoute(track(WORK, GYM), route)).toBe(false);
  });

  it('ignore une regle supprimee', () => {
    const deleted = { ...route, deletedAt: '2026-09-16T10:00:00.000Z' };
    expect(matchesPersonalRoute(track(HOME, GYM), deleted)).toBe(false);
  });

  it('expose le rayon retenu', () => {
    expect(PERSONAL_ROUTE_RADIUS_M).toBe(200);
  });
});

describe('partitionByPersonalRoutes', () => {
  it('separe les trajets personnels des autres, sans perdre l’ordre', () => {
    const route = routeFromTrack(track(HOME, GYM));
    const tracks = [track(HOME, WORK, '1'), track(GYM, HOME, '2'), track(WORK, HOME, '3')];

    const { kept, personal } = partitionByPersonalRoutes(tracks, [route]);

    expect(kept.map((t) => t.id)).toEqual(['1', '3']);
    expect(personal.map((t) => t.id)).toEqual(['2']);
  });

  it('garde tout quand il n’y a aucune regle', () => {
    const tracks = [track(HOME, GYM, '1')];
    expect(partitionByPersonalRoutes(tracks, []).kept).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/domain/personalRoutes.test.js` → FAIL, module introuvable.

- [ ] **Step 3: Implémentation**

```js
// src/domain/tracks/personalRoutes.js
/**
 * Trajets personnels : trajets recurrents a ne jamais proposer a la validation.
 *
 * Une regle retient deux lieux. Une trace lui correspond quand ses deux
 * extremites tombent chacune pres d'un des deux lieux, dans un sens ou dans
 * l'autre : une seule regle couvre l'aller et le retour.
 *
 * Aucune dependance : ni DOM, ni IndexedDB, ni reseau.
 */

import { haversineMeters } from '../../shared/polyline.js';

/** Meme rayon que le rapprochement avec les lieux favoris. */
export const PERSONAL_ROUTE_RADIUS_M = 200;

/** Regle construite a partir d'une trace, ou null si ses extremites sont inexploitables. */
export function routeFromTrack(track) {
  const a = spot(track?.start);
  const b = spot(track?.end);
  if (!a || !b) return null;
  return { a, b };
}

export function matchesPersonalRoute(track, route, radius = PERSONAL_ROUTE_RADIUS_M) {
  if (!route || route.deletedAt) return false;
  const start = spot(track?.start);
  const end = spot(track?.end);
  if (!start || !end || !spot(route.a) || !spot(route.b)) return false;

  const near = (p, q) =>
    haversineMeters([p.latitude, p.longitude], [q.latitude, q.longitude]) <= radius;

  return (
    (near(start, route.a) && near(end, route.b)) || (near(start, route.b) && near(end, route.a))
  );
}

export function partitionByPersonalRoutes(tracks = [], routes = [], radius = PERSONAL_ROUTE_RADIUS_M) {
  const kept = [];
  const personal = [];
  for (const track of tracks) {
    const isPersonal = routes.some((route) => matchesPersonalRoute(track, route, radius));
    (isPersonal ? personal : kept).push(track);
  }
  return { kept, personal };
}

function spot(point) {
  if (!point) return null;
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, label: String(point.label || '') };
}
```

Note : `spot(null)` → `Number(undefined)` = NaN → null. `Number(null)` vaut 0, d'où le test explicite `if (!point)`.

- [ ] **Step 4: Vérifier le succès** — même commande → PASS.
- [ ] **Step 5: Commit** — `feat(tracks): match recurring personal routes in both directions`

---

### Task 2: Persistance, sauvegarde et fusion des règles

**Files:**
- Modify: `src/domain/models.js` (après `createFavoritePlace`)
- Modify: `src/data/db.js` (`STORES`, `DB_VERSION`, `onupgradeneeded`)
- Modify: `src/data/repositories/index.js`
- Modify: `src/services/backup/backupService.js`
- Test: `tests/services/backupAndCsv.test.js`

**Interfaces:**
- Produces: `createPersonalRoute(input)`, `STORES.PERSONAL_ROUTES = 'personalRoutes'`, `personalRouteRepository` (API `createRepository`), clé `personalRoutes` dans le fichier de sauvegarde, `inspectBackup(...).counts.personalRoutes` (`null` si le fichier est muet).

- [ ] **Step 1: Tests en échec** — ajouter à `tests/services/backupAndCsv.test.js`, importer `personalRouteRepository` :

```js
describe('trajets personnels dans la sauvegarde', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const regle = (overrides = {}) => ({
    a: { latitude: 45.1, longitude: 5.1, label: 'Maison' },
    b: { latitude: 45.11, longitude: 5.1, label: 'Salle de sport' },
    ...overrides,
  });

  it('les emporte et les restaure', async () => {
    const origine = await personalRouteRepository.save(regle());
    const backup = await buildBackup({ appVersion: '0.13.0' });
    expect(backup.personalRoutes).toHaveLength(1);

    await personalRouteRepository.clear();
    await restoreBackup(backup);

    const [restauree] = await personalRouteRepository.list();
    expect(restauree.id).toBe(origine.id);
    expect(restauree.b.label).toBe('Salle de sport');
  });

  it('ne les efface pas quand le fichier n’en parle pas', async () => {
    await personalRouteRepository.save(regle());
    const backup = await buildBackup({ appVersion: '0.12.0' });
    delete backup.personalRoutes;

    await restoreBackup(backup);

    expect(await personalRouteRepository.list()).toHaveLength(1);
    expect(inspectBackup(backup).counts.personalRoutes).toBeNull();
  });

  it('propage par fusion une regle creee et une regle supprimee ailleurs', async () => {
    const gardee = await personalRouteRepository.save(regle());
    const supprimee = await personalRouteRepository.save(regle({ a: { latitude: 45.3, longitude: 5.3, label: 'Ecole' } }));
    await personalRouteRepository.remove(supprimee.id);
    const backup = await buildBackup({ appVersion: '0.13.0' });

    await resetDatabase();
    const counts = await mergeBackup(backup);

    expect(counts.personalRoutes.added).toBe(2);
    const actives = await personalRouteRepository.list();
    expect(actives.map((r) => r.id)).toEqual([gardee.id]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/services/backupAndCsv.test.js` → FAIL (`personalRouteRepository` non exporté).

- [ ] **Step 3: Implémentation**

`src/domain/models.js`, après `createFavoritePlace` :

```js
/* ------------------------------------------------------------------ */
/* Trajet personnel                                                    */
/* ------------------------------------------------------------------ */

/**
 * Deux lieux entre lesquels un trajet n'est jamais professionnel. La regle de
 * correspondance vit dans domain/tracks/personalRoutes.js ; ce modele ne fait
 * que normaliser ce qui est stocke.
 */
export function createPersonalRoute(input = {}) {
  return withMeta(
    {
      a: routeSpot(input.a),
      b: routeSpot(input.b),
    },
    input,
    'route',
  );
}

function routeSpot(spot) {
  return {
    latitude: num(spot?.latitude),
    longitude: num(spot?.longitude),
    label: str(spot?.label),
  };
}
```

`src/data/db.js` : `DB_VERSION = 3` ; ajouter `PERSONAL_ROUTES: 'personalRoutes'` à `STORES` ; dans `onupgradeneeded`, après le bloc `from < 2` :

```js
      // Version 3 : trajets personnels a ne jamais proposer. Ajout pur, comme
      // la version 2 : les donnees existantes ne sont pas touchees.
      if (from < 3) {
        createStore(db, STORES.PERSONAL_ROUTES);
      }
```

`src/data/repositories/index.js` : importer `createPersonalRoute` et ajouter

```js
/** Trajets personnels : couples de lieux dont les traces sont ecartees d'office. */
export const personalRouteRepository = createRepository(STORES.PERSONAL_ROUTES, createPersonalRoute);
```

`src/services/backup/backupService.js` :
- importer `personalRouteRepository` ;
- `buildBackup` : lire `personalRouteRepository.list({ includeDeleted: true })` et exporter `personalRoutes` ;
- `inspectBackup` (format courant et legacy) : `personalRoutes: Array.isArray(data.personalRoutes) ? data.personalRoutes.length : null` (legacy : `null`) ;
- `MERGEABLE` : ajouter `personalRoutes: personalRouteRepository` ;
- `restoreBackup`, après le bloc des traces :

```js
  // Meme prudence que pour les traces : un fichier anterieur aux trajets
  // personnels ne dit pas « aucune regle », il ne dit rien.
  if (Array.isArray(payload.personalRoutes)) {
    await personalRouteRepository.clear();
    await personalRouteRepository.saveMany(payload.personalRoutes);
  }
```

- [ ] **Step 4: Vérifier le succès** — `npm test` → tout PASS (y compris les tests existants de sauvegarde).
- [ ] **Step 5: Commit** — `feat(data): store personal routes and carry them in backups`

---

### Task 2bis: Une trace supprimée devient une marque vide

**Files:**
- Modify: `src/domain/models.js` (`createTrack`)
- Modify: `src/ui/views/homeView.js` (écritures de suppression, passe de nettoyage)
- Test: tests du modèle existants et `tests/services/backupAndCsv.test.js`

**Interfaces:**
- Produces: `createTrack({ ...trace, deletedAt })` → `{ id, createdAt, updatedAt, deletedAt, source: '', fileName: '', startedAt: '', endedAt: '', distanceMeters: 0, rawDistanceMeters: 0, quality: null, start: null, end: null, geometry: [], status: 'ignored', tripId: null }`.

- [ ] **Step 1: Tests en échec**

```js
it('ne garde rien d’une trace supprimee, hormis de quoi propager la suppression', () => {
  const trace = createTrack({
    id: 'track_1',
    fileName: 'session.gpx',
    startedAt: '2026-09-15T08:00:00.000Z',
    endedAt: '2026-09-15T08:20:00.000Z',
    distanceMeters: 5000,
    start: { latitude: 45.1, longitude: 5.1, label: 'Maison' },
    end: { latitude: 45.11, longitude: 5.1, label: 'Salle de sport' },
    geometry: [[45.1, 5.1], [45.11, 5.1]],
    deletedAt: '2026-09-16T10:00:00.000Z',
  });

  expect(trace.id).toBe('track_1');
  expect(trace.deletedAt).toBe('2026-09-16T10:00:00.000Z');
  expect(trace.start).toBeNull();
  expect(trace.end).toBeNull();
  expect(trace.geometry).toEqual([]);
  expect(trace.fileName).toBe('');
  expect(trace.startedAt).toBe('');
  expect(trace.distanceMeters).toBe(0);
  expect(JSON.stringify(trace)).not.toContain('Maison');
});

it('vide aussi une ancienne trace ignoree', () => {
  const trace = createTrack({
    status: 'ignored',
    start: { latitude: 45.1, longitude: 5.1, label: 'Maison' },
    startedAt: '2026-09-15T08:00:00.000Z',
  });
  expect(trace.start).toBeNull();
  expect(trace.startedAt).toBe('');
  expect(trace.deletedAt).not.toBeNull();
});
```

Sauvegarde (R19) : trace supprimée sur l'appareil A, encore en attente sur B → après fusion de A dans B, `trackRepository.list()` ne la renvoie plus.

- [ ] **Step 2: Vérifier l'échec.**

- [ ] **Step 3: Implémentation** — en tête de `createTrack` :

```js
  /*
   * Trace supprimee : il n'en reste qu'une marque. Ni trace, ni lieux, ni
   * horaires — rien qui dise ou l'on etait. Les metadonnees suffisent a
   * propager la suppression a l'autre appareil lors d'une fusion ; sans elles,
   * la fusion prendrait la trace de l'autre appareil pour une nouvelle et la
   * ferait revenir. Les traces ignorees avant cette regle sont videes de meme.
   */
  if (input.deletedAt || input.status === 'ignored') {
    return withMeta(
      {
        source: '',
        fileName: '',
        startedAt: '',
        endedAt: '',
        distanceMeters: 0,
        rawDistanceMeters: 0,
        quality: null,
        start: null,
        end: null,
        geometry: [],
        status: 'ignored',
        tripId: null,
      },
      { ...input, deletedAt: input.deletedAt || nowIso() },
      'track',
    );
  }
```

Toutes les suppressions de `homeView` écrivent `trackRepository.save({ ...track, deletedAt: nowIso() })`. Au chargement de l'écran, une passe relit les traces avec `includeDeleted: true` et réécrit celles au statut `ignored` qui portent encore `start`, `end` ou `startedAt`.

- [ ] **Step 4: Fusion propre aux traces** — dans `backupService.js`, `MERGEABLE` n'inclut plus `tracks` ; `mergeBackup` appelle à la place `mergeTracks(data.tracks, data.exportedAt)` :

```js
/**
 * Traces : meme fusion que les autres collections, plus la vie des marques de
 * suppression.
 *
 * Une marque n'existe que pour prevenir l'autre appareil. Des qu'il est
 * prevenu, elle n'a plus d'objet et disparait — decision de l'utilisateur :
 *  - l'appareil qui RECOIT une suppression retire la trace sans garder de marque ;
 *  - l'appareil qui l'a EMISE efface sa marque quand il recoit un fichier de
 *    l'autre cote, exporte apres la suppression, ou la trace n'existe plus.
 *
 * Une suppression l'emporte toujours sur une trace vivante : le renommage
 * automatique des extremites modifie `updatedAt` sans que personne ait voulu
 * annuler la suppression.
 *
 * Limite assumee : fusionner un fichier anterieur a la suppression, une fois
 * les marques effacees, fait revenir la trace.
 */
async function mergeTracks(incoming, exportedAt) {
  const counts = { added: 0, updated: 0, ignored: 0, purged: 0 };
  const records = Array.isArray(incoming) ? incoming.filter((record) => record?.id) : [];

  const local = new Map(
    (await trackRepository.list({ includeDeleted: true })).map((record) => [record.id, record]),
  );
  const remote = new Map(records.map((record) => [record.id, record]));
  const winners = [];

  for (const record of records) {
    const mine = local.get(record.id);

    if (record.deletedAt) {
      // Suppression recue : la trace part, et aucune marque ne reste ici.
      if (mine) {
        await trackRepository.remove(record.id, { hard: true });
        counts.purged += 1;
      } else {
        counts.ignored += 1;
      }
      continue;
    }

    if (!mine) {
      winners.push(record);
      counts.added += 1;
    } else if (mine.deletedAt) {
      // Deja supprimee ici : l'autre appareil n'a pas encore ete prevenu.
      counts.ignored += 1;
    } else if (String(record.updatedAt || '') > String(mine.updatedAt || '')) {
      winners.push(record);
      counts.updated += 1;
    } else {
      counts.ignored += 1;
    }
  }

  // Marques emises ici : l'autre appareil a-t-il traite la suppression ?
  // Seul un fichier exporte APRES elle peut le prouver, par l'absence de la trace.
  if (exportedAt) {
    for (const mine of local.values()) {
      if (!mine.deletedAt || remote.has(mine.id)) continue;
      if (String(exportedAt) > String(mine.deletedAt)) {
        await trackRepository.remove(mine.id, { hard: true });
        counts.purged += 1;
      }
    }
  }

  if (winners.length) await trackRepository.saveMany(winners);
  return counts;
}
```

Tests à ajouter dans `tests/services/backupAndCsv.test.js` (R19 à R22), en simulant les deux appareils par `buildBackup` / `resetDatabase` / `mergeBackup` :

```js
describe('marques de suppression des traces', () => {
  const trace = (overrides = {}) => ({
    source: 'native',
    startedAt: '2026-09-15T08:00:00.000Z',
    endedAt: '2026-09-15T08:20:00.000Z',
    distanceMeters: 5000,
    start: { latitude: 45.1, longitude: 5.1, label: 'Maison' },
    end: { latitude: 45.11, longitude: 5.1, label: 'Salle de sport' },
    status: 'pending',
    ...overrides,
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  // R19
  it('retire la trace sur l’appareil qui recoit la suppression, sans garder de marque', async () => {
    const vivante = await trackRepository.save(trace());
    const fichierDeB = await buildBackup({ appVersion: 'test' }); // B : trace vivante

    // A : meme trace, supprimee.
    await trackRepository.save({ ...vivante, deletedAt: new Date(Date.now() + 1000).toISOString() });
    const fichierDeA = await buildBackup({ appVersion: 'test' });

    // Retour sur B, qui recoit la suppression.
    await resetDatabase();
    await mergeBackup(fichierDeB);
    await mergeBackup(fichierDeA);

    expect(await trackRepository.list({ includeDeleted: true })).toHaveLength(0);
  });

  // R20
  it('efface la marque d’origine quand l’autre appareil prouve l’avoir traitee', async () => {
    const vivante = await trackRepository.save(trace());
    await trackRepository.save({ ...vivante, deletedAt: '2026-09-16T10:00:00.000Z' });
    // Fichier de l'autre appareil, exporte apres la suppression, sans la trace.
    const fichierPosterieur = { format: 'agilmea-ik-backup', schemaVersion: 2, exportedAt: '2026-09-16T12:00:00.000Z', tracks: [] };

    await mergeBackup(fichierPosterieur);

    expect(await trackRepository.list({ includeDeleted: true })).toHaveLength(0);
  });

  // R21
  it('garde la marque tant que l’autre appareil n’a rien prouve', async () => {
    const vivante = await trackRepository.save(trace());
    await trackRepository.save({ ...vivante, deletedAt: '2026-09-16T10:00:00.000Z' });

    // Fichier anterieur a la suppression : il ne prouve rien.
    await mergeBackup({ format: 'agilmea-ik-backup', schemaVersion: 2, exportedAt: '2026-09-16T09:00:00.000Z', tracks: [] });
    expect(await trackRepository.list({ includeDeleted: true })).toHaveLength(1);

    // Fichier posterieur ou la trace est encore vivante : l'autre cote n'est pas prevenu.
    await mergeBackup({ format: 'agilmea-ik-backup', schemaVersion: 2, exportedAt: '2026-09-16T12:00:00.000Z', tracks: [{ ...vivante, updatedAt: '2026-09-16T11:00:00.000Z' }] });
    const [marque] = await trackRepository.list({ includeDeleted: true });
    expect(marque.deletedAt).toBeTruthy();
    expect(marque.start).toBeNull();
  });

  // R22
  it('ne ressuscite pas une trace supprimee meme si l’autre version est plus recente', async () => {
    const vivante = await trackRepository.save(trace());
    await trackRepository.save({ ...vivante, deletedAt: '2026-09-16T10:00:00.000Z' });

    await mergeBackup({ format: 'agilmea-ik-backup', schemaVersion: 2, exportedAt: '2026-09-16T08:00:00.000Z', tracks: [{ ...vivante, updatedAt: '2026-09-17T00:00:00.000Z' }] });

    expect(await trackRepository.list()).toHaveLength(0);
  });
});
```

Adapter le test de fusion existant qui attend `counts.tracks` sans `purged` si nécessaire (vérifier à l'exécution).

- [ ] **Step 5: Vérifier le succès** — `npm test` → PASS.
- [ ] **Step 6: Commit** — `fix(tracks): keep only a tombstone of a discarded track, purged once both sides merged`

---

### Task 3: Écarter les trajets personnels et bouton « Trajet personnel »

**Files:**
- Modify: `src/ui/store.js`
- Modify: `src/ui/views/homeView.js` (`refresh`, `renderDetails`, `ignore`)
- Modify: `src/styles/base.css`

**Interfaces:**
- Consumes: `routeFromTrack`, `partitionByPersonalRoutes` (Task 1) ; `personalRouteRepository` (Task 2).
- Produces: `store.state.personalRoutes`, `store.savePersonalRoute(input)`, `store.deletePersonalRoute(id)`.

- [ ] **Step 1: Store** — dans `state`, `personalRoutes: []` ; dans `load()`, lire `personalRouteRepository.list()` en parallèle et l'affecter ; ajouter, sur le modèle de `saveFavoritePlace` / `deleteFavoritePlace` :

```js
  async function savePersonalRoute(input) {
    const saved = await personalRouteRepository.save(input);
    await load();
    return saved;
  }

  async function deletePersonalRoute(id) {
    await personalRouteRepository.remove(id);
    await load();
  }
```

et les exporter dans le `return`.

- [ ] **Step 2: Filtre dans `refresh()`** — après le rapprochement des favoris :

```js
    // Trajets personnels : ecartes ici, point de passage de toute trace en
    // attente — enregistrement Android, import GPX ou restauration. Une regle
    // creee a l'instant retire donc aussi ceux deja dans la liste.
    const routes = await personalRouteRepository.list();
    const { kept, personal } = partitionByPersonalRoutes(tracks, routes);
    for (const track of personal) {
      await trackRepository.save({ ...track, deletedAt: nowIso() });
    }
    tracks = kept;
```

- [ ] **Step 3: Bouton** — dans `renderDetails`, après la rangée `Compléter / Ignorer` :

```js
      el('button', {
        class: 'wide',
        text: 'Trajet personnel',
        onClick: () => markPersonal(track),
      }),
      el('p', { class: 'hint center', text: 'Ce trajet et son retour ne seront plus proposés.' }),
```

et l'action :

```js
  async function markPersonal(track) {
    const route = routeFromTrack(track);
    if (!route) {
      setStatus('Lieux de départ ou d’arrivée inconnus : ce trajet ne peut pas être mémorisé.', 'bad');
      return;
    }
    await store.savePersonalRoute(route);
    expanded.delete(track.id);
    // refresh() ecarte ce trajet ET tous ceux deja en attente sur le meme parcours.
    await refresh();
    onChanged();
    setStatus('Trajet personnel mémorisé. Retrouve-le dans Réglages.', 'good');
  }
```

- [ ] **Step 4: `ignore` sans confirmation optionnelle** — signature `ignore(track, { confirm = true } = {})`, la boîte n'apparaît que si `confirm` ; l'écriture devient `trackRepository.save({ ...track, deletedAt: nowIso() })` (marque vide, Task 2bis).

- [ ] **Step 5: CSS** — `.hint.center { text-align: center; margin: 4px 0 0; }` si la classe n'existe pas déjà.

- [ ] **Step 6: Vérifier** — `npm run check` → PASS. Vérification navigateur en Gate 4 (R5 à R8).
- [ ] **Step 7: Commit** — `feat(tracks): set a trip aside as personal, and skip its matches`

---

### Task 4: Balayer pour supprimer

**Files:**
- Create: `src/ui/components/swipeToDelete.js`
- Modify: `src/ui/views/homeView.js` (`renderTrack`)
- Modify: `src/styles/base.css`

**Interfaces:**
- Produces: `attachSwipeToDelete(card, { onDelete }) → HTMLElement` (renvoie l'enveloppe à insérer à la place de la carte).

- [ ] **Step 1: Composant**

```js
// src/ui/components/swipeToDelete.js
/**
 * Balayer une carte vers la droite decouvre une poubelle ; l'appui dessus
 * supprime. Comme dans Gmail, deux gestes volontaires tiennent lieu de
 * confirmation.
 *
 * Le geste n'est retenu que s'il est nettement horizontal : faire defiler la
 * liste ne doit jamais ouvrir une carte.
 */

import { el } from '../dom.js';

const REVEAL_PX = 76;
const DECIDE_PX = 10;

/** Une seule carte ouverte a la fois, comme dans les listes natives. */
let openRow = null;

export function attachSwipeToDelete(card, { onDelete }) {
  const trash = el('button', {
    class: 'swipe-trash',
    type: 'button',
    'aria-label': 'Supprimer ce trajet',
    text: '🗑',
    onClick: () => onDelete(),
  });
  const row = el('div', { class: 'swipe-row' }, [trash, card]);

  let startX = 0;
  let startY = 0;
  let offset = 0;
  let base = 0;
  let mode = null; // null | 'swipe' | 'scroll'
  let dragged = false;

  function setOffset(px, animate) {
    offset = Math.max(0, Math.min(REVEAL_PX, px));
    card.style.transition = animate ? 'transform 160ms ease' : 'none';
    card.style.transform = offset ? `translateX(${offset}px)` : '';
    trash.tabIndex = offset === REVEAL_PX ? 0 : -1;
  }

  function close() {
    setOffset(0, true);
    if (openRow === api) openRow = null;
  }

  const api = { close };

  card.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    base = offset;
    mode = null;
    dragged = false;
  });

  card.addEventListener('pointermove', (event) => {
    if (mode === 'scroll') return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (mode === null) {
      if (Math.abs(dy) > DECIDE_PX && Math.abs(dy) >= Math.abs(dx)) {
        mode = 'scroll';
        return;
      }
      if (Math.abs(dx) < DECIDE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      mode = 'swipe';
      card.setPointerCapture?.(event.pointerId);
      if (openRow && openRow !== api) openRow.close();
    }

    dragged = true;
    setOffset(base + dx, false);
  });

  const finish = () => {
    if (mode !== 'swipe') return;
    mode = null;
    if (offset > REVEAL_PX / 2) {
      setOffset(REVEAL_PX, true);
      openRow = api;
    } else {
      close();
    }
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', finish);

  // Un balayage se termine sur un « click » : il ne doit pas deplier la carte.
  // Une carte ouverte se referme au lieu de se deplier.
  card.addEventListener(
    'click',
    (event) => {
      if (dragged || offset > 0) {
        event.stopPropagation();
        event.preventDefault();
        dragged = false;
        if (offset > 0 && !event.target.closest('.swipe-trash')) close();
      }
    },
    true,
  );

  setOffset(0, false);
  return row;
}
```

- [ ] **Step 2: Branchement dans `renderTrack`** — remplacer `return card;` par :

```js
    // Balayer ne sert qu'a la suppression rapide : une carte depliee se
    // manipule par ses boutons, le geste y generait des ouvertures fortuites.
    if (isOpen) return card;
    return attachSwipeToDelete(card, { onDelete: () => ignore(track, { confirm: false }) });
```

- [ ] **Step 3: CSS**

```css
.swipe-row {
  position: relative;
  margin-bottom: 9px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--danger, #b91c1c);
}

.swipe-row > .trip-card {
  margin-bottom: 0;
  position: relative;
  touch-action: pan-y;
  will-change: transform;
}

.swipe-trash {
  position: absolute;
  inset: 0 auto 0 0;
  width: 76px;
  border: 0;
  background: none;
  color: #fff;
  font-size: 1.5rem;
  cursor: pointer;
}
```

La couleur de fond reprend la variable danger existante si elle est définie (à vérifier dans `base.css` à l'exécution ; sinon `#b91c1c`).

- [ ] **Step 4: Vérifier** — `npm run check` → PASS ; Gate 4 R1 à R4.
- [ ] **Step 5: Commit** — `feat(tracks): swipe a pending trip right to delete it`

---

### Task 5: Bloc « Trajets personnels » dans les Réglages

**Files:**
- Modify: `index.html` (après la carte « Lieux favoris »)
- Modify: `src/ui/views/settingsView.js`

- [ ] **Step 1: Markup**

```html
        <div class="card">
          <div class="section-head">
            <h2>Trajets personnels</h2>
          </div>
          <p class="hint">
            Trajets jamais proposés à la validation, dans un sens comme dans l’autre. On en ajoute
            un depuis « À valider », avec le bouton « Trajet personnel ».
          </p>
          <div id="personalRoutesList"></div>
        </div>
```

- [ ] **Step 2: Liste et suppression** — dans `settingsView.js` :

```js
  function refreshPersonalRoutes() {
    const container = byId('personalRoutesList');
    container.replaceChildren();

    if (!store.state.personalRoutes.length) {
      container.append(el('p', { class: 'hint', text: 'Aucun trajet personnel.' }));
      return;
    }

    for (const route of store.state.personalRoutes) {
      container.append(
        el('div', { class: 'settings-item' }, [
          el('div', { class: 'settings-item-main' }, [
            el('strong', { text: `${spotName(route.a)} ↔ ${spotName(route.b)}` }),
          ]),
          el('div', { class: 'item-actions' }, [
            el('button', {
              class: 'danger',
              text: 'Suppr.',
              dataset: { action: 'delete-route', id: route.id },
            }),
          ]),
        ]),
      );
    }
  }

  function spotName(spot) {
    return spot?.label || `${spot.latitude.toFixed(4)}, ${spot.longitude.toFixed(4)}`;
  }

  async function removePersonalRoute(id) {
    if (!window.confirm('Supprimer ce trajet personnel ? Les trajets déjà écartés ne reviendront pas.')) return;
    await store.deletePersonalRoute(id);
    onChanged();
  }
```

Dans le délégué : `if (action === 'delete-route') await removePersonalRoute(id);` ; dans `refresh()`, appeler `refreshPersonalRoutes()` à côté de `refreshPlaces()`.

- [ ] **Step 3: Vérifier** — `npm run check` → PASS ; Gate 4 R9, R10.
- [ ] **Step 4: Commit** — `feat(settings): list and remove personal routes`

---

### Task 6: La case aller-retour lance le calcul

**Files:**
- Modify: `src/ui/views/tripView.js`

- [ ] **Step 1: Mémoriser l'origine GPS** — variable `let measuredByGps = false;` à côté de `draftTrackId` ; `true` dans `loadDraft` ; `Boolean(trip.distanceSource === 'gps')` dans `edit` et `duplicate` ; `false` dans `reset`.

- [ ] **Step 2: Gestionnaire**

```js
  // Aller-retour : si la distance aller est connue, un simple facteur suffit,
  // sans reseau. Sinon on lance le calcul — cocher la case sans avoir clique
  // « Calculer » ne produisait rien.
  fields.roundTrip.addEventListener('change', () => {
    if (lastOneWayKm === null) {
      // Une distance mesuree par le GPS est la reference : un itineraire
      // theorique ne doit pas l'ecraser.
      if (measuredByGps) return;
      if (!fields.from.value.trim() || !fields.to.value.trim()) return;
      calculateDistance();
      return;
    }
    const km = fields.roundTrip.checked ? lastOneWayKm * 2 : lastOneWayKm;
    fields.km.value = formatDecimalInput(Math.round(km * 10) / 10, 1);
    const sens = fields.roundTrip.checked ? 'Aller-retour' : 'Aller simple';
    showStatus(`${sens} · ${itineraryLabel(fields.routePreference.value)} : ${formatKm(km)}`, 'good');
  });
```

- [ ] **Step 3: Vérifier** — `npm run check` → PASS ; Gate 4 R11 à R14.
- [ ] **Step 4: Commit** — `feat(trip): compute the distance when round trip is ticked`

---

### Task 7: Changelog

- [ ] Ajouter sous `## [Non publié]` : Ajouté (balayage, trajets personnels), Modifié (aller-retour). Commit `docs: note pending-trip changes`.

---

## Cahier de recettes

> Scénarios de test à dérouler en Gate 4. Définis AVANT le code, pas après. Données fictives uniquement.

| # | Scénario | Mode | Entrée / contexte | Action | Résultat attendu | Critère de succès |
|---|---|---|---|---|---|---|
| R1 | Balayage révèle la poubelle | Playwright (pointer events) | 3 traces en attente, cartes repliées | Glisser la 1re carte de 100 px vers la droite, relâcher | Carte décalée, poubelle visible | `transform` = `translateX(76px)`, bouton `.swipe-trash` présent |
| R2 | Appui sur la poubelle supprime sans confirmation | Playwright + IndexedDB | Carte ouverte (R1) | Appuyer sur la poubelle | Carte retirée, aucune boîte `confirm` | 2 cartes restantes ; en base, l'enregistrement ne contient plus que `id`, dates et `deletedAt` : aucun lieu, libellé, horaire ni distance ; `window.confirm` non appelé |
| R3 | Balayage court se referme | Playwright | Carte repliée | Glisser de 30 px, relâcher | Carte revenue à sa place | `transform` vide, trace toujours `pending` |
| R4 | Défilement vertical n'ouvre rien, un balayage ne déplie pas | Playwright | Carte repliée | a) glisser 5 px à droite / 60 px vers le bas ; b) balayage complet | a) aucune ouverture ; b) détails non affichés | a) `transform` vide ; b) pas de `.trip-details` dans la carte |
| R5 | « Trajet personnel » écarte l'aller ET le retour, pas les autres | Playwright + IndexedDB | 3 trajets en attente : Maison → Salle de sport, Salle de sport → Maison, Maison → Client Dupont | Déplier le 1er, appuyer « Trajet personnel » | Les deux trajets de salle de sport disparaissent, celui du client reste | 1 carte (Client Dupont) ; les 2 autres réduits à une marque vide ; 1 règle « Maison ↔ Salle de sport » en base |
| R6 | Un trajet arrivé plus tard est écarté d'office | combined | Règle Maison ↔ Salle de sport existante | Enregistrer en base un trajet Salle de sport → Maison en attente, rafraîchir | Absent de la liste, badge non incrémenté | Marque vide en base ; badge = nombre de trajets restants |
| R7 | Un seul lieu commun ne suffit pas | Unitaire (Task 1) + Playwright | Règle A↔B | Trace A→C | Trace proposée normalement | Carte visible, `pending` |
| R8 | Trace sans coordonnées | Unitaire | Extrémité nulle | `routeFromTrack` | Refus sans plantage | Renvoie `null` ; message d'erreur affiché, aucune règle créée |
| R9 | Bloc Réglages liste la règle | Playwright | Règle A↔B (libellés « Maison », « Salle de sport ») | Ouvrir Réglages | Ligne « Maison ↔ Salle de sport » | Texte exact présent dans `#personalRoutesList` |
| R10 | Supprimer une règle : le passé reste retiré, l'avenir est de nouveau proposé | combined | Règle Maison ↔ Salle de sport ; un trajet de salle de sport déjà retiré | Supprimer la règle (confirmer), puis ajouter un nouveau trajet Maison → Salle de sport | L'ancien ne revient pas ; le nouveau apparaît dans « À valider » | Ancien toujours marque vide ; nouveau visible ; règle marquée supprimée |
| R11 | Aller-retour sans calcul préalable lance le calcul | Playwright [appel réseau Valhalla, gratuit] | Départ et arrivée choisis, aucun calcul | Cocher « Aller-retour » | Distance aller-retour affichée | Champ km rempli ; statut commence par « Aller-retour » |
| R12 | Aller-retour après calcul : doublement sans réseau | Playwright | Calcul déjà fait (X km) | Cocher puis décocher | 2X puis X | Valeurs exactes, aucune nouvelle requête de routage |
| R13 | Trajet GPS : pas de calcul | Playwright | Formulaire ouvert via « Compléter » sur une trace (km GPS) | Cocher « Aller-retour » | Distance GPS inchangée | Champ km identique à la valeur GPS |
| R14 | Champs incomplets : rien ne se passe | Playwright | Arrivée vide | Cocher « Aller-retour » | Aucun calcul, aucune erreur | Champ km vide, pas de message d'erreur |
| R15 | Sauvegarde, restauration et fusion des règles | Unitaire (Task 2) | Règles actives et supprimées | build / restore / merge | Règles transportées, suppression propagée, fichier ancien sans effacement | Tests Task 2 verts |
| R16 | Montée de base v2 → v3 sans perte | combined | Base v2 remplie (trajets, traces, favoris) | Charger la nouvelle version | Données intactes, magasin `personalRoutes` créé | Mêmes comptes avant/après ; `db.version === 3` |
| R17 | Non-régression boutons existants | Playwright | Trajet en attente déplié | « Valider », « Compléter », « Ignorer » (avec confirmation) | Validation et complétion inchangées ; « Ignorer » demande confirmation puis laisse une marque vide | Trajet créé / formulaire pré-rempli / confirmation puis marque vide en base |
| R18 | Les anciennes traces ignorées sont vidées | combined | Trace `ignored` écrite avant la mise à jour, avec lieux et adresses | Ouvrir « À valider » | Plus aucune donnée de lieu | L'enregistrement ne contient plus ni `start`, ni `end`, ni `startedAt` |
| R19 | L'appareil qui reçoit la suppression ne garde rien | Unitaire (Task 2bis) | Trajet supprimé sur A, encore en attente sur B | Fusionner le fichier de A dans B | Le trajet disparaît de B | Sur B, aucun enregistrement, même avec `includeDeleted` |
| R20 | L'appareil d'origine efface sa marque une fois la preuve reçue | Unitaire (Task 2bis) | Marque sur A | Fusionner dans A un fichier de B exporté après la suppression, sans le trajet | Marque effacée | Sur A, aucun enregistrement, même avec `includeDeleted` |
| R21 | Pas de preuve, pas d'effacement | Unitaire (Task 2bis) | Marque sur A | Fusionner a) un fichier antérieur à la suppression ; b) un fichier postérieur où le trajet est encore vivant | Marque conservée dans les deux cas, trajet non réimporté | 1 enregistrement, `deletedAt` renseigné, `start` nul |
| R22 | Une suppression l'emporte sur une version plus récente | Unitaire (Task 2bis) | Marque sur A | Fusionner une version vivante datée après la suppression | Le trajet ne revient pas | `list()` vide |
