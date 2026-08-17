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
  settingsRepository,
} from '../../data/repositories/index.js';

export async function buildBackup({ appVersion = '' } = {}) {
  const [companies, vehicles, trips, favoritePlaces, beneficiaries, settings] = await Promise.all([
    companyRepository.list({ includeDeleted: true }),
    vehicleRepository.list({ includeDeleted: true }),
    tripRepository.list({ includeDeleted: true }),
    favoritePlaceRepository.list({ includeDeleted: true }),
    beneficiaryRepository.list({ includeDeleted: true }),
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
      },
    };
  }

  return { valid: false, reason: 'Format non reconnu.' };
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
