/**
 * Decodage des polylignes encodees (algorithme Google Encoded Polyline).
 *
 * Les fournisseurs d'itineraire renvoient la geometrie du trajet sous cette
 * forme compacte. La precision differe selon le fournisseur — OSRM encode avec
 * 5 decimales, Valhalla avec 6 — d'ou le parametre `precision` plutot qu'une
 * constante : une erreur sur ce point decale le trace d'un facteur 10.
 *
 * Fonction pure, sans dependance : testable et reutilisable par la carte.
 */

/**
 * @param {string} encoded  chaine encodee
 * @param {number} precision  nombre de decimales (5 pour OSRM, 6 pour Valhalla)
 * @returns {Array<[number, number]>} points [latitude, longitude]
 */
export function decodePolyline(encoded, precision = 6) {
  if (typeof encoded !== 'string' || !encoded) return [];

  const factor = 10 ** precision;
  const points = [];

  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const deltaLat = readVarint();
    if (deltaLat === null) break;
    const deltaLon = readVarint();
    if (deltaLon === null) break;

    latitude += deltaLat;
    longitude += deltaLon;
    points.push([latitude / factor, longitude / factor]);
  }

  return points;

  /**
   * Lit un entier encode en groupes de 5 bits, complement a deux decale.
   * Renvoie null si la chaine se termine au milieu d'une valeur.
   */
  function readVarint() {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    // Bit de poids faible a 1 => valeur negative.
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

/** Rayon moyen de la Terre, en metres. */
const EARTH_RADIUS_M = 6371008.8;

/**
 * Distance orthodromique entre deux points, en metres (formule de Haversine).
 *
 * Precision suffisante pour des trajets routiers : l'ecart avec un calcul
 * ellipsoidal reste tres inferieur au bruit d'un releve GPS.
 */
export function haversineMeters([lat1, lon1], [lat2, lon2]) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Rectangle englobant d'une liste de points : utile pour cadrer une carte. */
export function boundsOf(points) {
  if (!points || !points.length) return null;

  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;

  for (const [lat, lon] of points) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }

  return { south, west, north, east };
}
