/**
 * Sauvegarde et restauration locales.
 *
 * Le fichier produit reste un JSON lisible, stocke par l'utilisateur ou il le
 * souhaite : aucune donnee ne part vers un serveur (cf. §31 et §47).
 *
 * La restauration accepte DEUX formats : celui de la v0.2.0 et celui de la
 * v0.1.1 — les sauvegardes deja realisees restent donc utilisables.
 */

import { SCHEMA_VERSION } from '../../domain/models.js';
import { isLegacyState, migrateLegacyState } from '../../data/migrations.js';
import {
  companyRepository,
  vehicleRepository,
  tripRepository,
  favoritePlaceRepository,
  beneficiaryRepository,
  trackRepository,
  personalRouteRepository,
  settingsRepository,
} from '../../data/repositories/index.js';

export async function buildBackup({ appVersion = '' } = {}) {
  const [companies, vehicles, trips, favoritePlaces, beneficiaries, tracks, personalRoutes, settings] =
    await Promise.all([
      companyRepository.list({ includeDeleted: true }),
      vehicleRepository.list({ includeDeleted: true }),
      tripRepository.list({ includeDeleted: true }),
      favoritePlaceRepository.list({ includeDeleted: true }),
      beneficiaryRepository.list({ includeDeleted: true }),
      trackRepository.list({ includeDeleted: true }),
      personalRouteRepository.list({ includeDeleted: true }),
      settingsRepository.all(),
    ]);

  return {
    format: 'agilmea-ik-backup',
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    companies,
    vehicles,
    trips,
    favoritePlaces,
    beneficiaries,
    // Les traces enregistrees mais pas encore validees sont, elles aussi, un
    // travail a ne pas perdre : sans elles dans le fichier, un telephone perdu
    // emportait definitivement tous les trajets restant a valider.
    tracks,
    personalRoutes,
    settings,
  };
}

/** Verifie qu'un objet est exploitable, sans encore rien ecrire. */
export function inspectBackup(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Fichier illisible.' };
  }

  if (data.format === 'agilmea-ik-backup' || Number.isFinite(data.schemaVersion)) {
    return {
      valid: true,
      legacy: false,
      schemaVersion: data.schemaVersion ?? SCHEMA_VERSION,
      counts: {
        companies: data.companies?.length || 0,
        vehicles: data.vehicles?.length || 0,
        trips: data.trips?.length || 0,
        favoritePlaces: data.favoritePlaces?.length || 0,
        // Traces enregistrees en attente de validation. `null` — et non zero —
        // quand le fichier est anterieur a leur prise en charge : l'appelant
        // doit pouvoir distinguer « aucune trace » de « le fichier n'en parle
        // pas », faute de quoi une restauration effacerait celles en cours.
        tracks: Array.isArray(data.tracks) ? data.tracks.length : null,
        // Meme distinction pour les trajets personnels, apparus plus tard.
        personalRoutes: Array.isArray(data.personalRoutes) ? data.personalRoutes.length : null,
      },
    };
  }

  if (isLegacyState(data)) {
    return {
      valid: true,
      legacy: true,
      schemaVersion: 1,
      counts: {
        companies: data.companies.length,
        vehicles: data.vehicles.length,
        trips: data.trips.length,
        favoritePlaces: 0,
        // Le format v0.1.1 ignorait les traces : il n'en annonce donc aucune,
        // ce qui n'est pas la meme chose que d'en annoncer zero.
        tracks: null,
        personalRoutes: null,
      },
    };
  }

  return { valid: false, reason: 'Format non reconnu.' };
}

/**
 * Rapproche une sauvegarde des donnees presentes, sans rien perdre.
 *
 * C'est ce qui permet de travailler des deux cotes — enregistrer sur le
 * telephone, saisir et imprimer sur grand ecran — sans serveur ni compte : le
 * fichier JSON, transmis par le moyen qu'on veut, sert d'echange.
 *
 * Regle unique, sans exception : le plus grand `updatedAt` l'emporte. Aucune
 * entite n'est protegee, aucun trajet n'est fige, meme deja sorti dans un
 * rapport — decision explicite de l'utilisateur, la coherence comptable lui
 * revient. Consequence assumee : le bareme etant progressif par cumul annuel,
 * une fusion peut modifier le montant d'un trajet deja declare.
 *
 * Une suppression se propage comme n'importe quelle modification : c'est a cela
 * que sert `deletedAt`, et c'est pourquoi la sauvegarde exporte aussi les
 * enregistrements supprimes.
 *
 * @param {object} data sauvegarde au format courant (le format v0.1.1 est refuse)
 * @returns {Promise<object>} comptes par collection : ajoutes, mis a jour, ignores
 */
export async function mergeBackup(data) {
  const inspection = inspectBackup(data);
  if (!inspection.valid) throw new Error(inspection.reason);

  // Le format v0.1.1 est anterieur aux champs de synchronisation : sans
  // `updatedAt` fiable, fusionner reviendrait a deviner. Il reste restaurable.
  if (inspection.legacy) {
    throw new Error(
      'Une sauvegarde au format v0.1.1 ne peut pas être fusionnée. Utilise « Remplacer ».',
    );
  }

  const summary = {};

  for (const [key, repository] of Object.entries(MERGEABLE)) {
    summary[key] = await mergeCollection(repository, data[key]);
  }
  summary.tracks = await mergeTracks(data.tracks, data.exportedAt);

  // Les reglages ne portent pas de date : on ne reprend que le beneficiaire
  // principal, et seulement s'il n'y en a pas deja un. Ecraser un choix local
  // sans pouvoir dater les deux serait arbitraire.
  const localPrimary = await settingsRepository.get('primaryBeneficiaryId');
  if (!localPrimary && data.settings?.primaryBeneficiaryId) {
    await settingsRepository.set('primaryBeneficiaryId', data.settings.primaryBeneficiaryId);
  }

  return summary;
}

/** Depots fusionnables, dans l'ordre ou ils apparaissent dans le fichier. */
const MERGEABLE = {
  companies: companyRepository,
  vehicles: vehicleRepository,
  trips: tripRepository,
  favoritePlaces: favoritePlaceRepository,
  beneficiaries: beneficiaryRepository,
  personalRoutes: personalRouteRepository,
};

/**
 * Traces : meme fusion que les autres collections, plus la vie des marques de
 * suppression.
 *
 * Une marque n'existe que pour prevenir l'autre appareil. Des qu'il est
 * prevenu, elle n'a plus d'objet et disparait — decision de l'utilisateur :
 *  - l'appareil qui RECOIT une suppression retire la trace sans garder de marque ;
 *  - l'appareil qui l'a EMISE efface sa marque quand il recoit un fichier de
 *    l'autre cote, exporte apres la suppression, ou la trace n'existe plus.
 *
 * Une suppression l'emporte toujours sur une trace vivante : le renommage
 * automatique des extremites modifie `updatedAt` sans que personne ait voulu
 * annuler la suppression.
 *
 * Limite assumee : fusionner un fichier anterieur a la suppression, une fois
 * les marques effacees, fait revenir la trace.
 */
async function mergeTracks(incoming, exportedAt) {
  const counts = { added: 0, updated: 0, ignored: 0, purged: 0 };
  const records = Array.isArray(incoming) ? incoming.filter((record) => record?.id) : [];

  const local = new Map(
    (await trackRepository.list({ includeDeleted: true })).map((record) => [record.id, record]),
  );
  const remote = new Map(records.map((record) => [record.id, record]));
  const winners = [];

  for (const record of records) {
    const mine = local.get(record.id);

    if (record.deletedAt) {
      // Suppression recue : la trace part, et aucune marque ne reste ici.
      if (mine) {
        await trackRepository.remove(record.id, { hard: true });
        counts.purged += 1;
      } else {
        counts.ignored += 1;
      }
      continue;
    }

    if (!mine) {
      winners.push(record);
      counts.added += 1;
    } else if (mine.deletedAt) {
      // Deja supprimee ici : l'autre appareil n'a simplement pas encore ete prevenu.
      counts.ignored += 1;
    } else if (String(record.updatedAt || '') > String(mine.updatedAt || '')) {
      winners.push(record);
      counts.updated += 1;
    } else {
      counts.ignored += 1;
    }
  }

  // Marques emises ici : l'autre appareil a-t-il traite la suppression ? Seul
  // un fichier exporte APRES elle peut le prouver, par l'absence de la trace.
  if (exportedAt) {
    for (const mine of local.values()) {
      if (!mine.deletedAt || remote.has(mine.id)) continue;
      if (String(exportedAt) > String(mine.deletedAt)) {
        await trackRepository.remove(mine.id, { hard: true });
        counts.purged += 1;
      }
    }
  }

  // Meme precaution que mergeCollection : `saveMany` preserve `updatedAt`.
  if (winners.length) await trackRepository.saveMany(winners);
  return counts;
}

/**
 * Une collection. Le fichier ne peut qu'ajouter ou remplacer, jamais supprimer
 * un enregistrement local qu'il ne connait pas : ce serait perdre le travail
 * fait sur l'autre appareil depuis l'export.
 */
async function mergeCollection(repository, incoming) {
  const counts = { added: 0, updated: 0, ignored: 0 };
  if (!Array.isArray(incoming) || !incoming.length) return counts;

  const local = new Map(
    (await repository.list({ includeDeleted: true })).map((record) => [record.id, record]),
  );

  const winners = [];

  for (const record of incoming) {
    if (!record?.id) continue;

    const mine = local.get(record.id);
    if (!mine) {
      // Inconnu ici : il entre, meme marque supprime — c'est ainsi qu'une
      // suppression faite ailleurs se propage.
      winners.push(record);
      counts.added += 1;
      continue;
    }

    // Dates ISO : elles se comparent comme du texte. A egalite le local reste,
    // pour que deux fusions successives ne reecrivent pas les memes lignes.
    if (String(record.updatedAt || '') > String(mine.updatedAt || '')) {
      winners.push(record);
      counts.updated += 1;
    } else {
      counts.ignored += 1;
    }
  }

  // `saveMany` preserve `updatedAt` tel quel. Le remettre a l'instant present
  // ferait gagner systematiquement la derniere fusion, et les deux appareils
  // se renverraient eternellement les memes enregistrements.
  if (winners.length) await repository.saveMany(winners);

  return counts;
}

/**
 * Remplace l'integralite des donnees par le contenu de la sauvegarde.
 * Operation destructive : l'appelant doit avoir demande confirmation.
 */
export async function restoreBackup(data) {
  const inspection = inspectBackup(data);
  if (!inspection.valid) throw new Error(inspection.reason);

  const payload = inspection.legacy
    ? { ...migrateLegacyState(data), favoritePlaces: [], beneficiaries: [], settings: {} }
    : data;

  await Promise.all([
    companyRepository.clear(),
    vehicleRepository.clear(),
    tripRepository.clear(),
    favoritePlaceRepository.clear(),
    beneficiaryRepository.clear(),
  ]);

  await companyRepository.saveMany(payload.companies || []);
  await vehicleRepository.saveMany(payload.vehicles || []);
  await tripRepository.saveMany(payload.trips || []);
  await favoritePlaceRepository.saveMany(payload.favoritePlaces || []);
  await beneficiaryRepository.saveMany(payload.beneficiaries || []);

  // Les traces ne sont remplacees que si le fichier en parle. Un fichier
  // anterieur a leur prise en charge ne dit pas « il n'y en a aucune », il ne
  // dit rien : les effacer sur cette base perdrait les trajets en attente de
  // validation au lieu de les restaurer.
  if (Array.isArray(payload.tracks)) {
    await trackRepository.clear();
    await trackRepository.saveMany(payload.tracks);
  }

  // Meme prudence que pour les traces : un fichier anterieur aux trajets
  // personnels ne dit pas « aucune regle », il ne dit rien.
  if (Array.isArray(payload.personalRoutes)) {
    await personalRouteRepository.clear();
    await personalRouteRepository.saveMany(payload.personalRoutes);
  }

  // Les reglages restaures se limitent au beneficiaire principal : reimporter
  // des drapeaux techniques (etat de migration...) ferait plus de mal que de bien.
  const primaryBeneficiaryId =
    payload.settings?.primaryBeneficiaryId || payload.beneficiaries?.[0]?.id || null;
  if (primaryBeneficiaryId) {
    await settingsRepository.set('primaryBeneficiaryId', primaryBeneficiaryId);
  }
  await settingsRepository.set('schemaVersion', SCHEMA_VERSION);

  return inspection.counts;
}
