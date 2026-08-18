# Changelog — Agilmea IK

Toutes les évolutions notables de l'application sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et le versionnement respecte [SemVer](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).
Tant que l'application est en développement initial, la version reste en `0.x.x`.

## [Non publié]

### Ajouté
- **Choix de l'itinéraire** au calcul de la distance : « le plus rapide »,
  « sans autoroute » ou « sans péage ». L'itinéraire retenu est enregistré avec
  le trajet. Sur le parcours Châtenay → Grenoble, l'écart atteint 4,5 km entre
  l'option la plus courte et la plus longue — soit environ 2,90 € par trajet.
- **Carte du trajet, affichée à la demande** sur un bouton « Voir le trajet sur
  la carte ». Elle permet de vérifier par où passe réellement le calcul, ce qui
  était impossible jusqu'ici. Elle n'apparaît jamais automatiquement : afficher
  un fond cartographique transmet les coordonnées du trajet aux serveurs de
  tuiles, alors que le reste de l'application ne fait sortir que les adresses
  explicitement recherchées.

### Modifié
- **Le moteur d'itinéraire passe d'OSRM à Valhalla.** OSRM optimise uniquement
  le temps de parcours, emprunte donc systématiquement l'autoroute, refuse toute
  exclusion et ne propose aucune alternative. Valhalla est le seul fournisseur
  gratuit, sans clé ni carte bancaire, capable d'éviter autoroutes et péages.
  À savoir : ses distances sont supérieures d'environ 3 km à celles de
  ViaMichelin sur le trajet de référence, et **ses durées sont peu fiables hors
  autoroute** (1 h 37 annoncée pour un parcours réalisé en 51 min) — la durée
  n'est donc plus affichée, seule la distance l'est.
- Leaflet devient la première dépendance à l'exécution du projet, chargée
  uniquement à l'ouverture de la carte (150 Ko dans un fichier séparé, le socle
  de l'application restant à 70 Ko). Licence BSD 2-Clause, usage commercial libre.

## [0.2.0] — 2026-08-17

### Ajouté
- **Avertissement dans le rapport** lorsqu'un même véhicule sert au barème
  kilométrique pour plusieurs structures la même année : chacune repart alors de
  la première tranche, ce qui augmente le total indemnisé. Le comportement reste
  volontaire, mais il est désormais signalé au moment où le cas se produit.
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
- **Distance enregistrée à 0 km silencieusement.** Sur un clavier français,
  saisir « 10,5 » dans un champ `type="number"` vidait le champ : le trajet était
  enregistré à 0 km / 0 €. Les champs distance, taux personnalisé et coordonnées
  acceptent maintenant la virgule, et un champ vide, illisible ou à zéro est
  refusé explicitement au lieu d'être enregistré.
- **Injection de formule dans l'export CSV.** Un motif tel que « -50 % remise »
  ou « + frais de parking » était interprété comme une formule par Excel, qui
  affichait « #NOM? ». Les champs texte concernés sont désormais neutralisés ;
  les colonnes Date, Kilomètres et Montant restent des valeurs exploitables.
- Les taux s'affichent à la française — « 0,139 €/km » — à l'écran, dans le
  rapport et dans la colonne « Calcul » du CSV.
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
