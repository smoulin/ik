# Agilmea IK

Application web progressive (PWA) française de suivi des frais kilométriques
professionnels : plusieurs structures, plusieurs véhicules, plusieurs modes de
calcul, rapports séparés.

**Toutes les données restent sur l'appareil.** Aucun compte, aucun serveur,
aucun traceur.

---

## Démarrage rapide

```bash
npm install
npm run dev
```

L'application est alors disponible sur <http://localhost:5173>. Les modifications
sont appliquées automatiquement.

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement avec rechargement à chaud |
| `npm test` | Tests automatisés (Vitest) |
| `npm run test:watch` | Tests en continu pendant le développement |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Sert le build de production localement |
| `npm run check` | Tests **puis** build — à lancer avant toute mise en production |
| `npm run release:patch` \| `:minor` \| `:major` | Prépare une version : tests, build, bump, CHANGELOG, commit, tag |

---

## Architecture

Quatre couches, avec une règle de dépendance stricte : `ui → services → domain`
et `ui → data → domain`. Le métier ne dépend de rien.

```
src/
├── domain/        Métier pur — aucun DOM, aucun réseau, aucun stockage
│   ├── models.js        entités et normalisation
│   ├── mileage/         barèmes et moteur de calcul des indemnités
│   └── reporting/       construction du modèle de rapport
│
├── data/          Persistance — seule couche qui connaît IndexedDB
│   ├── db.js            ouverture et transactions
│   ├── migrations.js    reprise des données v0.1.1 (localStorage)
│   └── repositories/    companyRepository, vehicleRepository, tripRepository,
│                        favoritePlaceRepository, beneficiaryRepository,
│                        settingsRepository, recentAddressRepository, geoCacheRepository
│
├── services/      Fournisseurs externes, derrière des interfaces
│   ├── geo/             GeocodingProvider · AutocompleteProvider · RoutingProvider
│   ├── backup/          sauvegarde et restauration JSON
│   ├── export/          export CSV
│   └── features.js      drapeaux de fonctionnalités (aucune limitation active)
│
├── ui/            Seule couche qui touche au DOM
└── pwa/           Service worker et gestion des mises à jour
```

### Changer de fournisseur géographique

Aucun fournisseur n'est nommé ailleurs que dans `src/services/geo/index.js`.
Pour en changer, écrire un module respectant le contrat décrit dans
`src/services/geo/types.js`, puis le déclarer dans ce seul fichier.

| Rôle | Fournisseur actuel | Repli |
| --- | --- | --- |
| Autocomplétion | API Adresse (BAN, `api-adresse.data.gouv.fr`) | Photon (Komoot) |
| Géocodage | API Adresse (BAN) | Nominatim (OpenStreetMap) |
| Itinéraire | OSRM (serveur public de démonstration) | — |

**Pourquoi la BAN et pas Nominatim pour l'autocomplétion :** la politique
d'usage de Nominatim interdit explicitement l'envoi d'une requête à chaque
frappe. L'API Adresse est au contraire conçue pour cet usage, ne demande aucune
clé ni carte bancaire, et renvoie directement les coordonnées.

> ⚠️ Le serveur OSRM utilisé est une instance publique de démonstration, sans
> garantie de service et destinée à un usage léger. Elle convient à une
> application personnelle ; elle devra être remplacée par une instance dédiée ou
> une offre commerciale si Agilmea IK est commercialisé.

---

## Workflow de développement

```
develop  ──►  tests  ──►  build  ──►  validation manuelle
                                          │
                                          ▼
                                merge vers main  ──►  tag  ──►  déploiement
```

- `develop` : branche de travail.
- `main` : branche de production. **Seul un push sur `main` déclenche un déploiement.**

```bash
git checkout develop
# … développement …
npm run check
npm run preview        # vérification du build de production

npm run release:minor  # tests, build, version, CHANGELOG, commit, tag

git checkout main
git merge --no-ff develop
git push origin main
git push origin v0.3.0
```

---

## Déploiement

Le build produit un dossier `dist/` statique, déployable tel quel sur GitHub
Pages, Cloudflare Pages, Netlify, Vercel ou un serveur web classique.

Le chemin de base est configurable sans toucher au code :

```bash
BASE_PATH=/agilmea-ik/ npm run build   # sous-dossier (GitHub Pages projet)
BASE_PATH=/ npm run build              # racine d'un domaine
npm run build                          # défaut : "./", fonctionne dans les deux cas
```

Sur GitHub, le workflow `.github/workflows/deploy.yml` lance les tests et le
build sur chaque push, et ne publie que depuis `main`. La variable de dépôt
`BASE_PATH` permet d'ajuster le chemin sans modifier le workflow.

---

## Données et vie privée

- Les trajets, structures, véhicules, lieux favoris et informations du
  bénéficiaire sont enregistrés **uniquement dans IndexedDB, sur l'appareil**.
- Les seules requêtes réseau sont les recherches d'adresses et les calculs
  d'itinéraire. Elles transmettent l'adresse recherchée au fournisseur concerné.
- Les adresses résolues sont mises en cache localement, ce qui réduit le nombre
  d'appels au fil de l'usage.
- **Aucune donnée personnelle ne doit être versionnée.** Les fichiers de
  sauvegarde et les exports CSV sont exclus par `.gitignore`.

La sauvegarde JSON (Réglages → Sauvegarde) est le seul moyen de transférer ou de
récupérer ses données. Elle est à faire régulièrement.

---

## Licences des dépendances

Toutes les dépendances de développement sont sous licence **MIT**, qui autorise
sans restriction un usage commercial et ne contamine pas le code du projet.

| Dépendance | Rôle | Licence |
| --- | --- | --- |
| `vite` | Serveur de développement et build | MIT |
| `vitest` | Tests | MIT |
| `fake-indexeddb` | IndexedDB en mémoire pour les tests | MIT |

L'application n'embarque **aucune dépendance à l'exécution** : le code livré est
entièrement écrit dans ce dépôt.

Les données d'adresses (BAN, OpenStreetMap) sont sous licence **ODbL** :
l'attribution est requise — elle figure dans Réglages → À propos — mais aucune
contrainte ne pèse sur le code de l'application.

**Le projet lui-même n'est placé sous aucune licence open source.** Tous droits
réservés. Ne pas en ajouter une sans accord explicite du propriétaire.

---

## Barèmes fiscaux

- **Barème kilométrique** : barème officiel Urssaf, appliqué sur le cumul annuel.
- **Barème carburant BIC** : dernier barème officiel publié (dépenses 2025,
  publié le 18/02/2026).

Le cumul annuel du barème kilométrique est apprécié **par structure, par
véhicule et par année civile**. Ce périmètre est défini à un seul endroit —
`IK_ACCUMULATION_SCOPE` dans `src/domain/mileage/engine.js` — et verrouillé par
un test.

Les valeurs des barèmes sont regroupées dans `src/domain/mileage/scales.js` et
protégées par des tests : leur modification doit être un acte délibéré.

> Agilmea IK est un outil de suivi, pas un conseil fiscal. La conformité du
> régime retenu est à valider avec un professionnel du chiffre.
