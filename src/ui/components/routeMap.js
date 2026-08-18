/**
 * Carte d'itineraire, affichee UNIQUEMENT a la demande.
 *
 * Choix de conception assume : la carte n'apparait jamais toute seule. Afficher
 * un fond cartographique transmet les coordonnees du trajet aux serveurs de
 * tuiles, alors que le reste de l'application ne fait sortir que les adresses
 * explicitement recherchees. L'utilisateur doit donc le declencher lui-meme.
 *
 * Leaflet est charge en import dynamique : il ne pese sur le telechargement
 * initial que si la carte est reellement ouverte.
 *
 * Tuiles OpenStreetMap : attribution obligatoire, affichee en permanence.
 * Leur politique d'usage interdit tout prechargement ou usage hors ligne —
 * on se contente donc de l'affichage interactif.
 */

import { boundsOf } from '../../shared/polyline.js';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Instance Leaflet mise en cache : le module n'est telecharge qu'une fois. */
let leafletModule = null;

async function loadLeaflet() {
  if (!leafletModule) {
    const [lib] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
    leafletModule = lib.default || lib;
  }
  return leafletModule;
}

export function createRouteMap(container) {
  let map = null;
  let routeLayer = null;
  let markersLayer = null;

  /**
   * Affiche un trace. Cree la carte au premier appel seulement.
   *
   * @param {Array<[number, number]>} geometry  points [lat, lon]
   * @param {{from?: string, to?: string}} labels
   */
  async function show(geometry, labels = {}) {
    if (!geometry || geometry.length < 2) {
      throw new Error('Aucun tracé disponible pour ce trajet.');
    }

    const L = await loadLeaflet();

    if (!map) {
      map = L.map(container, { attributionControl: true, scrollWheelZoom: false });
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
    }

    if (routeLayer) routeLayer.remove();
    if (markersLayer) markersLayer.remove();

    routeLayer = L.polyline(geometry, { color: '#1d4ed8', weight: 5, opacity: 0.85 }).addTo(map);

    const start = geometry[0];
    const end = geometry[geometry.length - 1];
    markersLayer = L.layerGroup([
      L.circleMarker(start, markerStyle('#047857')).bindTooltip(labels.from || 'Départ'),
      L.circleMarker(end, markerStyle('#b91c1c')).bindTooltip(labels.to || 'Arrivée'),
    ]).addTo(map);

    const bounds = boundsOf(geometry);
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [24, 24] },
    );

    // Leaflet calcule mal ses dimensions si le conteneur vient d'etre affiche.
    setTimeout(() => map.invalidateSize(), 60);
  }

  function markerStyle(color) {
    return { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 };
  }

  /** Libere la carte : utile quand le formulaire est reinitialise. */
  function destroy() {
    if (map) {
      map.remove();
      map = null;
      routeLayer = null;
      markersLayer = null;
    }
  }

  return { show, destroy };
}
