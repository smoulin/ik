/**
 * Sauvegarde / restauration et export CSV.
 *
 * Point de non-regression important : une sauvegarde produite par la v0.1.1
 * doit rester importable, et le format CSV ne doit pas changer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../helpers/db.js';
import {
  buildBackup,
  restoreBackup,
  mergeBackup,
  inspectBackup,
} from '../../src/services/backup/backupService.js';
import {
  buildCsv,
  CSV_HEADER,
  csvFileName,
  escapeCsvFormula,
} from '../../src/services/export/csvExport.js';
import {
  companyRepository,
  vehicleRepository,
  tripRepository,
  favoritePlaceRepository,
  beneficiaryRepository,
  trackRepository,
  settingsRepository,
} from '../../src/data/repositories/index.js';
import { buildReport } from '../../src/domain/reporting/reportModel.js';
import { createCompany, createVehicle, createTrip } from '../../src/domain/models.js';

const LEGACY_BACKUP = {
  version: '0.1.1',
  companies: [{ id: 'c1', name: 'SASU A', scheme: 'ik2026', fixedRate: 0 }],
  vehicles: [{ id: 'v1', name: 'GLC', cv: 5, electric: false, fuel: 'diesel' }],
  trips: [
    {
      id: 't1',
      date: '2026-08-01',
      companyId: 'c1',
      vehicleId: 'v1',
      from: 'Grenoble',
      to: 'Lyon',
      km: 110,
      purpose: '',
      roundTrip: false,
      createdAt: '2026-08-01T09:00:00.000Z',
    },
  ],
};

beforeEach(async () => {
  await resetDatabase();
});

describe('inspectBackup', () => {
  it('reconnait une sauvegarde v0.1.1', () => {
    const inspection = inspectBackup(LEGACY_BACKUP);
    expect(inspection.valid).toBe(true);
    expect(inspection.legacy).toBe(true);
    expect(inspection.counts.trips).toBe(1);
  });

  it('rejette un fichier non reconnu', () => {
    expect(inspectBackup({ nimporte: 'quoi' }).valid).toBe(false);
    expect(inspectBackup(null).valid).toBe(false);
  });
});

describe('sauvegarde et restauration', () => {
  it('exporte toutes les entites, y compris favoris et beneficiaire', async () => {
    await companyRepository.save({ name: 'SASU A', address: { city: 'Lyon' } });
    await vehicleRepository.save({ name: 'GLC', cv: 5 });
    await favoritePlaceRepository.save({ name: 'Domicile', address: { city: 'Grenoble' } });
    await beneficiaryRepository.save({ firstName: 'Jean', lastName: 'Dupont' });

    const backup = await buildBackup({ appVersion: '0.2.0' });

    expect(backup.format).toBe('agilmea-ik-backup');
    expect(backup.appVersion).toBe('0.2.0');
    expect(backup.companies).toHaveLength(1);
    expect(backup.favoritePlaces).toHaveLength(1);
    expect(backup.beneficiaries).toHaveLength(1);
  });

  it('restaure une sauvegarde v0.2.0 a l’identique', async () => {
    await companyRepository.save({ name: 'SASU A' });
    await favoritePlaceRepository.save({ name: 'Domicile', address: {} });
    const backup = await buildBackup({ appVersion: '0.2.0' });

    await resetDatabase();
    expect(await companyRepository.list()).toHaveLength(0);

    await restoreBackup(backup);

    expect((await companyRepository.list())[0].name).toBe('SASU A');
    expect((await favoritePlaceRepository.list())[0].name).toBe('Domicile');
  });

  it('convertit une sauvegarde v0.1.1 en la restaurant', async () => {
    await restoreBackup(LEGACY_BACKUP);

    const companies = await companyRepository.list();
    const trips = await tripRepository.list();

    expect(companies[0].calculationMode).toBe('ik2026');
    expect(trips[0].from).toBe('Grenoble');
    expect(trips[0].createdAt).toBe('2026-08-01T09:00:00.000Z');
  });

  it('remplace bien les donnees existantes', async () => {
    await companyRepository.save({ name: 'A supprimer' });
    await restoreBackup(LEGACY_BACKUP);

    const companies = await companyRepository.list();
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe('SASU A');
  });

  it('refuse un fichier invalide', async () => {
    await expect(restoreBackup({ nimporte: 'quoi' })).rejects.toThrow();
  });
});

/*
 * Les traces enregistrees mais pas encore validees.
 *
 * L'ecran de sauvegarde annonce « le seul moyen de les retrouver en cas de
 * perte du telephone » : un travail absent du fichier est un travail perdu.
 */
describe('sauvegarde des trajets a valider', () => {
  const trace = (overrides = {}) => ({
    source: 'gpx',
    fileName: 'trajet.gpx',
    startedAt: '2026-08-27T08:47:03.000Z',
    endedAt: '2026-08-27T08:54:58.000Z',
    distanceMeters: 3300,
    rawDistanceMeters: 3400,
    quality: { pointCount: 94, usedCount: 64 },
    start: { latitude: 45.316, longitude: 5.2296, label: 'Maison', labelSource: 'favorite' },
    end: { latitude: 45.317, longitude: 5.2033, label: '70 Rue du Pont Neuf', labelSource: 'address' },
    geometry: [[45.316, 5.2296], [45.317, 5.2033]],
    status: 'pending',
    ...overrides,
  });

  it('emporte les traces en attente dans le fichier', async () => {
    await trackRepository.save(trace());
    const backup = await buildBackup({ appVersion: '0.8.1' });

    expect(backup.tracks).toHaveLength(1);
    expect(backup.tracks[0].distanceMeters).toBe(3300);
  });

  it('les restaure sur un appareil vierge, tracé et libellés compris', async () => {
    const origine = await trackRepository.save(trace());
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await trackRepository.clear();
    expect(await trackRepository.list()).toHaveLength(0);

    await restoreBackup(backup);

    const [restauree] = await trackRepository.list();
    expect(restauree.id).toBe(origine.id);
    expect(restauree.status).toBe('pending');
    expect(restauree.distanceMeters).toBe(3300);
    expect(restauree.start.label).toBe('Maison');
    expect(restauree.start.labelSource).toBe('favorite');
    expect(restauree.geometry).toHaveLength(2);
    expect(restauree.startedAt).toBe('2026-08-27T08:47:03.000Z');
  });

  it('conserve une trace deja convertie ou ignoree', async () => {
    await trackRepository.save(trace({ status: 'converted', tripId: 'trip_x' }));
    await trackRepository.save(trace({ status: 'ignored', startedAt: '2026-08-26T08:00:00.000Z' }));

    const backup = await buildBackup({ appVersion: '0.8.1' });
    await trackRepository.clear();
    await restoreBackup(backup);

    const statuts = (await trackRepository.list()).map((t) => t.status).sort();
    expect(statuts).toEqual(['converted', 'ignored']);
  });

  /*
   * Un fichier anterieur ne dit pas « aucune trace », il ne dit rien. Effacer
   * sur cette base perdrait les trajets en attente au lieu de les restaurer.
   */
  it('ne touche pas aux traces quand le fichier n’en parle pas', async () => {
    await trackRepository.save(trace());
    await restoreBackup(LEGACY_BACKUP);

    expect(await trackRepository.list()).toHaveLength(1);
  });

  it('distingue « aucune trace » de « fichier muet »', async () => {
    const backup = await buildBackup({ appVersion: '0.8.1' });
    expect(inspectBackup(backup).counts.tracks).toBe(0);
    expect(inspectBackup(LEGACY_BACKUP).counts.tracks).toBeNull();
  });
});

/*
 * Fusion de deux bases.
 *
 * Importer remplacait tout : sur le PC, cela effacait ce qui venait d'y etre
 * saisi. La fusion permet de travailler des deux cotes sans serveur.
 */
describe('fusion de sauvegardes', () => {
  const at = (iso) => iso;

  // F1
  it('fait entrer les enregistrements sur une base vide', async () => {
    await companyRepository.save({ name: 'Apprima' });
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await resetDatabase();
    const counts = await mergeBackup(backup);

    expect(counts.companies.added).toBe(1);
    expect((await companyRepository.list())[0].name).toBe('Apprima');
  });

  // F2
  it('laisse coexister deux enregistrements distincts', async () => {
    await companyRepository.save({ id: 'c_distant', name: 'Distante' });
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await resetDatabase();
    await companyRepository.save({ id: 'c_locale', name: 'Locale' });
    await mergeBackup(backup);

    const noms = (await companyRepository.list()).map((c) => c.name).sort();
    expect(noms).toEqual(['Distante', 'Locale']);
  });

  // F3 — le plus recent gagne.
  it('retient la version distante quand elle est plus récente', async () => {
    await companyRepository.save({ id: 'c1', name: 'Ancien nom', updatedAt: at('2026-01-01T00:00:00.000Z') });
    const backup = await buildBackup({ appVersion: '0.8.1' });
    backup.companies[0].name = 'Nouveau nom';
    backup.companies[0].updatedAt = at('2026-06-01T00:00:00.000Z');

    const counts = await mergeBackup(backup);

    expect(counts.companies.updated).toBe(1);
    expect((await companyRepository.get('c1')).name).toBe('Nouveau nom');
  });

  // F4
  it('conserve la version locale quand elle est plus récente', async () => {
    await companyRepository.save({ id: 'c1', name: 'Locale récente', updatedAt: at('2026-06-01T00:00:00.000Z') });
    const backup = await buildBackup({ appVersion: '0.8.1' });
    backup.companies[0].name = 'Distante ancienne';
    backup.companies[0].updatedAt = at('2026-01-01T00:00:00.000Z');

    const counts = await mergeBackup(backup);

    expect(counts.companies.ignored).toBe(1);
    expect((await companyRepository.get('c1')).name).toBe('Locale récente');
  });

  // F5 — a egalite, on ne reecrit rien.
  it('ne réécrit rien à égalité de date', async () => {
    await companyRepository.save({ id: 'c1', name: 'Identique' });
    const backup = await buildBackup({ appVersion: '0.8.1' });

    const counts = await mergeBackup(backup);
    expect(counts.companies).toEqual({ added: 0, updated: 0, ignored: 1 });
  });

  // F6 — une suppression est une modification comme une autre.
  it('propage une suppression faite ailleurs', async () => {
    // Le local doit etre le plus ancien, sinon c'est lui qui gagne — et il a
    // raison de gagner. La suppression ne se propage que si elle est posterieure.
    const trip = await tripRepository.save({
      companyId: 'c1',
      vehicleId: 'v1',
      date: '2026-05-05',
      km: 10,
      updatedAt: at('2026-05-05T00:00:00.000Z'),
    });
    const backup = await buildBackup({ appVersion: '0.8.1' });
    backup.trips[0].deletedAt = at('2026-07-01T00:00:00.000Z');
    backup.trips[0].updatedAt = at('2026-07-01T00:00:00.000Z');

    await mergeBackup(backup);

    expect(await tripRepository.list()).toHaveLength(0);
    const avecSupprimes = await tripRepository.list({ includeDeleted: true });
    expect(avecSupprimes).toHaveLength(1);
    expect(avecSupprimes[0].id).toBe(trip.id);
  });

  // F7 — et ne ressuscite pas ce qu'on vient de supprimer ici.
  it('ne ressuscite pas un enregistrement supprimé plus récemment en local', async () => {
    const trip = await tripRepository.save({ companyId: 'c1', vehicleId: 'v1', date: '2026-05-05', km: 10 });
    const backup = await buildBackup({ appVersion: '0.8.1' });
    backup.trips[0].updatedAt = at('2026-01-01T00:00:00.000Z');

    await tripRepository.remove(trip.id);
    await mergeBackup(backup);

    expect(await tripRepository.list()).toHaveLength(0);
  });

  // F8
  it('fait entrer un enregistrement inconnu déjà supprimé', async () => {
    const trip = await tripRepository.save({ companyId: 'c1', vehicleId: 'v1', date: '2026-05-05', km: 10 });
    await tripRepository.remove(trip.id);
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await resetDatabase();
    await mergeBackup(backup);

    expect(await tripRepository.list()).toHaveLength(0);
    expect(await tripRepository.list({ includeDeleted: true })).toHaveLength(1);
  });

  /*
   * F9 — le point le plus contre-intuitif. Remettre `updatedAt` a l'instant
   * present ferait gagner systematiquement la derniere fusion, et les deux
   * appareils se renverraient eternellement les memes enregistrements.
   */
  it('préserve updatedAt au lieu de le remettre à maintenant', async () => {
    await companyRepository.save({ id: 'c1', name: 'X', updatedAt: at('2026-01-01T00:00:00.000Z') });
    const backup = await buildBackup({ appVersion: '0.8.1' });
    backup.companies[0].name = 'Y';
    backup.companies[0].updatedAt = at('2026-06-01T00:00:00.000Z');

    await mergeBackup(backup);

    expect((await companyRepository.get('c1')).updatedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  // F10
  it('est idempotente : la deuxième fusion ne change rien', async () => {
    await companyRepository.save({ name: 'Apprima' });
    await tripRepository.save({ companyId: 'c1', vehicleId: 'v1', date: '2026-05-05', km: 10 });
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await resetDatabase();
    await mergeBackup(backup);
    const second = await mergeBackup(backup);

    for (const counts of Object.values(second)) {
      expect(counts.added).toBe(0);
      expect(counts.updated).toBe(0);
    }
  });

  // F11 — aller-retour complet entre deux appareils.
  it('rend les deux bases identiques après un aller-retour', async () => {
    // Appareil A.
    await companyRepository.save({ id: 'a', name: 'Chez A' });
    const deA = await buildBackup({ appVersion: '0.8.1' });

    // Appareil B, avec son propre travail, qui recoit A.
    await resetDatabase();
    await companyRepository.save({ id: 'b', name: 'Chez B' });
    await mergeBackup(deA);
    const deB = await buildBackup({ appVersion: '0.8.1' });
    const chezB = (await companyRepository.list()).map((c) => c.id).sort();

    // A recoit B en retour.
    await resetDatabase();
    await companyRepository.save({ id: 'a', name: 'Chez A' });
    await mergeBackup(deB);
    const chezA = (await companyRepository.list()).map((c) => c.id).sort();

    expect(chezA).toEqual(['a', 'b']);
    expect(chezA).toEqual(chezB);
  });

  // F12
  it('reprend le bénéficiaire principal quand il n’y en a pas', async () => {
    const b = await beneficiaryRepository.save({ firstName: 'Steph', lastName: 'Moulin' });
    await settingsRepository.set('primaryBeneficiaryId', b.id);
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await resetDatabase();
    await mergeBackup(backup);

    expect(await settingsRepository.get('primaryBeneficiaryId')).toBe(b.id);
  });

  // F13
  it('ne remplace pas un bénéficiaire principal déjà choisi', async () => {
    const b = await beneficiaryRepository.save({ firstName: 'Steph', lastName: 'Moulin' });
    await settingsRepository.set('primaryBeneficiaryId', b.id);
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await resetDatabase();
    await settingsRepository.set('primaryBeneficiaryId', 'choix_local');
    await mergeBackup(backup);

    expect(await settingsRepository.get('primaryBeneficiaryId')).toBe('choix_local');
  });

  // F14 — sans dates de synchronisation, fusionner reviendrait a deviner.
  it('refuse une sauvegarde v0.1.1', async () => {
    await companyRepository.save({ name: 'À garder' });
    await expect(mergeBackup(LEGACY_BACKUP)).rejects.toThrow(/v0\.1\.1|Remplacer/);
    expect((await companyRepository.list())[0].name).toBe('À garder');
  });

  // F15
  it('refuse un fichier illisible sans rien toucher', async () => {
    await companyRepository.save({ name: 'À garder' });
    await expect(mergeBackup({ nimporte: 'quoi' })).rejects.toThrow();
    expect(await companyRepository.list()).toHaveLength(1);
  });

  it('fusionne aussi les trajets en attente de validation', async () => {
    await trackRepository.save({
      source: 'gpx',
      startedAt: '2026-08-27T08:47:03.000Z',
      distanceMeters: 3300,
      start: { latitude: 45.3, longitude: 5.2 },
      end: { latitude: 45.4, longitude: 5.3 },
      status: 'pending',
    });
    const backup = await buildBackup({ appVersion: '0.8.1' });

    await resetDatabase();
    const counts = await mergeBackup(backup);

    expect(counts.tracks.added).toBe(1);
    expect(await trackRepository.list()).toHaveLength(1);
  });
});

describe('export CSV', () => {
  const company = createCompany({ id: 'c1', name: 'SASU A', calculationMode: 'ik2026' });
  const vehicle = createVehicle({ id: 'v1', name: 'GLC', cv: 5, fuel: 'diesel' });
  const trips = [
    createTrip({
      id: 't1',
      companyId: 'c1',
      vehicleId: 'v1',
      date: '2026-08-01',
      from: 'Grenoble',
      to: 'Lyon',
      km: 110.4,
      purpose: 'Client "X"',
    }),
  ];

  const report = buildReport({
    trips,
    companies: [company],
    vehicles: [vehicle],
    beneficiary: null,
    filters: { companyId: 'c1', from: '2026-08-01', to: '2026-08-31' },
  });

  it('conserve l’en-tete de la v0.1.1', () => {
    expect(CSV_HEADER).toEqual([
      'Date',
      'Structure',
      'Véhicule',
      'Départ',
      'Destination',
      'Motif',
      'Kilomètres',
      'Montant EUR',
      'Calcul',
    ]);
  });

  it('produit un fichier compatible Excel francais', () => {
    const csv = buildCsv(report, { companyName: 'SASU A' });

    // BOM UTF-8 en tete
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // Separateur point-virgule et fin de ligne CRLF
    expect(csv).toContain(';');
    expect(csv).toContain('\r\n');
  });

  it('echappe les guillemets des donnees saisies', () => {
    const csv = buildCsv(report, { companyName: 'SASU A' });
    expect(csv).toContain('"Client ""X"""');
  });

  it('formate les nombres avec un point decimal', () => {
    const csv = buildCsv(report, { companyName: 'SASU A' });
    expect(csv).toContain('"110.4"');
  });

  it('nomme le fichier a partir de la structure et de la periode', () => {
    expect(csvFileName(report, { companyName: 'SASU A' })).toBe('agilmea-ik-sasu-a-2026-08-01.csv');
  });

  it('assainit le nom de fichier meme si la structure contient du balisage', () => {
    const name = csvFileName(report, { companyName: '<img src=x onerror=alert(1)>SASU' });
    expect(name).toBe('agilmea-ik-img-src-x-onerror-alert-1-sasu-2026-08-01.csv');
    expect(name).not.toMatch(/[<>"'/\\]/);
  });
});

describe('protection contre l’injection de formule dans le CSV', () => {
  const csvCompany = createCompany({ id: 'c1', name: 'SASU A', calculationMode: 'ik2026' });
  const csvVehicle = createVehicle({ id: 'v1', name: 'GLC', cv: 5, fuel: 'diesel' });

  const reportWith = (purpose) =>
    buildReport({
      trips: [
        createTrip({
          id: 'r1',
          companyId: 'c1',
          vehicleId: 'v1',
          date: '2026-08-01',
          from: 'Grenoble',
          to: 'Lyon',
          km: 110.4,
          purpose,
        }),
      ],
      companies: [csvCompany],
      vehicles: [csvVehicle],
      beneficiary: null,
      filters: { companyId: 'c1', from: '2026-08-01', to: '2026-08-31' },
    });

  it('neutralise les caracteres qui declenchent une formule', () => {
    // Cas realistes : sans protection, Excel affiche « #NOM? » a la place du texte.
    expect(escapeCsvFormula('-50 % remise client')).toBe("'-50 % remise client");
    expect(escapeCsvFormula('+ frais de parking')).toBe("'+ frais de parking");
    expect(escapeCsvFormula('=HYPERLINK("http://exemple","clic")')).toBe(
      '\'=HYPERLINK("http://exemple","clic")',
    );
    expect(escapeCsvFormula('@midi rendez-vous')).toBe("'@midi rendez-vous");
    expect(escapeCsvFormula('\tTabulation')).toBe("'\tTabulation");
  });

  it('laisse intact un texte ordinaire', () => {
    expect(escapeCsvFormula('Rendez-vous client')).toBe('Rendez-vous client');
    expect(escapeCsvFormula('Grenoble')).toBe('Grenoble');
    expect(escapeCsvFormula('')).toBe('');
    expect(escapeCsvFormula(null)).toBe('');
  });

  it('protege le motif dans le fichier produit', () => {
    const csv = buildCsv(reportWith('-50 % remise client'), { companyName: 'SASU A' });
    expect(csv).toContain('"\'-50 % remise client"');
  });

  it('protege aussi le nom de la structure', () => {
    // Le nom vient du rapport, ligne par ligne : c'est cette source qu'il faut
    // neutraliser, et non un libellé passé à l'export.
    const piegee = createCompany({ id: 'c1', name: '=cmd|calc', calculationMode: 'ik2026' });
    const rapport = buildReport({
      trips: [
        createTrip({
          id: 'r9',
          companyId: 'c1',
          vehicleId: 'v1',
          date: '2026-08-01',
          from: 'A',
          to: 'B',
          km: 10,
        }),
      ],
      companies: [piegee],
      vehicles: [csvVehicle],
      beneficiary: null,
      filters: { companyId: 'c1' },
    });

    expect(buildCsv(rapport, { companyName: '=cmd|calc' })).toContain('"\'=cmd|calc"');
  });

  it('ne touche PAS aux colonnes numeriques et a la date', () => {
    const csv = buildCsv(reportWith('Client X'), { companyName: 'SASU A' });
    const dataLine = csv.split('\r\n')[1].split(';');
    // Date, Kilometres et Montant doivent rester exploitables comme tels.
    expect(dataLine[0]).toBe('"2026-08-01"');
    expect(dataLine[6]).toBe('"110.4"');
    expect(dataLine[7]).toBe('"70.21"');
  });

  it('n’altere pas la ligne d’en-tete', () => {
    const header = buildCsv(reportWith('Client X'), { companyName: 'SASU A' })
      .replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '')
      .split('\r\n')[0];
    expect(header).not.toContain("'");
  });
});
