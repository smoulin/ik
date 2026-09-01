/**
 * Modele de rapport : presence du beneficiaire et de la structure, periode,
 * totaux, methode de calcul.
 *
 * Ces tests couvrent l'exigence §35 « verifier que les donnees du beneficiaire
 * et de la structure sont presentes dans les donnees utilisees pour generer
 * le rapport » — sans dependre d'un navigateur ni d'un moteur PDF.
 */

import { describe, it, expect } from 'vitest';
import { buildReport, buildPeriod, REPORT_TITLE } from '../../src/domain/reporting/reportModel.js';
import { createCompany, createVehicle, createTrip, createBeneficiary } from '../../src/domain/models.js';

const beneficiary = createBeneficiary({
  id: 'b1',
  firstName: 'Jean',
  lastName: 'Dupont',
  address: { line1: '12 rue Exemple', postalCode: '38000', city: 'Grenoble' },
});

const company = createCompany({
  id: 'c1',
  name: 'SASU A',
  legalName: 'SASU EXEMPLE',
  siren: '123456789',
  siret: '12345678900012',
  calculationMode: 'ik2026',
  address: { line1: '5 avenue des Tests', postalCode: '69000', city: 'Lyon' },
});

const vehicle = createVehicle({ id: 'v1', name: 'GLC', cv: 5, electric: false, fuel: 'diesel' });

const trips = [
  createTrip({
    id: 't1',
    companyId: 'c1',
    vehicleId: 'v1',
    date: '2026-08-03',
    from: 'Grenoble',
    to: 'Lyon',
    km: 110,
    purpose: 'Client X',
  }),
  createTrip({
    id: 't2',
    companyId: 'c1',
    vehicleId: 'v1',
    date: '2026-08-20',
    from: 'Grenoble',
    to: 'Chambery',
    km: 60,
    roundTrip: true,
  }),
  createTrip({
    id: 't3',
    companyId: 'c1',
    vehicleId: 'v1',
    date: '2026-09-01',
    from: 'Grenoble',
    to: 'Valence',
    km: 90,
  }),
];

function report(filters = {}) {
  return buildReport({
    trips,
    companies: [company],
    vehicles: [vehicle],
    beneficiary,
    appVersion: '0.2.0',
    filters: { companyId: 'c1', from: '2026-08-01', to: '2026-08-31', ...filters },
  });
}

describe('en-tete du rapport', () => {
  it('porte le titre « État des frais kilométriques »', () => {
    expect(report().title).toBe(REPORT_TITLE);
    expect(REPORT_TITLE).toBe('État des frais kilométriques');
  });

  it('contient le beneficiaire, nom de famille en majuscules', () => {
    const block = report().beneficiary;
    expect(block.present).toBe(true);
    expect(block.name).toBe('Jean DUPONT');
    expect(block.addressLines).toEqual(['12 rue Exemple', '38000 Grenoble']);
    expect(block.lines).toEqual(['Jean DUPONT', '12 rue Exemple', '38000 Grenoble']);
  });

  it('signale explicitement un beneficiaire absent', () => {
    const without = buildReport({
      trips,
      companies: [company],
      vehicles: [vehicle],
      beneficiary: null,
      filters: { companyId: 'c1' },
    });
    expect(without.beneficiary.present).toBe(false);
    expect(without.beneficiary.lines).toEqual([]);
  });

  it('contient la structure, son adresse et ses identifiants formates', () => {
    const block = report().company;
    expect(block.present).toBe(true);
    expect(block.displayName).toBe('SASU EXEMPLE');
    expect(block.addressLines).toEqual(['5 avenue des Tests', '69000 Lyon']);
    // Le SIRET contient deja le SIREN : les afficher tous deux ferait doublon.
    expect(block.identifiers).toEqual(['SIRET 123 456 789 00012']);
  });

  it('se rabat sur le SIREN quand le SIRET n’est pas renseigné', () => {
    const sansSiret = createCompany({
      id: 'c8',
      name: 'SASU C',
      siren: '987654321',
      calculationMode: 'ik2026',
    });
    const result = buildReport({
      trips: [],
      companies: [sansSiret],
      vehicles: [],
      beneficiary,
      filters: { companyId: 'c8' },
    });
    expect(result.company.identifiers).toEqual(['SIREN 987 654 321']);
  });

  it('n’affiche que les identifiants renseignes', () => {
    const minimal = createCompany({ id: 'c9', name: 'Perso', calculationMode: 'none' });
    const result = buildReport({
      trips: [],
      companies: [minimal],
      vehicles: [],
      beneficiary,
      filters: { companyId: 'c9' },
    });
    expect(result.company.identifiers).toEqual([]);
    expect(result.company.addressLines).toEqual([]);
  });
});

describe('periode', () => {
  it('affiche le mois en toutes lettres quand la periode couvre un mois entier', () => {
    expect(buildPeriod('2026-08-01', '2026-08-31').label).toBe('Période : août 2026');
    expect(buildPeriod('2026-08-01', '2026-08-31').isFullMonth).toBe(true);
  });

  it('gere le mois de fevrier et les annees bissextiles', () => {
    expect(buildPeriod('2026-02-01', '2026-02-28').label).toBe('Période : février 2026');
    expect(buildPeriod('2024-02-01', '2024-02-29').label).toBe('Période : février 2024');
    expect(buildPeriod('2026-02-01', '2026-02-27').label).toBe('Du 01/02/2026 au 27/02/2026');
  });

  it('affiche les dates exactes sinon', () => {
    expect(buildPeriod('2026-08-01', '2026-09-15').label).toBe('Du 01/08/2026 au 15/09/2026');
  });

  it('gere les bornes absentes', () => {
    expect(buildPeriod('', '').label).toBe('Période : toutes les dates');
    expect(buildPeriod('2026-08-01', '').label).toBe('À partir du 01/08/2026');
  });
});

describe('lignes et totaux', () => {
  it('ne retient que les trajets de la periode et de la structure', () => {
    const result = report();
    expect(result.lines.map((line) => line.id)).toEqual(['t1', 't2']);
    expect(result.totals.tripCount).toBe(2);
  });

  it('totalise les kilometres et les indemnites', () => {
    const result = report();
    expect(result.totals.km).toBe(170);
    // 170 km sous 5 000 km cumules -> 170 x 0,636
    expect(result.totals.amount).toBeCloseTo(108.12, 2);
  });

  it('calcule le cumul annuel sur TOUS les trajets, pas seulement la periode', () => {
    const big = createTrip({
      id: 't0',
      companyId: 'c1',
      vehicleId: 'v1',
      date: '2026-01-05',
      km: 4990,
      createdAt: '2026-01-05T00:00:00.000Z',
    });
    const result = buildReport({
      trips: [big, ...trips],
      companies: [company],
      vehicles: [vehicle],
      beneficiary,
      filters: { companyId: 'c1', from: '2026-08-01', to: '2026-08-31' },
    });
    // Le trajet de janvier, hors periode, a deja consomme la premiere tranche.
    expect(result.totals.amount).toBeLessThan(108.12);
  });

  it('expose le vehicule et le motif de chaque ligne', () => {
    const line = report().lines[0];
    expect(line.vehicleName).toBe('GLC');
    expect(line.purpose).toBe('Client X');
    expect(line.dateLabel).toBe('03/08/2026');
    expect(report().lines[1].roundTrip).toBe(true);
  });

  it('filtre par vehicule quand il est precise', () => {
    const other = createVehicle({ id: 'v2', name: 'Zoe', cv: 4, electric: true });
    const result = buildReport({
      trips,
      companies: [company],
      vehicles: [vehicle, other],
      beneficiary,
      filters: { companyId: 'c1', vehicleId: 'v2' },
    });
    expect(result.lines).toHaveLength(0);
  });
});

describe('avertissement sur le partage d’un vehicule entre structures', () => {
  const sasuA = createCompany({ id: 'a', name: 'SASU A', calculationMode: 'ik2026' });
  const sasuB = createCompany({ id: 'b', name: 'SASU B', calculationMode: 'ik2026' });
  const eiLmp = createCompany({ id: 'e', name: 'EI LMP', calculationMode: 'bic2025' });
  const car = createVehicle({ id: 'v1', name: 'GLC', cv: 5, fuel: 'diesel' });

  const tripFor = (companyId, date, id) =>
    createTrip({ id, companyId, vehicleId: 'v1', date, from: 'A', to: 'B', km: 100 });

  it('avertit quand deux structures au bareme IK partagent le meme vehicule la meme annee', () => {
    const result = buildReport({
      trips: [tripFor('a', '2026-08-03', 't1'), tripFor('b', '2026-08-04', 't2')],
      companies: [sasuA, sasuB],
      vehicles: [car],
      beneficiary,
      filters: { companyId: 'a' },
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('ik-scope-shared-vehicle');
    expect(result.warnings[0].message).toContain('SASU A');
    expect(result.warnings[0].message).toContain('SASU B');
    expect(result.warnings[0].message).toContain('2026');
  });

  it('n’avertit pas quand les structures utilisent des baremes differents', () => {
    // Cas courant : une SASU au barème kilométrique, une EI au barème carburant.
    const result = buildReport({
      trips: [tripFor('a', '2026-08-03', 't1'), tripFor('e', '2026-08-04', 't2')],
      companies: [sasuA, eiLmp],
      vehicles: [car],
      beneficiary,
      filters: { companyId: 'a' },
    });

    expect(result.warnings).toEqual([]);
  });

  it('n’avertit pas si une seule structure utilise le vehicule', () => {
    const result = buildReport({
      trips: [tripFor('a', '2026-08-03', 't1'), tripFor('a', '2026-08-04', 't2')],
      companies: [sasuA, sasuB],
      vehicles: [car],
      beneficiary,
      filters: { companyId: 'a' },
    });

    expect(result.warnings).toEqual([]);
  });

  it('n’avertit pas si le partage porte sur deux annees differentes', () => {
    const result = buildReport({
      trips: [tripFor('a', '2026-08-03', 't1'), tripFor('b', '2025-08-04', 't2')],
      companies: [sasuA, sasuB],
      vehicles: [car],
      beneficiary,
      filters: { companyId: 'a' },
    });

    expect(result.warnings).toEqual([]);
  });

  it('n’avertit pas sur un rapport d’une structure hors bareme IK', () => {
    const result = buildReport({
      trips: [tripFor('a', '2026-08-03', 't1'), tripFor('e', '2026-08-04', 't2')],
      companies: [sasuA, eiLmp],
      vehicles: [car],
      beneficiary,
      filters: { companyId: 'e' },
    });

    expect(result.warnings).toEqual([]);
  });
});

describe('methode de calcul et vehicules', () => {
  /*
   * B14 — l'annee du bareme vient de la DATE DES TRAJETS, pas de la structure.
   * Les trajets de reference sont dates de 2026 : aucun bareme n'est encore
   * publie pour cette annee, le dernier connu sert et le dit.
   */
  it('indique la methode et l’annee du bareme', () => {
    const result = report();
    expect(result.calculation.mode).toBe('ik2026');
    expect(result.calculation.label).toContain('déplacements 2025');
    expect(result.calculation.scaleYear).toBe(2025);
    expect(result.calculation.scaleProvisional).toBe(true);
  });

  it('valorise un trajet passé au barème de son année', () => {
    const ancien = createTrip({
      id: 'vieux',
      companyId: 'c1',
      vehicleId: 'v1',
      date: '2024-06-15',
      km: 100,
    });
    const result = buildReport({
      trips: [ancien],
      companies: [company],
      vehicles: [vehicle],
      beneficiary,
      filters: { companyId: 'c1', from: '2024-01-01', to: '2024-12-31' },
    });

    expect(result.calculation.scaleYear).toBe(2024);
    expect(result.calculation.scaleProvisional).toBe(false);
    expect(result.lines[0].scaleYear).toBe(2024);
  });

  // B15 — a cheval sur deux annees, aucune ne peut representer l'autre.
  it('annonce les deux années quand le rapport est à cheval', () => {
    const trajets = [
      createTrip({ id: 'a', companyId: 'c1', vehicleId: 'v1', date: '2024-12-20', km: 50 }),
      createTrip({ id: 'b', companyId: 'c1', vehicleId: 'v1', date: '2025-01-10', km: 50 }),
    ];
    const result = buildReport({
      trips: trajets,
      companies: [company],
      vehicles: [vehicle],
      beneficiary,
      filters: { companyId: 'c1', from: '2024-12-01', to: '2025-01-31' },
    });

    expect(result.calculation.scaleYears).toEqual([2024, 2025]);
    // Aucune annee unique ne doit etre annoncee a la place des deux.
    expect(result.calculation.scaleYear).toBeNull();

    /*
     * Et le libelle ne doit pas en nommer une non plus : « déplacements 2025 »
     * juste au-dessus de « Années du barème 2024 et 2025 » se contredit.
     * La mention « provisoire » serait fausse par-dessus le marché, les deux
     * années étant publiées.
     */
    expect(result.calculation.label).not.toMatch(/déplacements \d{4}/);
    expect(result.calculation.label).not.toMatch(/provisoire/);
  });

  it('ne nomme aucun barème sur un rapport sans trajet', () => {
    const result = buildReport({
      trips,
      companies: [company],
      vehicles: [vehicle],
      beneficiary,
      filters: { companyId: 'c1', from: '2020-01-01', to: '2020-12-31' },
    });

    expect(result.lines).toHaveLength(0);
    expect(result.calculation.scaleYears).toEqual([]);
    // Un rapport vide n'a pas de réserve à porter.
    expect(result.calculation.label).not.toMatch(/provisoire/);
    expect(result.calculation.scaleProvisional).toBe(false);
  });

  it('recapitule les vehicules utilises avec leur puissance fiscale', () => {
    const result = report();
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]).toMatchObject({ name: 'GLC', cv: 5, cvApplied: 5, electric: false });
  });

  it('signale la puissance fiscale reellement appliquee au-dela de 7 CV', () => {
    const bigCar = createVehicle({ id: 'v3', name: '4x4', cv: 12, fuel: 'diesel' });
    const t = createTrip({ id: 'x', companyId: 'c1', vehicleId: 'v3', date: '2026-08-05', km: 10 });
    const result = buildReport({
      trips: [t],
      companies: [company],
      vehicles: [bigCar],
      beneficiary,
      filters: { companyId: 'c1' },
    });
    expect(result.vehicles[0].cvApplied).toBe(7);
  });

  it('reporte la version de l’application', () => {
    expect(report().appVersion).toBe('0.2.0');
  });

  /*
   * Un meme etat de frais reedite deux mois plus tard doit rester le meme
   * document. Une date d'edition le ferait paraitre different, sans rien
   * apporter que la periode couverte ne dise deja.
   */
  it('ne porte aucune date d’édition', () => {
    const built = report();
    expect(built.generatedAt).toBeUndefined();
    expect(built.generatedAtLabel).toBeUndefined();

    // Aucun champ de premier niveau ne doit reintroduire la notion.
    const suspects = Object.keys(built).filter((key) => /generat|edite|edited/i.test(key));
    expect(suspects).toEqual([]);
  });
});

describe('rapport de synthèse, toutes structures', () => {
  const sasu = createCompany({ id: 'a', name: 'SASU A', calculationMode: 'ik2026' });
  const ei = createCompany({
    id: 'b',
    name: 'EI LMP',
    calculationMode: 'fixed',
    calculationSettings: { fixedRate: 0.2 },
  });
  const car = createVehicle({ id: 'v1', name: 'GLC', cv: 5, fuel: 'diesel' });

  const mixte = [
    createTrip({ id: 'x1', companyId: 'a', vehicleId: 'v1', date: '2026-08-03', km: 100 }),
    createTrip({ id: 'x2', companyId: 'b', vehicleId: 'v1', date: '2026-08-04', km: 50 }),
    createTrip({ id: 'x3', companyId: 'a', vehicleId: 'v1', date: '2026-08-05', km: 30 }),
  ];

  const synthese = (filters = {}) =>
    buildReport({
      trips: mixte,
      companies: [sasu, ei],
      vehicles: [car],
      beneficiary,
      filters: { from: '2026-08-01', to: '2026-08-31', ...filters },
    });

  it('retient les trajets de toutes les structures quand aucune n’est choisie', () => {
    const result = synthese();
    expect(result.allCompanies).toBe(true);
    expect(result.lines.map((l) => l.id)).toEqual(['x1', 'x2', 'x3']);
    expect(result.totals.tripCount).toBe(3);
    expect(result.totals.km).toBe(180);
  });

  it('porte un titre de synthèse, pas d’état de frais', () => {
    expect(synthese().title).toBe('Synthèse des frais kilométriques');
    // Un rapport adressé à une structure garde son titre habituel.
    expect(synthese({ companyId: 'a' }).title).toBe(REPORT_TITLE);
  });

  it('indique la structure sur chaque ligne', () => {
    const lignes = synthese().lines;
    expect(lignes.map((l) => l.companyName)).toEqual(['SASU A', 'EI LMP', 'SASU A']);
  });

  it('applique à chaque trajet le barème de SA structure', () => {
    const result = synthese();
    const parId = Object.fromEntries(result.lines.map((l) => [l.id, l.amount]));

    // SASU A au barème kilométrique 5 CV : 0,636 €/km.
    expect(parId.x1).toBeCloseTo(63.6, 6);
    // EI LMP au taux fixe de 0,20 €/km.
    expect(parId.x2).toBeCloseTo(10, 6);
  });

  it('totalise par structure, du montant le plus élevé au plus faible', () => {
    const parStructure = synthese().byCompany;

    expect(parStructure).toHaveLength(2);
    expect(parStructure[0]).toMatchObject({ name: 'SASU A', tripCount: 2, km: 130 });
    expect(parStructure[1]).toMatchObject({ name: 'EI LMP', tripCount: 1, km: 50 });
    // La somme des sous-totaux doit égaler le total général.
    const somme = parStructure.reduce((s, e) => s + e.amount, 0);
    expect(somme).toBeCloseTo(synthese().totals.amount, 2);
  });

  it('liste la méthode de calcul de chaque structure', () => {
    const methodes = synthese().calculationsByCompany;
    expect(methodes).toHaveLength(2);
    expect(methodes.find((m) => m.companyName === 'EI LMP').label).toContain('0,200 €/km');
    expect(methodes.find((m) => m.companyName === 'SASU A').label).toContain('Barème IK');
  });

  it('n’affiche pas l’avertissement de périmètre sur une synthèse', () => {
    // Le détail par structure y figure déjà : l'avertissement ferait doublon.
    expect(synthese().warnings).toEqual([]);
  });

  it('reste combinable avec le filtre de véhicule et la période', () => {
    const autre = createVehicle({ id: 'v2', name: 'Zoe', cv: 4, electric: true });
    const result = buildReport({
      trips: mixte,
      companies: [sasu, ei],
      vehicles: [car, autre],
      beneficiary,
      filters: { vehicleId: 'v2' },
    });
    expect(result.lines).toHaveLength(0);
    expect(result.byCompany).toEqual([]);
  });

  it('ne produit aucun sous-total sur un rapport mono-structure', () => {
    const result = synthese({ companyId: 'a' });
    expect(result.allCompanies).toBe(false);
    expect(result.byCompany).toEqual([]);
    expect(result.calculationsByCompany).toEqual([]);
  });
});
