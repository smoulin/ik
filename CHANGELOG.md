# Changelog — Agilmea IK

Toutes les évolutions notables de l'application sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et le versionnement respecte [SemVer](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).
Tant que l'application est en développement initial, la version reste en `0.x.x`.

## [Non publié]

### Corrigé
- **« Annuler » n'exige plus de remplir le formulaire.** Dans les boîtes
  « Ajouter une structure », « Ajouter un véhicule » et « Ajouter un lieu
  favori », ce bouton était un bouton de soumission (le comportement par défaut
  d'un `<button>` dans un `<form>`) : le navigateur validait donc les champs
  obligatoires et affichait « Veuillez renseigner ce champ » au moment précis où
  l'utilisateur renonçait à saisir. Les trois boutons passent en
  `type="button"` et ferment la boîte explicitement.
- Effet de bord bienvenu : « Enregistrer » devient le bouton par défaut de
  chacune de ces boîtes. Auparavant, « Annuler » venant en premier dans le
  balisage, la touche Entrée visait le mauvais bouton.
- Rapport par structure : le titre de chaque bloc reprend le corps des autres
  titres de cartes, dont il était le seul à s'écarter.

## [0.8.0] — 2026-08-18

### Modifié
- **Onglets renommés d'après l'écran qu'ils ouvrent.** « Accueil » désignait une
  position et non la tâche : cet écran est la file des trajets GPS à valider, il
  s'appelle donc « À valider ». « Tous les trajets » devient « Historique », qui
  tient sur une seule ligne comme ses voisins.
- **Historique allégé** : les trois totaux tiennent sur une seule ligne, le motif
  du trajet est visible sans déplier, et un bouton « + » par journée ouvre le
  formulaire déjà daté — pratique pour saisir un trajet oublié sans avoir à
  rechercher la date.
- Le lien « Aujourd'hui » ne s'affiche que lorsqu'il change réellement la
  période : sur la période courante, cliquer ne produisait aucun effet et le
  faisait passer pour cassé.
- **Bénéficiaire replié et déplacé** après les lieux favoris dans les réglages :
  il se renseigne une fois et ne se touche plus.
- Rapports : les deux dates restent côte à côte, les boutons de période sur une
  seule ligne, et l'en-tête du rapport s'empile sur téléphone, où le nom de la
  structure écrasait le titre.
- Titres de cartes uniformisés — ils mélangeaient deux styles — et espacement
  des champs harmonisé.

### Supprimé
- Le bouton « Tout effacer » de l'historique, et avec lui `deleteAllTrips`. Une
  suppression massive de tous les trajets n'a pas sa place à portée de pouce ;
  la restauration d'une sauvegarde couvre déjà ce besoin.

### Corrigé
- **Les cartes passaient par-dessus la barre de navigation** au défilement : les
  couches Leaflet se placent au niveau 400 et le conteneur ne créait aucun
  contexte d'empilement, si bien qu'elles rivalisaient directement avec la barre.

## [0.7.0] — 2026-08-18

### Ajouté
- **Rapport toutes structures.** Le menu des structures propose « Toutes les
  structures », qui produit une synthèse : chaque trajet garde le barème de sa
  propre structure, une colonne indique qui rembourse, et des sous-totaux par
  structure figurent à l'écran comme sur le PDF.
  Le document est explicitement présenté comme une **synthèse** et non comme un
  état de frais : un remboursement s'adresse à une structure, et c'est elle qui
  doit figurer en en-tête. Un avertissement le rappelle avant l'impression.

## [0.6.0] — 2026-08-18

### Ajouté
- **Identité visuelle Agilmea.** Bleu marine profond, or et blanc, repris du
  logo : le monogramme figure dans l'en-tête, redessiné en vectoriel. Le bleu
  porte la structure et les actions, l'or ne sert que d'accent — un liseré, un
  état actif — jamais un aplat. Titres en capitales espacées, à l'image du
  mot-symbole. Icônes de l'application régénérées aux couleurs de la marque,
  par un script versionné (`npm run icons`).
- **Sélection de la période par jour, mois ou année** dans « Tous les trajets »,
  le mois restant la vue par défaut. Un bouton « Aujourd'hui » ramène à la
  période courante.

## [0.5.0] — 2026-08-18

### Ajouté
- **Enregistrement automatique des trajets par le GPS.** Une trace GPX produite
  par GPSLogger — déclenchée par la connexion Bluetooth du véhicule — s'importe
  dans l'application, qui en tire la distance **réellement parcourue**. C'est la
  seule source qui connaisse la route effectivement empruntée : aucun calcul
  d'itinéraire ne peut savoir que l'autoroute n'a pas été prise.
  Le fichier s'importe depuis l'écran d'accueil, ou se partage directement
  depuis GPSLogger vers Agilmea IK.
- **Reconnaissance des lieux favoris** : une extrémité de trace située à moins
  de 200 m d'un favori en reprend l'adresse. Un trajet Domicile → Bureau se
  nomme donc tout seul.
- **Filtrage du bruit GPS** : les positions trop imprécises, la dérive à l'arrêt
  et les sauts de position sont écartés. Sans cela, la distance est
  systématiquement surestimée. Le détail des points retenus et écartés est
  affiché avec chaque trace.
- **Nouvelle navigation à cinq entrées** : Accueil, Tous les trajets, un bouton
  d'ajout central, Rapports et Réglages.
- **Écran d'accueil** : les trajets enregistrés par le GPS y attendent d'être
  complétés, avec le montant estimé selon la structure choisie, puis validés en
  un geste. Un compteur signale ceux qui restent en attente.
- **Affectation par pastilles de structure** plutôt qu'une bascule
  personnel/professionnel : chaque structure garde ainsi son propre barème.
- **Vue mensuelle** dans « Tous les trajets », avec navigation mois par mois,
  trajets regroupés par jour et total journalier.
- **Trajets dépliables**, avec la carte du parcours. Elle n'est chargée qu'à
  l'ouverture d'un trajet : une carte par ligne enverrait les coordonnées de
  tous les trajets aux serveurs de tuiles à chaque affichage de l'historique.

### Modifié
- La base de données passe en version 2, par simple ajout du magasin des traces.
  Les données existantes sont conservées telles quelles.

### Corrigé
- Le bouton « Générer le rapport » n'est plus collé aux boutons de période.

## [0.4.0] — 2026-08-18

### Ajouté
- **Barème personnalisé par tranches.** Une structure peut désormais utiliser son
  propre barème : autant de tranches que nécessaire, chacune avec un taux au
  kilomètre et, si besoin, un forfait qui s'y ajoute — exactement la forme du
  barème officiel (« km × 0,357 + 1 395 »). Les tranches s'apprécient sur le
  cumul annuel, et un trajet à cheval sur deux tranches est calculé au taux
  marginal, sans cas particulier. Un aperçu du barème s'affiche pendant la
  saisie, et un barème incohérent est refusé plutôt que de produire des montants
  imprévisibles.
- Le rapport indique le barème appliqué, tranche par tranche.

### Corrigé
- **Code postal et ville vides après le choix d'une adresse déjà utilisée.**
  Les adresses proposées comme « récentes » étaient enregistrées sans localité,
  laissant ces deux champs vides dans le bénéficiaire, la structure et les lieux
  favoris. La localité est maintenant déduite du libellé lorsqu'elle manque, et
  les adresses récentes la conservent. Le champ « adresse » ne répète plus le
  code postal ni la ville, qui ont leurs propres champs.

### Modifié
- Le **SIREN** disparaît du formulaire de structure : le SIRET le contient déjà
  (ses neuf premiers chiffres). Le rapport n'affiche plus qu'un identifiant, et
  se rabat sur le SIREN si le SIRET n'est pas renseigné. Le SIRET est marqué
  facultatif.
- « Super sans plomb » devient « Essence sans plomb ».
- Le libellé « Itinéraire » disparaît au-dessus du sélecteur, redondant avec les
  options elles-mêmes.
- **« Dernier trajet » propose Modifier, Dupliquer et Supprimer**, comme
  l'historique : c'est le trajet qu'on vient de saisir, donc celui qu'on veut
  pouvoir corriger immédiatement.

## [0.3.0] — 2026-08-18

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
