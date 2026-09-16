# Backlog — Agilmea IK

Points relevés en revue et volontairement différés. Chaque entrée doit se
suffire à elle-même : une session future, sans le contexte de la discussion
d'origine, doit pouvoir comprendre, reproduire et corriger.

---

### [ ] 2026-09-08 — `findNearestPlace` vit dans un service de traces GPS alors qu'elle sert ailleurs

**Source** : revue de la v0.10.0, commit `feat(history): keep a day in entry order, and name a favourite place`
**Tags** : `tech-debt`
**Effort estimé** : XS

**Problème** : `findNearestPlace` est une fonction géographique pure — elle
cherche le lieu favori le plus proche d'un point — mais elle est exportée depuis
`trackImportService.js`, un service dédié à l'import de traces GPS. L'onglet
Historique doit donc importer un module de traces pour nommer une extrémité de
trajet, alors qu'il ne manipule aucune trace.

**Localisation** : définie dans
`src/services/tracks/trackImportService.js` (fonction `findNearestPlace` et la
constante `PLACE_MATCH_RADIUS_M`) ; consommée par `src/ui/views/historyView.js`
(fonction `matchFavorite`).

**Pourquoi c'est gênant** : la dépendance suggère un lien qui n'existe pas entre
l'historique et l'enregistrement GPS. Un futur lecteur cherchera pourquoi, et
un futur découpage des modules butera dessus.

**Pourquoi pas maintenant** : déplacer une fonction couverte par des tests
existants, pour un gain uniquement structurel, n'avait pas sa place dans une
livraison d'ergonomie demandée par l'utilisateur.

**Comment corriger** : déplacer `findNearestPlace` et `PLACE_MATCH_RADIUS_M`
vers un module de lieux — `src/domain/places.js` conviendrait — et faire
pointer les deux consommateurs vers lui. Écueil : `tests/services/trackImport.test.js`
importe ces deux symboles depuis le service, il faudra mettre à jour ses imports.

**Validation** : `npm run check` reste vert, et
`grep -r "services/tracks" src/ui/views/historyView.js` ne renvoie plus rien.

---

### [ ] 2026-09-01 — Deux exports CSV « toutes dates » portent le même nom de fichier

**Source** : revue de la v0.9.0, commit `fix(report): never stamp a report with the day it was printed`
**Tags** : `ux`
**Effort estimé** : XS

**Problème** : `csvFileName()` compose le nom à partir de la période couverte
par le rapport. Quand le rapport n'a pas de borne de début — cas d'un rapport
« toutes les dates » — le nom se réduit à `agilmea-ik-<structure>.csv`. Deux
exports successifs produisent alors le même nom, et le navigateur ajoute
« (1) », « (2) ». Auparavant le nom retombait sur la date du jour, ce qui les
distinguait.

**Localisation** : `src/services/export/csvExport.js:90-100`, fonction
`csvFileName`.

**Pourquoi c'est gênant** : dans un dossier de téléchargements, l'utilisateur ne
distingue plus deux exports d'états différents autrement que par leur date de
fichier. Le désagrément reste faible : un rapport a presque toujours une
période.

**Pourquoi pas maintenant** : la date du jour a été retirée délibérément, à la
demande explicite de l'utilisateur — « Les rapports ne doivent jamais mentionner
la date d'édition du rapport ». La remettre dans le nom de fichier
contredirait la consigne. Il faut donc un autre discriminant, et ce choix lui
appartient.

**Comment corriger** : proposer un discriminant qui ne soit pas une date
d'édition — par exemple la borne de fin quand elle existe, ou le nombre de
trajets (`agilmea-ik-apprima-42-trajets.csv`). Écueil : ne pas réintroduire
`new Date()` dans ce fichier, un test le vérifiera mal car il ne teste que le
cas avec période.

**Validation** : `csvFileName({ period: {} }, { companyName: 'Apprima' })` doit
renvoyer un nom qui diffère entre deux rapports de contenus différents, et ne
doit contenir aucune date du jour.

---

### [x] 2026-09-01 — Rendu visuel de la boîte « Importer une sauvegarde » non vérifié

**Résolu le 01/09/2026, v0.9.1.** La vérification différée a effectivement
révélé deux défauts, signalés par l'utilisateur sur une copie d'écran : un nœud
de texte « null » et un en-tête collé qui recouvrait la première ligne. Les deux
sont corrigés, et la mise en page est désormais mesurée — boutons de largeur
égale, titre non chevauché, aucun débordement. Ce report avait un coût : les
deux défauts sont partis en production.



**Source** : revue de la v0.9.0, commit `feat(backup): merge two devices instead of overwriting one`
**Tags** : `ux`
**Effort estimé** : XS

**Problème** : la nouvelle boîte de dialogue proposant « Fusionner » /
« Remplacer » a été vérifiée sur sa structure et son comportement — trois
issues, résumé du fichier correct, fermeture par la croix sans écriture — mais
pas sur sa mise en page. La mesure était impossible : le volet navigateur était
masqué au moment du contrôle, `window.innerWidth` valait 0 et toutes les
géométries étaient dégénérées.

**Localisation** : `src/ui/views/settingsView.js`, fonction `askImportMode`.

**Pourquoi c'est gênant** : un bouton mal dimensionné sur un écran de téléphone
rendrait le choix difficile à faire, sur une opération qui peut effacer des
données. Le risque reste faible : la boîte réutilise `button.wide` et
`.recorder-setup`, tous deux déjà mesurés corrects ailleurs.

**Pourquoi pas maintenant** : dépend d'un volet navigateur affiché, ou d'un
essai sur le téléphone.

**Comment corriger** : ouvrir la boîte à 375 px de large et vérifier que les
boutons « Fusionner » et « Remplacer » occupent toute la largeur utile, que le
titre n'est pas chevauché par la croix, et que rien ne déborde
horizontalement.

**Validation** : les deux boutons ont la même largeur, égale à celle du
conteneur moins ses marges, et `document.documentElement.scrollWidth` ne dépasse
pas `clientWidth`.

---

### [ ] 2026-09-01 — Icône et écran de démarrage Android encore ceux de Capacitor

**Source** : décision de l'utilisateur du 01/09/2026 — « pour le 3) l'icône on va attendre »
**Tags** : `ux`
**Effort estimé** : S

**Problème** : l'icône de lanceur Android est celle du gabarit Capacitor, sur
fond blanc, jamais remplacée depuis la génération du projet. L'écran de
démarrage l'est également. Le monogramme Agilmea existe pourtant, et un script
le décline déjà pour le web.

**Localisation** : `android/app/src/main/res/mipmap-*/ic_launcher*.png`,
`android/app/src/main/res/drawable*/splash.png`,
`android/app/src/main/res/values/ic_launcher_background.xml`. Script existant :
`scripts/generate-icons.mjs`.

**Pourquoi c'est gênant** : c'est ce que l'utilisateur voit plusieurs fois par
jour sur son écran d'accueil, et ce qui identifiera l'application si elle est un
jour distribuée.

**Pourquoi pas maintenant** : différé explicitement par l'utilisateur, au profit
de corrections fonctionnelles.

**Comment corriger** : étendre `scripts/generate-icons.mjs` pour produire les
densités Android (mdpi à xxxhdpi), l'icône adaptative (premier plan + couleur de
fond de la marque, `#1b2a4a`) et les images de démarrage. Écueil : `npx cap
sync` ne régénère pas les icônes, il faut écrire dans `res/` puis reconstruire.

**Validation** : l'icône du lanceur sur le téléphone montre le monogramme
Agilmea, et `aapt2 dump badging` liste bien les densités attendues.

---

### [ ] 2026-09-09 — Les coordonnées d'une suggestion sont perdues dès qu'on retouche le champ

**Source** : revue de la v0.12.0 (recherche des commerces par leur nom)
**Tags** : `ux`, `bug-minor`
**Effort estimé** : S

**Problème** : après avoir choisi une suggestion dans la liste, la moindre
retouche du texte du champ (corriger une faute, ajouter un étage) efface les
coordonnées de la suggestion. Le calcul de distance géocode alors le texte
entier, moins précisément que le point choisi — et le nom d'un commerce en tête
du libellé peut dérouter le géocodeur.

**Localisation** : `src/ui/views/tripView.js`, gestionnaires `onInput` des deux
`attachAddressAutocomplete` (départ et arrivée), qui remettent
`fromCoords` / `toCoords` à `null`.

**Pourquoi c'est gênant** : une distance moins juste, sans que rien ne le signale.

**Pourquoi pas maintenant** : hors du périmètre demandé ; sans effet tant qu'on
sélectionne dans la liste sans revenir sur le texte.

**Comment corriger** : ne perdre les coordonnées que si le texte s'éloigne
réellement du libellé choisi (par exemple, mémoriser le libellé sélectionné et
comparer `normalizeText` avant/après). Écueil : effacer entièrement le champ
doit toujours effacer les coordonnées.

**Validation** : choisir « Bricomarché », ajouter un espace en fin de champ,
calculer : la distance est identique à celle obtenue sans retouche.

---

### [ ] 2026-09-16 — Aller-retour : 23,3 ou 23,4 km selon le chemin suivi

**Source** : recette R11/R12 de la v0.13.0
**Tags** : `bug-minor`
**Effort estimé** : XS

**Problème** : pour un aller de 11,65 km, « Calculer » avec la case cochée donne
23,3 km, alors que cocher la case après un calcul donne 23,4 km. Le premier
chemin double la distance exacte puis arrondit ; le second double la distance
aller déjà arrondie à 11,7. Le défaut est antérieur à la v0.13.0.

**Localisation** : `src/services/geo/distanceService.js` (`km` arrondi après
doublement) ; `src/ui/views/tripView.js` (gestionnaire `change` de
`fields.roundTrip` et `calculateDistance`, qui doublent `result.oneWayKm`
arrondi).

**Pourquoi c'est gênant** : un écart d'un dixième de kilomètre sur un montant
déclaré, et deux valeurs différentes pour le même trajet selon l'ordre des gestes.

**Pourquoi pas maintenant** : touche au calcul d'un montant ; la règle du projet
impose de soumettre ce choix à l'utilisateur avant implémentation.

**Comment corriger** : choisir une règle unique avec l'utilisateur — le plus
lisible est « aller-retour = 2 × aller affiché » (23,4) — et l'appliquer dans
`distanceService` comme dans `tripView`. Écueil : les trajets déjà enregistrés
gardent leur valeur ; ne pas les recalculer.

**Validation** : pour un même trajet, les deux chemins donnent la même valeur,
égale à deux fois la distance aller affichée.

---

### [ ] 2026-09-16 — Réimporter un GPX déjà supprimé le fait revenir

**Source** : revue de la v0.13.0 (marques de suppression vides)
**Tags** : `bug-minor`
**Effort estimé** : S

**Problème** : une trace supprimée n'est plus qu'une marque sans date de début
ni distance. Or la détection de doublon compare justement ces deux valeurs, et
seulement sur les traces non supprimées. Importer à la main un fichier GPX dont
la trace avait été supprimée la fait donc réapparaître. Avant la v0.13.0, la
trace « ignorée » gardait ses valeurs et servait de témoin.

**Localisation** : `src/services/tracks/trackImportService.js`, fonction
`isDuplicate` ; règle de vidage dans `src/domain/models.js`, `createTrack`.

**Pourquoi c'est gênant** : un trajet supprimé revient si l'on réimporte le
même fichier, et il faut le supprimer une seconde fois.

**Pourquoi pas maintenant** : impact faible — les sessions enregistrées par
l'application Android sont effacées du téléphone dès leur import, seul l'import
manuel d'un fichier est concerné — et le témoin exigerait de conserver une
donnée que l'utilisateur a demandé d'effacer.

**Comment corriger** : conserver dans la marque une empreinte non réversible de
la session (hachage de `startedAt` + distance arrondie), et la comparer dans
`isDuplicate` en lisant aussi les supprimées. Écueil : l'empreinte ne doit
permettre de retrouver ni l'heure ni le lieu ; la purge de la marque après
fusion la fait disparaître, ce qui est acceptable.

**Validation** : importer un GPX, le supprimer, le réimporter : aucune carte
n'apparaît, et la marque en base ne contient ni heure ni lieu lisibles.

---

### [ ] 2026-09-16 — « Valider » écrit la trace depuis sa copie en mémoire

**Source** : revue de la v0.13.0, en corrigeant le retour des trajets supprimés
**Tags** : `bug-minor`
**Effort estimé** : XS

**Problème** : `convert` enregistre `{ ...track, status: 'converted' }` à partir
de la trace gardée en mémoire par l'écran. Si cette trace a été supprimée entre
l'affichage et l'appui (par une fusion ou un autre onglet), l'écriture la fait
revenir avec ses lieux, sous le statut « convertie ». Le même défaut a été
corrigé pour le nommage des adresses (`writeEndpoints`), pas pour la validation.

**Localisation** : `src/ui/views/homeView.js`, fonction `convert`.

**Pourquoi c'est gênant** : des données effacées réapparaissent en base, même
si la trace ne s'affiche plus.

**Pourquoi pas maintenant** : scénario très improbable — il faut une
suppression concurrente pendant que la carte est ouverte.

**Comment corriger** : remplacer l'écriture par `store.markTrackConverted(track.id)`,
qui relit déjà la base, en le complétant pour ignorer une trace supprimée.

**Validation** : test unitaire : supprimer la trace, appeler la conversion avec
la copie périmée, constater que la marque reste vide.

---

### [ ] 2026-09-16 — Écran « À valider » : comportements sans test automatisé

**Source** : revue de la v0.13.0
**Tags** : `dx`
**Effort estimé** : M

**Problème** : le balayage (`swipeToDelete.js`), l'écartement des trajets
personnels dans `refresh()`, le vidage des anciennes traces ignorées et le
calcul lancé par la case aller-retour n'ont été vérifiés qu'en recette
navigateur (R1 à R18), pas par des tests rejoués à chaque modification.

**Localisation** : `src/ui/components/swipeToDelete.js` ;
`src/ui/views/homeView.js` (`refresh`, `emptyOldIgnoredTracks`, `markPersonal`) ;
`src/ui/views/tripView.js` (gestionnaire `change` de `fields.roundTrip`).

**Pourquoi c'est gênant** : une régression sur le geste ou sur l'écartement
automatique passerait inaperçue jusqu'à l'usage — et l'écartement efface des
données sans retour.

**Pourquoi pas maintenant** : le projet n'a pas encore de tests d'interface ;
les poser est un chantier en soi.

**Comment corriger** : extraire le filtrage de `refresh()` dans une fonction de
service testable avec fake-indexeddb ; tester `attachSwipeToDelete` avec
jsdom/happy-dom en simulant des `PointerEvent`. Écueil : jsdom ne gère pas
`setPointerCapture` (déjà protégé par `try`).

**Validation** : `npm test` couvre au moins R1 à R6 et R11 à R14 sans navigateur.

---

### [ ] 2026-09-16 — Détails mineurs de l'écran « À valider » et des Réglages

**Source** : revue de la v0.13.0
**Tags** : `ux`
**Effort estimé** : S

**Problème** : trois points sans conséquence sur les données.
1. `markPersonal` n'intercepte pas une erreur d'écriture : aucun message si
   IndexedDB refuse l'enregistrement.
2. La poubelle d'une carte fermée reste atteignable par un lecteur d'écran
   (elle sort seulement de l'ordre de tabulation).
3. Le résumé d'une sauvegarde à importer compte comme « trajets à valider »
   les marques vides et les traces déjà validées.

**Localisation** : 1. `src/ui/views/homeView.js`, `markPersonal` ;
2. `src/ui/components/swipeToDelete.js`, `setOffset` ;
3. `src/ui/views/settingsView.js`, affichage de `inspectBackup(...).counts.tracks`.

**Pourquoi c'est gênant** : 1. un échec silencieux ; 2. une action destructive
annoncée alors qu'elle n'est pas visible ; 3. un compte trompeur avant import.

**Pourquoi pas maintenant** : cosmétique ou très improbable, découvert en revue
juste avant livraison.

**Comment corriger** : 1. `try/catch` avec `setStatus(..., 'bad')` ;
2. `aria-hidden="true"` sur la poubelle tant que la carte est fermée ;
3. dans `inspectBackup`, compter à part les traces `pending` non supprimées.

**Validation** : 1. écriture forcée en échec → message rouge ; 2. arbre
d'accessibilité sans bouton « Supprimer ce trajet » carte fermée ; 3. un
fichier avec 1 trace en attente et 2 marques annonce « 1 trajet à valider ».
