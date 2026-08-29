/**
 * Verrouillage des baremes.
 *
 * Ces tests existent pour empecher une modification accidentelle des valeurs
 * fiscales : toute evolution du bareme doit etre un choix conscient, accompagne
 * d'une mise a jour explicite de ces attentes.
 */

import { describe, it, expect } from 'vitest';
import {
  annualIkAmount,
  normalizeCv,
  getIkCoefficients,
  resolveIkScale,
} from '../../src/domain/mileage/ikScale.js';
import { bicRate, bicCvGroup, resolveBicScale } from '../../src/domain/mileage/bicScale.js';
import { IK_SCALES, BIC_FUEL_SCALES } from '../../src/domain/mileage/scales.js';

const thermal5cv = { cv: 5, electric: false, fuel: 'diesel' };
const electric5cv = { cv: 5, electric: true, fuel: 'petrol' };

describe('bareme kilometrique — valeurs officielles', () => {
  // B3 — arrete du 27 mars 2023, transcription exacte.
  it('conserve les coefficients thermiques de l’arrêté du 27 mars 2023', () => {
    expect(IK_SCALES[2025].thermal[3]).toEqual({ a: 0.529, b: 0.316, c: 1065, d: 0.37 });
    expect(IK_SCALES[2025].thermal[4]).toEqual({ a: 0.606, b: 0.34, c: 1330, d: 0.407 });
    expect(IK_SCALES[2025].thermal[5]).toEqual({ a: 0.636, b: 0.357, c: 1395, d: 0.427 });
    expect(IK_SCALES[2025].thermal[6]).toEqual({ a: 0.665, b: 0.374, c: 1457, d: 0.447 });
    expect(IK_SCALES[2025].thermal[7]).toEqual({ a: 0.697, b: 0.394, c: 1515, d: 0.47 });
  });

  /*
   * B4 — la majoration electrique est une donnee, jamais un calcul :
   * 0,529 x 1,2 = 0,6348, que l'administration publie a 0,635. La recalculer
   * ferait diverger l'application du texte.
   */
  it('conserve les coefficients électriques tels que publiés, non recalculés', () => {
    expect(IK_SCALES[2025].electric[3]).toEqual({ a: 0.635, b: 0.379, c: 1278, d: 0.444 });
    expect(IK_SCALES[2025].electric[7]).toEqual({ a: 0.836, b: 0.473, c: 1818, d: 0.564 });
    expect(IK_SCALES[2025].electric[3].a).not.toBe(0.529 * 1.2);
  });

  // B2 — aucun arrete n'a modifie le bareme depuis les deplacements de 2022.
  it('applique le même barème aux déplacements de 2022 à 2025', () => {
    for (const year of [2022, 2023, 2024]) {
      expect(IK_SCALES[year].thermal).toEqual(IK_SCALES[2025].thermal);
      expect(IK_SCALES[year].electric).toEqual(IK_SCALES[2025].electric);
    }
  });

  it('nomme chaque barème par son année de déplacement', () => {
    expect(IK_SCALES[2024].label).toBe('Barème IK France — déplacements 2024');
    expect(IK_SCALES[2024].year).toBe(2024);
  });

  // B10 a B12 — celui-ci change vraiment chaque annee, et il baisse.
  it('conserve les taux du barème carburant BIC, année par année', () => {
    expect(BIC_FUEL_SCALES[2023].rates['5-7']).toEqual({
      diesel: 0.122,
      petrol: 0.152,
      lpg: 0.09,
    });
    expect(BIC_FUEL_SCALES[2024].rates['5-7']).toEqual({
      diesel: 0.116,
      petrol: 0.147,
      lpg: 0.091,
    });
    expect(BIC_FUEL_SCALES[2025].rates['3-4']).toEqual({
      diesel: 0.089,
      petrol: 0.113,
      lpg: 0.072,
    });
    expect(BIC_FUEL_SCALES[2025].rates['12+']).toEqual({
      diesel: 0.165,
      petrol: 0.208,
      lpg: 0.133,
    });
  });
});

describe('resolution du bareme par annee', () => {
  // B1
  it('rend le barème exact d’une année publiée', () => {
    const { appliedYear, provisional } = resolveIkScale(2024);
    expect(appliedYear).toBe(2024);
    expect(provisional).toBe(false);
  });

  // B5 — le bareme de l'annee en cours ne parait qu'au printemps suivant.
  it('signale comme provisoire une année sans barème publié', () => {
    const { appliedYear, provisional } = resolveIkScale(2026);
    expect(appliedYear).toBe(2025);
    expect(provisional).toBe(true);
  });

  // B6
  it('signale aussi une année trop ancienne', () => {
    const { appliedYear, provisional } = resolveIkScale(2019);
    expect(appliedYear).toBe(2022);
    expect(provisional).toBe(true);
  });

  it('tolère une année absente ou illisible', () => {
    expect(resolveIkScale(undefined).provisional).toBe(true);
    expect(resolveIkScale('').scale).toBeTruthy();
  });

  it('applique la même règle au barème carburant BIC', () => {
    expect(resolveBicScale(2024)).toMatchObject({ appliedYear: 2024, provisional: false });
    expect(resolveBicScale(2026)).toMatchObject({ appliedYear: 2025, provisional: true });
  });

  // B10 a B13 — l'annee doit reellement changer le taux.
  it('donne un taux BIC différent selon l’année', () => {
    expect(bicRate(thermal5cv, 2023)).toBe(0.122);
    expect(bicRate(thermal5cv, 2024)).toBe(0.116);
    expect(bicRate(thermal5cv, 2025)).toBe(0.11);
  });
});

describe('normalizeCv', () => {
  it('plafonne le bareme entre 3 et 7 CV', () => {
    expect(normalizeCv(1)).toBe(3);
    expect(normalizeCv(3)).toBe(3);
    expect(normalizeCv(5)).toBe(5);
    expect(normalizeCv(7)).toBe(7);
    expect(normalizeCv(12)).toBe(7);
  });

  it('retombe sur 3 CV pour une valeur absente ou invalide', () => {
    expect(normalizeCv(undefined)).toBe(3);
    expect(normalizeCv('abc')).toBe(3);
  });
});

describe('annualIkAmount', () => {
  it('applique le forfait simple jusqu’a 5 000 km', () => {
    expect(annualIkAmount(1000, thermal5cv)).toBeCloseTo(636, 6);
    expect(annualIkAmount(5000, thermal5cv)).toBeCloseTo(3180, 6);
  });

  it('applique la formule avec majoration entre 5 001 et 20 000 km', () => {
    // 10 000 x 0,357 + 1 395
    expect(annualIkAmount(10000, thermal5cv)).toBeCloseTo(4965, 6);
    expect(annualIkAmount(20000, thermal5cv)).toBeCloseTo(8535, 6);
  });

  it('applique le taux reduit au-dela de 20 000 km', () => {
    expect(annualIkAmount(25000, thermal5cv)).toBeCloseTo(10675, 6);
  });

  it('majore le bareme pour un vehicule 100 % electrique', () => {
    expect(annualIkAmount(1000, electric5cv)).toBeCloseTo(763, 6);
    expect(annualIkAmount(1000, electric5cv)).toBeGreaterThan(annualIkAmount(1000, thermal5cv));
  });

  it('renvoie 0 sans vehicule ou pour une distance negative', () => {
    expect(annualIkAmount(1000, null)).toBe(0);
    expect(annualIkAmount(-50, thermal5cv)).toBe(0);
  });

  it('expose les coefficients reellement appliques', () => {
    expect(getIkCoefficients({ cv: 30, electric: false })).toEqual(IK_SCALES[2025].thermal[7]);
  });
});

describe('bareme carburant BIC', () => {
  it('regroupe correctement les puissances fiscales', () => {
    expect(bicCvGroup(3)).toBe('3-4');
    expect(bicCvGroup(4)).toBe('3-4');
    expect(bicCvGroup(7)).toBe('5-7');
    expect(bicCvGroup(9)).toBe('8-9');
    expect(bicCvGroup(11)).toBe('10-11');
    expect(bicCvGroup(15)).toBe('12+');
  });

  it('renvoie le taux du carburant du vehicule', () => {
    expect(bicRate({ cv: 5, fuel: 'diesel' })).toBe(0.11);
    expect(bicRate({ cv: 5, fuel: 'petrol' })).toBe(0.139);
    expect(bicRate({ cv: 5, fuel: 'lpg' })).toBe(0.089);
  });

  it('renvoie 0 pour un carburant inconnu ou sans vehicule', () => {
    expect(bicRate({ cv: 5, fuel: 'hydrogen' })).toBe(0);
    expect(bicRate(null)).toBe(0);
  });
});
