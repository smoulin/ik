/**
 * Bareme personnalise defini par l'utilisateur.
 *
 * Le point critique est le calcul marginal : comme pour le bareme officiel, le
 * montant d'un trajet se deduit du cumul annuel, sinon un trajet a cheval sur
 * deux tranches serait mal facture.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCustomScale,
  validateCustomScale,
  customAnnualAmount,
  bracketFor,
  customBracketLabel,
  describeCustomScale,
} from '../../src/domain/mileage/customScale.js';
import { computeTripAmounts, calculationModeLabel } from '../../src/domain/mileage/engine.js';
import { createCompany, createVehicle, createTrip } from '../../src/domain/models.js';

/**
 * Rend les comparaisons insensibles au type d'espace : le separateur de
 * milliers est une espace insecable, invisible a la lecture d'un test.
 */
const esp = (value) => String(value).replace(/\s/g, ' ');

/** Reproduction du bareme officiel 3 CV, pour verifier l'equivalence. */
const officiel = {
  label: 'Copie du barème officiel',
  brackets: [
    { upToKm: 5000, rate: 0.529, flatBonus: 0 },
    { upToKm: 20000, rate: 0.316, flatBonus: 1065 },
    { upToKm: null, rate: 0.37, flatBonus: 0 },
  ],
};

const tauxUnique = { label: 'Forfait maison', brackets: [{ upToKm: null, rate: 0.5 }] };

describe('normalisation', () => {
  it('trie les tranches et place « au-delà » en dernier', () => {
    const scale = normalizeCustomScale({
      brackets: [
        { upToKm: null, rate: 0.37 },
        { upToKm: 20000, rate: 0.316 },
        { upToKm: 5000, rate: 0.529 },
      ],
    });
    expect(scale.brackets.map((b) => b.upToKm)).toEqual([5000, 20000, null]);
  });

  it('fournit un barème minimal si aucune tranche n’est donnée', () => {
    const scale = normalizeCustomScale({});
    expect(scale.brackets).toHaveLength(1);
    expect(scale.brackets[0].upToKm).toBeNull();
  });

  it('refuse les bornes et taux négatifs', () => {
    const scale = normalizeCustomScale({ brackets: [{ upToKm: -5, rate: -1, flatBonus: -3 }] });
    expect(scale.brackets[0]).toEqual({ upToKm: null, rate: 0, flatBonus: 0 });
  });

  it('donne un nom par défaut', () => {
    expect(normalizeCustomScale({}).label).toBe('Barème personnalisé');
    expect(normalizeCustomScale({ label: '  Interne  ' }).label).toBe('Interne');
  });
});

describe('validation', () => {
  it('accepte un barème cohérent', () => {
    expect(validateCustomScale(officiel)).toEqual([]);
    expect(validateCustomScale(tauxUnique)).toEqual([]);
  });

  it('exige une tranche sans limite', () => {
    const problems = validateCustomScale({ brackets: [{ upToKm: 5000, rate: 0.5 }] });
    expect(problems.join(' ')).toContain('sans limite');
  });

  it('refuse deux tranches ouvertes', () => {
    const problems = validateCustomScale({
      brackets: [{ upToKm: null, rate: 0.4 }, { upToKm: null, rate: 0.5 }],
    });
    expect(problems.join(' ')).toContain('Une seule tranche');
  });

  it('refuse deux tranches de même limite', () => {
    const problems = validateCustomScale({
      brackets: [
        { upToKm: 5000, rate: 0.5 },
        { upToKm: 5000, rate: 0.4 },
        { upToKm: null, rate: 0.3 },
      ],
    });
    expect(problems.join(' ')).toContain('même limite');
  });

  it('refuse un barème entièrement à zéro', () => {
    const problems = validateCustomScale({ brackets: [{ upToKm: null, rate: 0 }] });
    expect(problems.join(' ')).toContain('taux supérieur à 0');
  });
});

describe('calcul du montant', () => {
  it('reproduit exactement le barème officiel 3 CV', () => {
    // Valeurs verrouillées par ailleurs dans ikScale.test.js.
    expect(customAnnualAmount(1000, officiel)).toBeCloseTo(529, 6);
    expect(customAnnualAmount(10000, officiel)).toBeCloseTo(10000 * 0.316 + 1065, 6);
    expect(customAnnualAmount(25000, officiel)).toBeCloseTo(25000 * 0.37, 6);
  });

  it('applique un taux unique sur toute distance', () => {
    expect(customAnnualAmount(100, tauxUnique)).toBeCloseTo(50, 6);
    expect(customAnnualAmount(100000, tauxUnique)).toBeCloseTo(50000, 6);
  });

  it('traite la borne comme incluse', () => {
    expect(bracketFor(5000, officiel).upToKm).toBe(5000);
    expect(bracketFor(5001, officiel).upToKm).toBe(20000);
  });

  it('renvoie 0 pour une distance nulle ou négative', () => {
    expect(customAnnualAmount(0, officiel)).toBe(0);
    expect(customAnnualAmount(-100, officiel)).toBe(0);
  });
});

describe('libellés', () => {
  it('décrit la tranche atteinte', () => {
    expect(esp(customBracketLabel(1000, officiel))).toBe('jusqu’à 5 000 km');
    expect(esp(customBracketLabel(10000, officiel))).toBe('de 5 001 à 20 000 km');
    expect(esp(customBracketLabel(30000, officiel))).toBe('au-delà de 20 000 km');
    expect(customBracketLabel(10, tauxUnique)).toBe('toutes distances');
  });

  it('résume le barème complet', () => {
    expect(describeCustomScale(tauxUnique)).toBe('au-delà : 0,500 €/km');
    expect(esp(describeCustomScale(officiel))).toContain('jusqu’à 5 000 km : 0,529 €/km');
    expect(esp(describeCustomScale(officiel))).toContain('+ 1 065 €');
  });
});

describe('intégration dans le moteur de calcul', () => {
  const vehicle = createVehicle({ id: 'v1', name: 'GLC', cv: 5, fuel: 'diesel' });
  const company = createCompany({
    id: 'c1',
    name: 'SASU perso',
    calculationMode: 'custom',
    calculationSettings: { customScale: officiel },
  });
  const context = { companies: [company], vehicles: [vehicle] };

  const trip = (over) =>
    createTrip({ companyId: 'c1', vehicleId: 'v1', date: '2026-03-01', km: 100, ...over });

  it('facture un trajet au taux de la première tranche', () => {
    const result = computeTripAmounts([trip({ id: 't1', km: 100 })], context).get('t1');
    expect(result.amount).toBeCloseTo(52.9, 6);
    expect(result.rateInfo).toContain('Copie du barème officiel');
  });

  it('calcule le montant marginal au franchissement d’une tranche', () => {
    const first = trip({ id: 'a', km: 4900, createdAt: '2026-01-01T00:00:00.000Z' });
    const second = trip({
      id: 'b',
      km: 200,
      date: '2026-03-02',
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    const results = computeTripAmounts([first, second], context);
    const total = results.get('a').amount + results.get('b').amount;

    // Identique au calcul direct sur le cumul de 5 100 km.
    expect(total).toBeCloseTo(5100 * 0.316 + 1065, 6);
  });

  it('repart de zéro chaque année', () => {
    const y2025 = trip({ id: 'x', km: 6000, date: '2025-12-31' });
    const y2026 = trip({ id: 'y', km: 100, date: '2026-01-01' });
    const results = computeTripAmounts([y2025, y2026], context);
    expect(results.get('y').beforeKm).toBe(0);
    expect(results.get('y').amount).toBeCloseTo(52.9, 6);
  });

  it('affiche le barème dans le libellé de la structure', () => {
    const label = calculationModeLabel(company);
    expect(label).toContain('Copie du barème officiel');
    expect(esp(label)).toContain('0,529 €/km');
  });

  it('reste sans effet si aucun barème n’est défini', () => {
    const vide = createCompany({ id: 'c2', name: 'X', calculationMode: 'custom' });
    const t = trip({ id: 'z', companyId: 'c2', km: 100 });
    const result = computeTripAmounts([t], { companies: [vide], vehicles: [vehicle] }).get('z');
    expect(result.amount).toBe(0);
  });
});
