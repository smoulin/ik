# Backlog — Agilmea IK

Points relevés en revue et volontairement différés. Chaque entrée doit se
suffire à elle-même : une session future, sans le contexte de la discussion
d'origine, doit pouvoir comprendre, reproduire et corriger.

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
