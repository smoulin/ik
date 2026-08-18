/**
 * Lecture d'une trace GPX.
 *
 * Le GPX produit par un enregistreur de trajet a une structure tres simple :
 * une suite de `<trkpt lat="" lon="">` portant eventuellement altitude, horodatage
 * et indicateurs de precision. On extrait donc directement ces elements plutot
 * que de construire un arbre XML complet : le code reste utilisable aussi bien
 * dans le navigateur que dans les tests, sans DOMParser ni dependance.
 *
 * Ce choix vaut pour ce format precis, dont on maitrise la forme. Il ne
 * conviendrait pas a du XML quelconque.
 *
 * Fonctions pures, sans dependance.
 */

/** Un point de trace tel qu'il figure dans le fichier. */
/**
 * @typedef {object} TrackPoint
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} elevation   metres
 * @property {Date|null} time
 * @property {number|null} accuracy    precision horizontale estimee, en metres
 * @property {number|null} speed       metres par seconde, si le fichier l'indique
 */

const TRKPT = /<trkpt\b[^>]*>[\s\S]*?<\/trkpt>|<trkpt\b[^>]*\/>/gi;
const LAT = /\blat\s*=\s*["']([^"']+)["']/i;
const LON = /\blon\s*=\s*["']([^"']+)["']/i;
const ELE = /<ele>\s*([^<\s]+)\s*<\/ele>/i;
const TIME = /<time>\s*([^<\s]+)\s*<\/time>/i;
const HDOP = /<hdop>\s*([^<\s]+)\s*<\/hdop>/i;
const SPEED = /<speed>\s*([^<\s]+)\s*<\/speed>/i;
/** GPSLogger ecrit la precision en metres dans une extension dediee. */
const ACCURACY = /<(?:\w+:)?accuracy>\s*([^<\s]+)\s*<\/(?:\w+:)?accuracy>/i;
const TRACK_NAME = /<trk>[\s\S]*?<name>\s*([^<]+?)\s*<\/name>/i;

/**
 * @param {string} xml  contenu du fichier .gpx
 * @returns {{name: string, points: TrackPoint[]}}
 * @throws {Error} si le contenu n'est pas un GPX exploitable
 */
export function parseGpx(xml) {
  const text = String(xml ?? '');

  if (!text.trim()) {
    throw new Error('Le fichier est vide.');
  }
  if (!/<gpx\b/i.test(text)) {
    throw new Error('Ce fichier n’est pas une trace GPX.');
  }

  const points = [];
  for (const raw of text.match(TRKPT) || []) {
    const point = toPoint(raw);
    if (point) points.push(point);
  }

  if (!points.length) {
    throw new Error('Cette trace ne contient aucun point de position.');
  }

  return {
    name: (TRACK_NAME.exec(text)?.[1] || '').trim(),
    points,
  };
}

function toPoint(raw) {
  const latitude = toNumber(LAT.exec(raw)?.[1]);
  const longitude = toNumber(LON.exec(raw)?.[1]);

  // Un point sans coordonnees exploitables n'a aucune valeur : on l'ignore
  // plutot que de faire echouer tout l'import.
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const timeText = TIME.exec(raw)?.[1];
  const time = timeText ? new Date(timeText) : null;

  return {
    latitude,
    longitude,
    elevation: toNumber(ELE.exec(raw)?.[1]),
    time: time && !Number.isNaN(time.getTime()) ? time : null,
    // `accuracy` est deja en metres ; `hdop` est un facteur sans unite, dont on
    // fait une estimation grossiere en le multipliant par la precision typique
    // d'un recepteur GPS.
    accuracy: toNumber(ACCURACY.exec(raw)?.[1]) ?? hdopToMeters(HDOP.exec(raw)?.[1]),
    speed: toNumber(SPEED.exec(raw)?.[1]),
  };
}

function hdopToMeters(value) {
  const hdop = toNumber(value);
  return hdop === null ? null : hdop * 5;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
