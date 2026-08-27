/**
 * Decoupage d'une adresse francaise ecrite sur une seule ligne.
 *
 * Couvre le bug constate en usage : choisir une adresse deja utilisee
 * (proposee comme « recente ») laissait les champs code postal et ville vides,
 * parce que la suggestion ne portait que le libelle complet.
 */

import { describe, it, expect } from 'vitest';
import { splitFrenchAddress, completeSuggestionLocality } from '../../src/shared/address.js';

describe('splitFrenchAddress', () => {
  it('separe voie, code postal et ville', () => {
    expect(splitFrenchAddress('3 Rue des Pins 38100 Grenoble')).toEqual({
      line1: '3 Rue des Pins',
      postalCode: '38100',
      city: 'Grenoble',
    });
  });

  it('gere les accents et apostrophes', () => {
    expect(splitFrenchAddress('358 Chemin de l’Étang 38980 Châtenay')).toEqual({
      line1: '358 Chemin de l’Étang',
      postalCode: '38980',
      city: 'Châtenay',
    });
  });

  it('gere une virgule avant le code postal', () => {
    expect(splitFrenchAddress('12 Cours Jean Jaurès, 38000 Grenoble')).toEqual({
      line1: '12 Cours Jean Jaurès',
      postalCode: '38000',
      city: 'Grenoble',
    });
  });

  it('gere les communes composees', () => {
    expect(splitFrenchAddress('5 rue du Port 38180 Seyssins-le-Haut').city).toBe(
      'Seyssins-le-Haut',
    );
    expect(splitFrenchAddress('1 place Centrale 73000 Saint-Jean-de-Maurienne').city).toBe(
      'Saint-Jean-de-Maurienne',
    );
  });

  it('ne se laisse pas piéger par un nombre dans le nom de voie', () => {
    // « 8 Mai 1945 » ne doit pas etre pris pour un code postal.
    expect(splitFrenchAddress('12 rue du 8 Mai 1945 38000 Grenoble')).toEqual({
      line1: '12 rue du 8 Mai 1945',
      postalCode: '38000',
      city: 'Grenoble',
    });
  });

  it('renvoie le libelle entier quand il n’y a pas de code postal', () => {
    expect(splitFrenchAddress('Lyon Part-Dieu')).toEqual({
      line1: 'Lyon Part-Dieu',
      postalCode: '',
      city: '',
    });
  });

  it('gere les entrees vides', () => {
    expect(splitFrenchAddress('')).toEqual({ line1: '', postalCode: '', city: '' });
    expect(splitFrenchAddress(null)).toEqual({ line1: '', postalCode: '', city: '' });
  });
});

describe('completeSuggestionLocality', () => {
  it('complete une suggestion sans code postal ni ville', () => {
    const completee = completeSuggestionLocality({
      label: '3 Rue des Pins 38100 Grenoble',
      fullLabel: '3 Rue des Pins 38100 Grenoble',
      postalCode: '',
      city: '',
    });

    expect(completee.postalCode).toBe('38100');
    expect(completee.city).toBe('Grenoble');
    // Le champ « adresse » ne doit pas repeter le code postal et la ville.
    expect(completee.label).toBe('3 Rue des Pins');
  });

  it('ne remplace jamais des valeurs deja fournies', () => {
    const suggestion = {
      label: '12 Cours Jean Jaurès',
      fullLabel: '12 Cours Jean Jaurès 38000 Grenoble',
      postalCode: '38000',
      city: 'Grenoble',
    };
    const completee = completeSuggestionLocality(suggestion);

    expect(completee.postalCode).toBe('38000');
    expect(completee.city).toBe('Grenoble');
    // La voie ne portait pas la localite : elle reste telle quelle.
    expect(completee.label).toBe('12 Cours Jean Jaurès');
  });

  /*
   * Le cas qui produisait « 358 Chemin de l'Étang 38980 Châtenay, 38980
   * Châtenay » : une adresse deja utilisee arrive avec un libelle complet ET
   * une localite connue. Le champ « adresse » recevait le tout, et
   * l'enregistrement y rajoutait la localite une seconde fois.
   */
  it('retire la localite d’un libelle complet meme quand elle est deja connue', () => {
    const completee = completeSuggestionLocality({
      label: '358 Chemin de l’Étang 38980 Châtenay',
      fullLabel: '358 Chemin de l’Étang 38980 Châtenay',
      postalCode: '38980',
      city: 'Châtenay',
    });

    expect(completee.label).toBe('358 Chemin de l’Étang');
    expect(completee.postalCode).toBe('38980');
    expect(completee.city).toBe('Châtenay');
  });

  it('laisse intact le nom d’un lieu favori', () => {
    const completee = completeSuggestionLocality({
      label: 'Maison',
      fullLabel: '358 Chemin de l’Étang 38980 Châtenay',
      postalCode: '38980',
      city: 'Châtenay',
    });

    expect(completee.label).toBe('Maison');
  });

  it('laisse intacte une suggestion sans code postal identifiable', () => {
    const suggestion = { label: 'Domicile', fullLabel: 'Domicile', postalCode: '', city: '' };
    expect(completeSuggestionLocality(suggestion)).toEqual(suggestion);
  });

  it('tolere une entree nulle', () => {
    expect(completeSuggestionLocality(null)).toBeNull();
  });
});
