/**
 * Saisie et affichage des nombres a la francaise.
 *
 * Ces tests couvrent un bug constate en conditions reelles : sur un clavier
 * francais, saisir « 10,5 » dans un <input type="number"> vidait le champ,
 * et le trajet etait enregistre a 0 km sans aucun avertissement.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDecimal,
  formatDecimalInput,
  formatDateFr,
  formatMonthFr,
  todayIso,
  lastDayOfMonth,
} from '../../src/shared/format.js';

describe('parseDecimal', () => {
  it('accepte la virgule decimale francaise', () => {
    expect(parseDecimal('10,5')).toBe(10.5);
    expect(parseDecimal('0,139')).toBe(0.139);
    expect(parseDecimal('103,9')).toBe(103.9);
  });

  it('accepte aussi le point decimal', () => {
    expect(parseDecimal('10.5')).toBe(10.5);
    expect(parseDecimal('45.188812')).toBe(45.188812);
  });

  it('accepte les entiers et les nombres negatifs', () => {
    expect(parseDecimal('120')).toBe(120);
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('-5')).toBe(-5);
    expect(parseDecimal('-1,5')).toBe(-1.5);
  });

  it('ignore les espaces, y compris les espaces insecables du clavier', () => {
    expect(parseDecimal(' 10,5 ')).toBe(10.5);
    expect(parseDecimal('1 0,5')).toBe(10.5);
  });

  it('distingue « vide » de « zero » — c’est tout l’enjeu du bug corrige', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    // Un zero explicitement saisi reste un zero, pas un « vide ».
    expect(parseDecimal('0')).toBe(0);
  });

  it('refuse une saisie illisible plutot que de renvoyer 0', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('10,5,3')).toBeNull();
    expect(parseDecimal('12km')).toBeNull();
    expect(parseDecimal('--3')).toBeNull();
    expect(parseDecimal('.')).toBeNull();
  });

  it('accepte un nombre deja numerique', () => {
    expect(parseDecimal(10.5)).toBe(10.5);
    expect(parseDecimal(0)).toBe(0);
  });
});

describe('formatDecimalInput', () => {
  it('remplit un champ avec une virgule decimale', () => {
    expect(formatDecimalInput(103.9, 1)).toBe('103,9');
    expect(formatDecimalInput(0.139)).toBe('0,139');
    expect(formatDecimalInput(45.188812)).toBe('45,188812');
  });

  it('renvoie une chaine vide pour une valeur absente', () => {
    expect(formatDecimalInput(null)).toBe('');
    expect(formatDecimalInput(undefined)).toBe('');
    expect(formatDecimalInput('')).toBe('');
  });

  it('fait l’aller-retour avec parseDecimal sans perte', () => {
    for (const value of [0, 10.5, 103.9, 0.139, 45.188812, 1234]) {
      expect(parseDecimal(formatDecimalInput(value))).toBe(value);
    }
  });
});

describe('dates', () => {
  it('formate une date ISO a la francaise', () => {
    expect(formatDateFr('2026-08-17')).toBe('17/08/2026');
    expect(formatDateFr('')).toBe('');
    expect(formatDateFr('pas une date')).toBe('');
  });

  it('nomme les mois en francais accentue', () => {
    expect(formatMonthFr(2026, 8)).toBe('août 2026');
    expect(formatMonthFr(2026, 2)).toBe('février 2026');
    expect(formatMonthFr(2026, 12)).toBe('décembre 2026');
  });

  it('calcule le dernier jour du mois, annees bissextiles comprises', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2024, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 8)).toBe(31);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });

  it('donne la date du jour en heure locale, sans decalage UTC', () => {
    // Un 1er du mois a 00h30 locale ne doit pas etre renvoye comme le mois precedent.
    expect(todayIso(new Date(2026, 7, 1, 0, 30))).toBe('2026-08-01');
    expect(todayIso(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });
});
