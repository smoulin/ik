# Maquette jetable — enregistrement GPS en arriere-plan

Cette application n'est **pas** Agilmea IK. C'est une maquette destinee a etre
supprimee, qui repond a une seule question :

> One UI laisse-t-il un service d'enregistrement tourner de bout en bout sur
> 60 km, telephone en poche, ecran eteint, application jamais ouverte ?

Tant que la reponse n'est pas connue, il serait imprudent de migrer Agilmea IK
vers une application native : c'est exactement le pari que cette maquette permet
d'eviter.

## Ce qu'elle fait

- demande les autorisations dans l'ordre impose par Android, dont la position en
  arriere-plan et l'exemption d'optimisation de batterie ;
- laisse choisir l'appareil Bluetooth du vehicule parmi ceux appaires — **son nom
  n'est jamais ecrit dans le code**, le depot reste exempt de donnee personnelle ;
- demarre l'enregistrement a la connexion de cet appareil, l'arrete a la
  deconnexion, application fermee ;
- ecrit la trace GPX et un journal de diagnostic **point par point**, jamais a la
  fin : une interruption doit laisser une preuve exploitable ;
- affiche distance, points retenus, points ecartes et plus long silence entre
  deux positions.

## Ce qu'elle ne fait pas

Aucune base de donnees, aucun bareme, aucun rapport, aucune carte, aucun export
CSV, aucune signature de production. Le GPX se partage a la main vers Agilmea IK.

## Filtrage du bruit

Transcription fidele de `src/domain/tracks/trackDistance.js` : precision
maximale 25 m, pas minimal 10 m, vitesse aberrante au-dela de 200 km/h, distances
par la formule de Haversine. Les deux implementations doivent donner le meme
resultat, sans quoi la comparaison n'aurait aucune valeur.

## Compilation

Rien a installer en local : le workflow `.github/workflows/spike-android.yml`
compile l'APK sur les serveurs GitHub a chaque poussee de la branche
`spike/android-tracker`. L'APK est publie en artefact prive, jamais en public, et
se recupere avec :

```
gh run download --name agilmea-spike-apk
```

## Suppression

Supprimer le dossier `android-spike/`, le fichier
`.github/workflows/spike-android.yml` et la branche `spike/android-tracker`.
Rien d'autre ne depend de cette maquette.
