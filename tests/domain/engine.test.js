/**
 * Moteur de calcul : cumul annuel, franchissement de tranche, modes de calcul.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTripAmounts,
  accumulationKey,
  calculationModeLabel,
  IK_ACCUMULATION_SCOPE,
} from '../../src/domain/mileage/engine.js';
import { createCompany, createVehicle, createTrip } from '../../src/domain/models.js';

const vehicle = createVehicle({ id: 'v1', name: 'GLC', cv: 5, electric: false, fuel: 'diesel' });
const otherVehicle = createVehicle({ id: 'v2', name: 'Zoe', cv: 5, electric: true, fuel: 'petrol' });

const ikCompany = createCompany({ id: 'c1', name: 'SASU A', calculationMode: 'ik2026' });
const ikCompanyB = createCompany({ id: 'c2', name: 'SASU B', calculationMode: 'ik2026' });
const bicCompany = createCompany({ id: 'c3', name: 'EI LMP', calculationMode: 'bic2025' });
const fixedCompany = createCompany({
  id: 'c4',
  name: 'Perso',
  calculationMode: 'fixed',
  calculationSettings: { fixedRate: 0.25 },
});
const noneCompany = createCompany({ id: 'c5', name: 'Prive', calculationMode: 'none' });

const context = {
  companies: [ikCompany, ikCompanyB, bicCompany, fixedCompany, noneCompany],
  vehicles: [vehicle, otherVehicle],
};

function trip(overrides) {
  return createTrip({ companyId: 'c1', vehicleId: 'v1', date: '2026-03-01', km: 100, ...overrides });
}

describe('computeTripAmounts — bareme kilometrique', () => {
  it('applique le taux de la premiere tranche sous 5 000 km', () => {
    const t = trip({ id: 't1', km: 100 });
    const result = computeTripAmounts([t], context).get('t1');
    expect(result.amount).toBeCloseTo(63.6, 6);
    expect(result.beforeKm).toBe(0);
    expect(result.afterKm).toBe(100);
  });

  it('calcule le montant marginal quand un trajet franchit une tranche', () => {
    const first = trip({ id: 't1', km: 4900, createdAt: '2026-01-01T00:00:00.000Z' });
    const second = trip({
      id: 't2',
      km: 200,
      date: '2026-03-02',
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    const results = computeTripAmounts([first, second], context);

    // Cumul total identique au calcul direct sur 5 100 km.
    const total = results.get('t1').amount + results.get('t2').amount;
    expect(total).toBeCloseTo(5100 * 0.357 + 1395, 6);
    // Le second trajet, a cheval sur la tranche, ne vaut pas 200 x 0,636.
    expect(results.get('t2').amount).not.toBeCloseTo(127.2, 2);
  });

  it('impute les trajets par date puis par ordre de creation', () => {
    const late = trip({ id: 'late', km: 100, date: '2026-05-01' });
    const early = trip({ id: 'early', km: 100, date: '2026-01-01' });

    const results = computeTripAmounts([late, early], context);
    expect(results.get('early').beforeKm).toBe(0);
    expect(results.get('late').beforeKm).toBe(100);
  });

  it('repart de zero a chaque annee civile', () => {
    const y2025 = trip({ id: 'a', km: 6000, date: '2025-12-31' });
    const y2026 = trip({ id: 'b', km: 100, date: '2026-01-01' });

    const results = computeTripAmounts([y2025, y2026], context);
    expect(results.get('b').beforeKm).toBe(0);
  });

  it('ignore les trajets supprimes', () => {
    const kept = trip({ id: 'k', km: 100 });
    const removed = trip({ id: 'd', km: 5000, date: '2026-01-01', deletedAt: '2026-02-01T00:00:00.000Z' });

    const results = computeTripAmounts([kept, removed], context);
    expect(results.has('d')).toBe(false);
    expect(results.get('k').beforeKm).toBe(0);
  });
});

describe('perimetre du cumul annuel', () => {
  it('utilise structure + vehicule + annee — comportement retenu', () => {
    expect(IK_ACCUMULATION_SCOPE).toBe('company-vehicle-year');
    expect(accumulationKey({ companyId: 'c1', vehicleId: 'v1', date: '2026-03-01' })).toBe(
      'c1|v1|2026',
    );
  });

  it('ne melange pas les cumuls de deux structures utilisant le meme vehicule', () => {
    const a = trip({ id: 'a', companyId: 'c1', km: 4000, date: '2026-01-01' });
    const b = trip({ id: 'b', companyId: 'c2', km: 100, date: '2026-02-01' });

    const results = computeTripAmounts([a, b], context);
    // La SASU B repart de zero : premiere tranche, 0,636 €/km.
    expect(results.get('b').beforeKm).toBe(0);
    expect(results.get('b').amount).toBeCloseTo(63.6, 6);
  });

  it('permet de basculer sur un cumul par vehicule sans modifier le moteur', () => {
    const a = trip({ id: 'a', companyId: 'c1', km: 4000, date: '2026-01-01' });
    const b = trip({ id: 'b', companyId: 'c2', km: 100, date: '2026-02-01' });

    const results = computeTripAmounts([a, b], { ...context, scope: 'vehicle-year' });
    expect(results.get('b').beforeKm).toBe(4000);
  });

  it('separe les cumuls de deux vehicules d’une meme structure', () => {
    const a = trip({ id: 'a', vehicleId: 'v1', km: 4000, date: '2026-01-01' });
    const b = trip({ id: 'b', vehicleId: 'v2', km: 100, date: '2026-02-01' });

    const results = computeTripAmounts([a, b], context);
    expect(results.get('b').beforeKm).toBe(0);
  });
});

describe('autres modes de calcul', () => {
  it('applique le taux du bareme carburant BIC', () => {
    const t = trip({ id: 't', companyId: 'c3', km: 200 });
    const result = computeTripAmounts([t], context).get('t');
    // 5 CV gazole -> 0,110 €/km
    expect(result.amount).toBeCloseTo(22, 6);
    expect(result.rateInfo).toBe('0.110 €/km');
  });

  it('applique le taux personnalise de la structure', () => {
    const t = trip({ id: 't', companyId: 'c4', km: 200 });
    expect(computeTripAmounts([t], context).get('t').amount).toBeCloseTo(50, 6);
  });

  it('ne rembourse rien en mode « aucun remboursement »', () => {
    const t = trip({ id: 't', companyId: 'c5', km: 200 });
    expect(computeTripAmounts([t], context).get('t').amount).toBe(0);
  });

  it('renvoie 0 si la structure du trajet n’existe plus', () => {
    const t = trip({ id: 't', companyId: 'inconnu', km: 200 });
    expect(computeTripAmounts([t], context).get('t').amount).toBe(0);
  });
});

describe('calculationModeLabel', () => {
  it('n’invente pas de taux BIC sans vehicule', () => {
    expect(calculationModeLabel(bicCompany)).toContain('selon le véhicule');
    expect(calculationModeLabel(bicCompany, vehicle)).toContain('0.110');
  });

  it('affiche le taux personnalise', () => {
    expect(calculationModeLabel(fixedCompany)).toContain('0.250');
  });

  it('gere l’absence de structure', () => {
    expect(calculationModeLabel(null)).toBe('Aucun remboursement');
  });
});
