IK — prototype PWA v0.1.0

Fonctions incluses
- Plusieurs structures (SASU, EI LMP, personnel, etc.)
- Plusieurs véhicules
- Barème IK France 2026 (thermique/hybride/hydrogène + 100 % électrique)
- Barème carburant BIC : dernier officiel disponible au 17/08/2026 (dépenses 2025)
- Taux fixe personnalisé
- Calcul automatique de distance routière à partir des adresses
- Aller-retour
- Historique
- Rapports séparés par structure et véhicule
- Export CSV
- Impression / enregistrement PDF via le navigateur
- Sauvegarde et restauration JSON
- Données stockées localement dans le navigateur

Calcul des distances
L'application utilise :
- OpenStreetMap Nominatim pour convertir les adresses en coordonnées
- le serveur public de démonstration OSRM pour calculer l'itinéraire routier

Ces services sont gratuits mais nécessitent Internet et n'offrent pas de garantie de disponibilité. La distance reste modifiable manuellement.

Nominatim impose un usage léger (maximum 1 requête/seconde), une identification par Referer/User-Agent, l'attribution OpenStreetMap et la mise en cache des résultats. Cette application envoie donc les recherches d'adresses séquentiellement, met les résultats en cache et affiche l'attribution. Pour respecter l'identification par Referer, le calcul automatique est désactivé si l'application est simplement ouverte en file:// ; publie-la en HTTPS.

Installation sur Android / Samsung
Une PWA doit être servie en HTTPS pour être installable. Le plus simple est de publier ce dossier gratuitement sur GitHub Pages, Cloudflare Pages ou Netlify. Une fois le site ouvert dans Chrome sur le Samsung : menu ⋮ > Ajouter à l'écran d'accueil / Installer l'application.

Important fiscal
Le barème IK 2026 est intégré d'après l'Urssaf. Le barème carburant BIC le plus récent publié en 2026 concerne les dépenses 2025 ; l'application le nomme donc explicitement BIC 2025. Quand le barème suivant sera publié, il faudra mettre les taux à jour (ou utiliser temporairement un taux fixe personnalisé).
