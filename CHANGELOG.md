# Changelog — Agilmea IK

Toutes les évolutions notables de l'application sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et le versionnement respecte [SemVer](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).
Tant que l'application est en développement initial, la version reste en `0.x.x`.

## [Non publié]

## [0.2.0] — 2026-08-17

### Ajouté
- **Lieux favoris** : création, modification, suppression et recherche de lieux
  enregistrés (Domicile, Bureau, clients…), avec mémorisation des coordonnées
  géographiques pour éviter de refaire la même recherche.
- **Autocomplétion des adresses** sur le départ, la destination, l'adresse d'une
  structure, l'adresse du bénéficiaire et la création d'un lieu favori.
  Ordre des suggestions : favoris ★ → adresses récentes ↻ → fournisseur en ligne.
- **Adresse des structures** : raison sociale, SIREN, SIRET et adresse complète.
- **Bénéficiaire des remboursements** : prénom, nom et adresse postale complète.
- **Adresses récentes** : historique local des adresses utilisées, sans doublon.
- **Rapport imprimable repensé** : bénéficiaire en haut à gauche, structure en haut
  à droite, titre « État des frais kilométriques », période explicite, colonne
  Véhicule, totaux kilomètres et indemnités, rappel de la méthode de calcul,
  de la puissance fiscale et de l'année du barème.
- **Environnement de développement Vite** : `npm run dev`, `build`, `preview`,
  `test`, `check`.
- **Tests automatisés** (Vitest) sur le moteur fiscal, les dépôts de données,
  la migration, le modèle de rapport et le service d'autocomplétion.
- **Déploiement automatique** par GitHub Actions depuis la branche `main`.
- **Version affichée** dans Réglages → À propos, injectée depuis `package.json`.
- **Bandeau de mise à jour PWA** : « Une nouvelle version d'Agilmea IK est
  disponible » avec bouton *Mettre à jour*.
- Commandes de release `npm run release:patch` / `release:minor` / `release:major`.

### Modifié
- **Stockage migré de `localStorage` vers IndexedDB**, derrière une couche de dépôts
  (`companyRepository`, `vehicleRepository`, `tripRepository`,
  `favoritePlaceRepository`, `beneficiaryRepository`, `settingsRepository`…).
  La migration des données v0.1.1 est automatique et non destructive.
- **Architecture séparée en couches** : `domain` (métier pur), `data` (persistance),
  `services` (fournisseurs externes), `ui` (DOM). Le métier ne dépend d'aucun
  fournisseur : `GeocodingProvider`, `AutocompleteProvider` et `RoutingProvider`
  sont des interfaces remplaçables.
- Toutes les entités portent désormais `createdAt`, `updatedAt` et `deletedAt`,
  en préparation d'une éventuelle synchronisation future.
- Le géocodage privilégie les coordonnées déjà connues (favoris, adresses
  sélectionnées dans l'autocomplétion), ce qui supprime la plupart des appels réseau
  lors du calcul d'un trajet.

### Corrigé
- **Le service worker ne bloquait plus les mises à jour** : le nom du cache est
  désormais lié à la version, les anciens caches sont supprimés et l'utilisateur
  est averti qu'une nouvelle version est disponible.
- Le service worker ne renvoie plus la page HTML en réponse aux appels réseau
  des services d'adresses, ce qui produisait des messages d'erreur incompréhensibles.
- Le libellé du mode de calcul dans les réglages n'utilise plus arbitrairement
  le premier véhicule enregistré pour afficher un taux BIC.
- Suppression du délai d'attente inutile lorsque les deux adresses sont déjà connues.

### Inchangé (vérifié par des tests)
- Valeurs du barème kilométrique et du barème carburant BIC.
- Méthode de cumul annuel par **structure + véhicule + année**.
- Format de l'export CSV.
- Compatibilité de lecture des sauvegardes JSON produites par la v0.1.1.

## [0.1.1] — 2026-08-17

### Ajouté
- Version initiale : plusieurs structures, plusieurs véhicules, barème IK,
  barème carburant BIC, taux fixe, calcul routier, aller-retour, historique,
  rapports, export CSV, sauvegarde/restauration JSON, PWA installable.
