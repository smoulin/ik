/**
 * Modele de donnees Agilmea IK.
 *
 * Toutes les entites partagent les memes metadonnees (id / createdAt / updatedAt /
 * deletedAt). Ce socle commun ne coute presque rien aujourd'hui mais permettra
 * d'ajouter plus tard une synchronisation multi-appareils sans remodeler les
 * donnees existantes (cf. cahier des charges §46).
 *
 * Aucune dependance : ni DOM, ni IndexedDB, ni reseau.
 */

import { uid, nowIso } from './ids.js';
import { normalizeText } from '../shared/normalize.js';
import { splitFrenchAddress } from '../shared/address.js';

/** Version du schema de donnees applicatif (independante de la version de l'app). */
export const SCHEMA_VERSION = 2;

/** Modes de calcul disponibles pour une structure. */
export const CALCULATION_MODES = /** @type {const} */ ({
  IK: 'ik2026',
  BIC: 'bic2025',
  FIXED: 'fixed',
  /** Bareme a tranches defini par l'utilisateur (cf. domain/mileage/customScale.js). */
  CUSTOM: 'custom',
  NONE: 'none',
});

export const FUEL_TYPES = /** @type {const} */ ({
  PETROL: 'petrol',
  DIESEL: 'diesel',
  LPG: 'lpg',
});

/**
 * Provenance de la distance d'un trajet.
 * 'gps' designe une trace reellement enregistree, la source la plus fiable.
 */
export const DISTANCE_SOURCES = ['manual', 'routing', 'gps'];

/**
 * Itineraire demande au calcul. Volontairement declare ici plutot qu'importe
 * du fournisseur : le modele de donnees ne doit dependre d'aucun service.
 */
export const ROUTE_PREFERENCES_ALLOWED = ['fastest', 'no-highway', 'no-toll'];

/** Libelles affichables, y compris dans les rapports. */
export const ROUTE_PREFERENCE_LABELS = {
  fastest: 'Le plus rapide',
  'no-highway': 'Sans autoroute',
  'no-toll': 'Sans péage',
};

/* ------------------------------------------------------------------ */
/* Adresse                                                             */
/* ------------------------------------------------------------------ */

/**
 * Adresse normalisee, partagee par les structures, le beneficiaire et les
 * lieux favoris. Un modele unique evite trois formats concurrents dans l'app.
 *
 * `label` est la forme affichable complete ; les autres champs sont facultatifs
 * et remplis automatiquement quand l'adresse vient de l'autocompletion.
 *
 * @typedef {object} Address
 * @property {string} label
 * @property {string} line1
 * @property {string} line2
 * @property {string} postalCode
 * @property {string} city
 * @property {string} country
 * @property {number|null} latitude
 * @property {number|null} longitude
 */

/** @returns {Address} */
export function createAddress(input = {}) {
  const postalCode = str(input.postalCode);
  const city = str(input.city);

  return {
    label: str(input.label),
    // La voie ne porte pas la localite : celle-ci a ses propres champs. Une
    // adresse reprise d'un libelle complet arrive pourtant avec les deux
    // collees. Normaliser ici repare l'enregistrement au prochain
    // enregistrement, au lieu de laisser la repetition s'installer.
    line1: withoutLocality(str(input.line1), postalCode, city),
    line2: str(input.line2),
    postalCode,
    city,
    country: str(input.country) || 'FR',
    latitude: num(input.latitude),
    longitude: num(input.longitude),
  };
}

/**
 * Retire la localite finale d'une voie, quand elle est deja connue par ailleurs.
 *
 * Le decoupage est confie a `splitFrenchAddress`, qui travaille sur la chaine
 * telle qu'elle est ecrite. Comparer des chaines normalisees pour couper
 * ensuite la chaine brute donnerait un decalage des que la ponctuation ou les
 * espaces different.
 */
function withoutLocality(line, postalCode, city) {
  if (!line || !postalCode) return line;

  const parsed = splitFrenchAddress(line);
  if (parsed.postalCode !== postalCode) return line;
  if (city && normalizeText(parsed.city) !== normalizeText(city)) return line;

  // Une voie qui se reduirait a rien n'en etait pas une : on garde l'original.
  return parsed.line1 || line;
}

/** Une adresse est consideree vide si elle n'a ni libelle ni ville. */
export function isAddressEmpty(address) {
  if (!address) return true;
  return !address.label && !address.line1 && !address.city;
}

/** Rendu multiligne : « 12 rue Exemple / 38000 Grenoble ». */
export function formatAddressLines(address) {
  if (!address) return [];
  const lines = [];
  const first = address.line1 || address.label;
  if (first) lines.push(first);
  if (address.line2) lines.push(address.line2);
  const cityLine = [address.postalCode, address.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (address.country && address.country !== 'FR') lines.push(address.country);
  return lines;
}

/** Rendu sur une ligne, pour les listes et les champs de saisie. */
export function formatAddressOneLine(address) {
  if (!address) return '';
  if (address.label) return address.label;
  return formatAddressLines(address).join(', ');
}

/**
 * Compose le libelle complet a partir de champs saisis separement.
 * Le code postal et la ville forment UN bloc separe par une espace
 * (« 12 rue Exemple, 38000 Grenoble »), jamais par une virgule.
 *
 * La voie peut deja se terminer par la localite — c'est le cas quand elle a
 * ete reprise d'un libelle complet, par exemple une adresse deja utilisee.
 * L'ajouter alors une seconde fois donnait « 358 Chemin de l'Etang 38980
 * Chatenay, 38980 Chatenay ».
 */
export function composeAddressLabel({ line1 = '', line2 = '', postalCode = '', city = '' } = {}) {
  const cityLine = [postalCode, city].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
  const parts = [line1, line2].map((v) => String(v || '').trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';

  if (cityLine && !endsWithLocality(last, cityLine)) parts.push(cityLine);

  return parts.join(', ');
}

/** Vrai si le texte se termine deja par cette localite, ponctuation comprise. */
function endsWithLocality(text, cityLine) {
  const haystack = normalizeText(text);
  const needle = normalizeText(cityLine);
  return Boolean(needle) && haystack.endsWith(needle);
}

export function hasCoordinates(address) {
  return Boolean(address && Number.isFinite(address.latitude) && Number.isFinite(address.longitude));
}

/* ------------------------------------------------------------------ */
/* Metadonnees communes                                                */
/* ------------------------------------------------------------------ */

function withMeta(entity, input, prefix) {
  const now = nowIso();
  return {
    id: str(input.id) || uid(prefix),
    createdAt: str(input.createdAt) || now,
    updatedAt: str(input.updatedAt) || now,
    deletedAt: input.deletedAt ? str(input.deletedAt) : null,
    ...entity,
  };
}

/** Marque une entite comme modifiee (met a jour `updatedAt`). */
export function touch(entity) {
  return { ...entity, updatedAt: nowIso() };
}

/** Suppression logique : l'enregistrement reste en base pour une synchro future. */
export function softDelete(entity) {
  return { ...entity, deletedAt: nowIso(), updatedAt: nowIso() };
}

export function isDeleted(entity) {
  return Boolean(entity && entity.deletedAt);
}

/* ------------------------------------------------------------------ */
/* Structure (Company)                                                 */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} Company
 * @property {string} id
 * @property {string} name          nom d'usage affiche dans l'application
 * @property {string} legalName     raison sociale (facultative)
 * @property {string} type          libelle libre : SASU, EI LMP, personnel...
 * @property {string} siren
 * @property {string} siret
 * @property {Address} address
 * @property {string} calculationMode
 * @property {object} calculationSettings
 * @property {boolean} active
 */
export function createCompany(input = {}) {
  return withMeta(
    {
      name: str(input.name),
      legalName: str(input.legalName),
      type: str(input.type),
      siren: normalizeDigits(input.siren),
      siret: normalizeDigits(input.siret),
      address: createAddress(input.address),
      calculationMode: normalizeCalculationMode(input.calculationMode ?? input.scheme),
      calculationSettings: {
        fixedRate: num(input.calculationSettings?.fixedRate ?? input.fixedRate) ?? 0,
        // Bareme a tranches, utilise par le mode 'custom'. Conserve tel quel :
        // sa normalisation appartient a domain/mileage/customScale.js.
        customScale: input.calculationSettings?.customScale ?? input.customScale ?? null,
      },
      active: input.active !== false,
    },
    input,
    'company',
  );
}

function normalizeCalculationMode(mode) {
  const known = Object.values(CALCULATION_MODES);
  return known.includes(mode) ? mode : CALCULATION_MODES.IK;
}

/* ------------------------------------------------------------------ */
/* Vehicule                                                            */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} Vehicle
 * @property {string} id
 * @property {string} name
 * @property {number} cv        puissance fiscale
 * @property {boolean} electric 100 % electrique (barème majore)
 * @property {string} fuel      carburant, utilise par le barème BIC
 * @property {boolean} active
 */
export function createVehicle(input = {}) {
  return withMeta(
    {
      name: str(input.name),
      cv: num(input.cv) ?? 0,
      electric: Boolean(input.electric),
      fuel: Object.values(FUEL_TYPES).includes(input.fuel) ? input.fuel : FUEL_TYPES.PETROL,
      active: input.active !== false,
    },
    input,
    'vehicle',
  );
}

/* ------------------------------------------------------------------ */
/* Trajet                                                              */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} Trip
 * @property {string} id
 * @property {string} date        format ISO court AAAA-MM-JJ
 * @property {string} companyId
 * @property {string} vehicleId
 * @property {string} from        libelle du point de depart
 * @property {string} to          libelle de la destination
 * @property {{latitude:number,longitude:number}|null} fromCoords
 * @property {{latitude:number,longitude:number}|null} toCoords
 * @property {number} km
 * @property {string} purpose
 * @property {boolean} roundTrip
 * @property {string} distanceSource  'manual' | 'routing' | 'gps'
 * @property {string} routePreference  itineraire retenu : 'fastest' | 'no-highway' | 'no-toll'
 */
export function createTrip(input = {}) {
  return withMeta(
    {
      date: str(input.date),
      companyId: str(input.companyId),
      vehicleId: str(input.vehicleId),
      from: str(input.from),
      to: str(input.to),
      fromCoords: coords(input.fromCoords),
      toCoords: coords(input.toCoords),
      km: num(input.km) ?? 0,
      purpose: str(input.purpose),
      roundTrip: Boolean(input.roundTrip),
      distanceSource: DISTANCE_SOURCES.includes(input.distanceSource)
        ? input.distanceSource
        : 'manual',
      // Conserve pour que le rapport puisse indiquer quel itineraire a servi.
      routePreference: ROUTE_PREFERENCES_ALLOWED.includes(input.routePreference)
        ? input.routePreference
        : 'fastest',
    },
    input,
    'trip',
  );
}

/* ------------------------------------------------------------------ */
/* Lieu favori                                                         */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} FavoritePlace
 * @property {string} id
 * @property {string} name       « Domicile », « Bureau Grenoble »...
 * @property {Address} address
 * @property {number|null} latitude
 * @property {number|null} longitude
 */
export function createFavoritePlace(input = {}) {
  const address = createAddress(input.address);
  // latitude/longitude sont exposees a plat (cf. §28) tout en restant
  // synchronisees avec l'adresse, qui est la source utilisee par le routing.
  const latitude = num(input.latitude) ?? address.latitude;
  const longitude = num(input.longitude) ?? address.longitude;
  return withMeta(
    {
      name: str(input.name),
      address: { ...address, latitude, longitude },
      latitude,
      longitude,
    },
    input,
    'place',
  );
}

/* ------------------------------------------------------------------ */
/* Trace GPS                                                           */
/* ------------------------------------------------------------------ */

/** Etats d'une trace importee. */
export const TRACK_STATUSES = ['pending', 'converted', 'ignored'];

/** Origine du libelle d'une extremite de trace. */
export const TRACK_LABEL_SOURCES = ['favorite', 'address', 'none'];

/**
 * Trajet enregistre par le GPS, avant d'etre transforme en trajet declarable.
 *
 * Une trace est une donnee brute : elle porte la distance mesuree et le trace,
 * mais ni structure ni motif. C'est l'utilisateur qui la valide, et c'est a ce
 * moment qu'elle devient un trajet (`tripId` renseigne, statut « converted »).
 *
 * @typedef {object} Track
 * @property {string} id
 * @property {string} source        'gpx' pour l'instant
 * @property {string} fileName
 * @property {string} startedAt     ISO
 * @property {string} endedAt       ISO
 * @property {number} distanceMeters   distance retenue, apres filtrage
 * @property {number} rawDistanceMeters distance brute, avant filtrage
 * @property {object} quality       compteurs de points retenus et ecartes
 * @property {{latitude:number,longitude:number,label:string,placeId:string|null,labelSource:string}} start
 * @property {{latitude:number,longitude:number,label:string,placeId:string|null,labelSource:string}} end
 * @property {Array<[number,number]>} geometry
 * @property {string} status        'pending' | 'converted' | 'ignored'
 * @property {string|null} tripId   trajet cree a partir de cette trace
 */
export function createTrack(input = {}) {
  const status = TRACK_STATUSES.includes(input.status) ? input.status : 'pending';
  const geometry = Array.isArray(input.geometry) ? input.geometry : [];

  return withMeta(
    {
      source: str(input.source) || 'gpx',
      fileName: str(input.fileName),
      startedAt: str(input.startedAt),
      endedAt: str(input.endedAt),
      distanceMeters: num(input.distanceMeters) ?? 0,
      rawDistanceMeters: num(input.rawDistanceMeters) ?? 0,
      quality: input.quality ?? null,
      start: trackEndpoint(input.start),
      end: trackEndpoint(input.end),
      /*
       * Le trace n'a d'utilite qu'a l'ecran « A valider », pour montrer par ou
       * l'on est passe avant de decider. Une fois la trace validee ou ignoree,
       * plus rien ne le lit — mais il pesait indefiniment dans la base et dans
       * la sauvegarde : quelques milliers de points par trajet long.
       *
       * L'enregistrement lui-meme est conserve : il sert de temoin pour ne pas
       * reimporter deux fois la meme session. Seuls ses points disparaissent.
       *
       * La regle vit ici, et non dans les boutons « Valider » et « Ignorer » :
       * elle s'applique ainsi a tous les chemins d'ecriture, restauration d'une
       * sauvegarde comprise.
       */
      geometry: status === 'pending' ? geometry : [],
      status,
      tripId: input.tripId ? str(input.tripId) : null,
    },
    input,
    'track',
  );
}

function trackEndpoint(value) {
  if (!value) return null;
  const latitude = num(value.latitude);
  const longitude = num(value.longitude);
  if (latitude === null || longitude === null) return null;
  return {
    latitude,
    longitude,
    label: str(value.label),
    placeId: value.placeId ? str(value.placeId) : null,
    // D'ou vient le libelle : un lieu favori, une adresse retrouvee, ou rien.
    // « none » retient un echec : sans lui, un point qu'aucun fournisseur ne
    // sait nommer serait redemande a chaque ouverture de l'application.
    labelSource: TRACK_LABEL_SOURCES.includes(value.labelSource) ? value.labelSource : '',
  };
}

/* ------------------------------------------------------------------ */
/* Beneficiaire                                                        */
/* ------------------------------------------------------------------ */

/**
 * Personne physique qui utilise son vehicule personnel et percoit les indemnites.
 *
 * L'application n'en gere qu'un seul aujourd'hui (le « beneficiaire principal »,
 * designe par settings.primaryBeneficiaryId), mais le stockage est un dépôt
 * multi-enregistrements : passer a plusieurs beneficiaires ne demandera pas de
 * migration de donnees (cf. §26 et §41).
 *
 * @typedef {object} Beneficiary
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {Address} address
 */
export function createBeneficiary(input = {}) {
  return withMeta(
    {
      firstName: str(input.firstName),
      lastName: str(input.lastName),
      address: createAddress({
        ...input.address,
        line1: input.address?.line1 ?? input.addressLine1,
        line2: input.address?.line2 ?? input.addressLine2,
        postalCode: input.address?.postalCode ?? input.postalCode,
        city: input.address?.city ?? input.city,
        country: input.address?.country ?? input.country,
      }),
    },
    input,
    'beneficiary',
  );
}

/** « Jean DUPONT » — le nom de famille en majuscules, usage administratif francais. */
export function formatBeneficiaryName(beneficiary) {
  if (!beneficiary) return '';
  const first = (beneficiary.firstName || '').trim();
  const last = (beneficiary.lastName || '').trim().toLocaleUpperCase('fr-FR');
  return [first, last].filter(Boolean).join(' ');
}

export function isBeneficiaryEmpty(beneficiary) {
  if (!beneficiary) return true;
  return !beneficiary.firstName && !beneficiary.lastName && isAddressEmpty(beneficiary.address);
}

/* ------------------------------------------------------------------ */
/* Utilitaires internes                                                */
/* ------------------------------------------------------------------ */

function str(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDigits(value) {
  return str(value).replace(/\s/g, '');
}

function coords(value) {
  if (!value) return null;
  const latitude = num(value.latitude ?? value.lat);
  const longitude = num(value.longitude ?? value.lon ?? value.lng);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}
