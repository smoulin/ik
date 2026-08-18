/**
 * Sauvegarde / restauration et export CSV.
 *
 * Point de non-regression important : une sauvegarde produite par la v0.1.1
 * doit rester importable, et le format CSV ne doit pas changer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../helpers/db.js';
import { buildBackup, restoreBackup, inspectBackup } from '../../src/services/backup/backupService.js';
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
