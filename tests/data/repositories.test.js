/**
 * Depots de donnees : creation, modification, suppression, recherche.
 * Couvre les exigences §35 (favoris, adresse des structures, beneficiaire).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../helpers/db.js';
import { composeAddressLabel, formatAddressLines, createAddress } from '../../src/domain/models.js';
import {
  companyRepository,
  vehicleRepository,
  tripRepository,
  favoritePlaceRepository,
  beneficiaryRepository,
  settingsRepository,
} from '../../src/data/repositories/index.js';
import { recentAddressRepository } from '../../src/data/repositories/recentAddressRepository.js';
import { geoCacheRepository } from '../../src/data/repositories/geoCacheRepository.js';

beforeEach(async () => {
  await resetDatabase();
});

describe('composition des adresses', () => {
  it('sépare le code postal et la ville par une espace, pas par une virgule', () => {
    expect(
      composeAddressLabel({ line1: '12 rue Exemple', postalCode: '38000', city: 'Grenoble' }),
    ).toBe('12 rue Exemple, 38000 Grenoble');
  });

  it('omet les parties absentes', () => {
    expect(composeAddressLabel({ line1: '12 rue Exemple' })).toBe('12 rue Exemple');
    expect(composeAddressLabel({ postalCode: '38000', city: 'Grenoble' })).toBe('38000 Grenoble');
    expect(composeAddressLabel({})).toBe('');
  });

  // La voie reprise d'un libelle complet porte deja la localite : l'ajouter une
  // seconde fois donnait « … 38980 Châtenay, 38980 Châtenay ».
  it('ne répète pas une localité déjà présente dans la voie', () => {
    expect(
      composeAddressLabel({
        line1: '358 Chemin de l’Étang 38980 Châtenay',
        postalCode: '38980',
        city: 'Châtenay',
      }),
    ).toBe('358 Chemin de l’Étang 38980 Châtenay');
  });

  it('ignore la casse et les accents pour juger de la répétition', () => {
    expect(
      composeAddressLabel({ line1: '12 rue Exemple 38000 GRENOBLE', postalCode: '38000', city: 'Grenoble' }),
    ).toBe('12 rue Exemple 38000 GRENOBLE');
  });

  it('ajoute la localité quand la voie porte une AUTRE commune', () => {
    expect(
      composeAddressLabel({ line1: '12 rue Exemple 38000 Grenoble', postalCode: '38980', city: 'Châtenay' }),
    ).toBe('12 rue Exemple 38000 Grenoble, 38980 Châtenay');
  });

  // Normalisation a l'enregistrement : elle repare les fiches deja ecrites.
  it('retire de la voie la localité qui a ses propres champs', () => {
    const address = createAddress({
      line1: '358 Chemin de l’Étang 38980 Châtenay',
      postalCode: '38980',
      city: 'Châtenay',
    });
    expect(address.line1).toBe('358 Chemin de l’Étang');
  });

  it('laisse la voie intacte quand la commune diffère', () => {
    const address = createAddress({
      line1: '12 rue Exemple 38000 Grenoble',
      postalCode: '38980',
      city: 'Châtenay',
    });
    expect(address.line1).toBe('12 rue Exemple 38000 Grenoble');
  });

  it('ne vide jamais la voie', () => {
    const address = createAddress({ line1: '38980 Châtenay', postalCode: '38980', city: 'Châtenay' });
    expect(address.line1).toBe('38980 Châtenay');
  });

  it('produit les lignes du rapport dans l’ordre postal francais', () => {
    expect(
      formatAddressLines({
        line1: '12 rue Exemple',
        line2: 'Bâtiment B',
        postalCode: '38000',
        city: 'Grenoble',
        country: 'FR',
      }),
    ).toEqual(['12 rue Exemple', 'Bâtiment B', '38000 Grenoble']);
  });

  it('ajoute le pays seulement hors de France', () => {
    expect(formatAddressLines({ line1: 'Rue Neuve', city: 'Bruxelles', country: 'BE' })).toEqual([
      'Rue Neuve',
      'Bruxelles',
      'BE',
    ]);
  });
});

describe('lieux favoris', () => {
  it('cree un lieu avec son adresse et ses coordonnees', async () => {
    const place = await favoritePlaceRepository.save({
      name: 'Domicile',
      address: { line1: '12 rue Exemple', postalCode: '38000', city: 'Grenoble' },
      latitude: 45.188,
      longitude: 5.724,
    });

    expect(place.id).toMatch(/^place_/);
    expect(place.name).toBe('Domicile');
    expect(place.latitude).toBeCloseTo(45.188, 5);
    // Les coordonnees restent synchronisees avec l'adresse, source du routing.
    expect(place.address.latitude).toBeCloseTo(45.188, 5);
    expect(place.createdAt).toBeTruthy();
    expect(place.deletedAt).toBeNull();
  });

  it('modifie un lieu sans changer son identifiant ni sa date de creation', async () => {
    const created = await favoritePlaceRepository.save({ name: 'Bureau', address: {} });
    const updated = await favoritePlaceRepository.save({
      id: created.id,
      name: 'Bureau Grenoble',
      address: { line1: '1 place Victor Hugo', city: 'Grenoble' },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Bureau Grenoble');
    expect(updated.createdAt).toBe(created.createdAt);

    const all = await favoritePlaceRepository.list();
    expect(all).toHaveLength(1);
  });

  it('supprime logiquement un lieu : il disparait des listes mais reste en base', async () => {
    const place = await favoritePlaceRepository.save({ name: 'Client X', address: {} });
    await favoritePlaceRepository.remove(place.id);

    expect(await favoritePlaceRepository.list()).toHaveLength(0);
    const withDeleted = await favoritePlaceRepository.list({ includeDeleted: true });
    expect(withDeleted).toHaveLength(1);
    expect(withDeleted[0].deletedAt).toBeTruthy();
  });

  it('retrouve un lieu par son identifiant', async () => {
    const place = await favoritePlaceRepository.save({ name: 'Expert-comptable', address: {} });
    expect((await favoritePlaceRepository.get(place.id)).name).toBe('Expert-comptable');
    expect(await favoritePlaceRepository.get('inconnu')).toBeNull();
  });
});

describe('structures', () => {
  it('enregistre l’adresse complete et les identifiants', async () => {
    const company = await companyRepository.save({
      name: 'SASU A',
      legalName: 'EXEMPLE SASU',
      siren: '123 456 789',
      siret: '123 456 789 00012',
      address: { line1: '5 avenue des Tests', postalCode: '69000', city: 'Lyon' },
      calculationMode: 'ik2026',
    });

    expect(company.address.line1).toBe('5 avenue des Tests');
    expect(company.address.postalCode).toBe('69000');
    expect(company.address.city).toBe('Lyon');
    // Les espaces de saisie sont retires des identifiants.
    expect(company.siren).toBe('123456789');
    expect(company.siret).toBe('12345678900012');
  });

  it('modifie l’adresse d’une structure existante', async () => {
    const created = await companyRepository.save({
      name: 'SASU B',
      address: { line1: 'Ancienne adresse', city: 'Paris' },
    });

    const updated = await companyRepository.save({
      id: created.id,
      name: 'SASU B',
      address: { line1: '9 rue Nouvelle', postalCode: '38000', city: 'Grenoble' },
    });

    expect(updated.address.line1).toBe('9 rue Nouvelle');
    expect(updated.address.city).toBe('Grenoble');
    expect(updated.address.postalCode).toBe('38000');

    const reread = await companyRepository.get(created.id);
    expect(reread.address.line1).toBe('9 rue Nouvelle');
  });

  it('retombe sur le bareme IK si le mode de calcul est inconnu', async () => {
    const company = await companyRepository.save({ name: 'X', calculationMode: 'fantaisie' });
    expect(company.calculationMode).toBe('ik2026');
  });
});

describe('beneficiaire', () => {
  it('enregistre puis modifie le beneficiaire principal', async () => {
    const created = await beneficiaryRepository.save({
      firstName: 'Jean',
      lastName: 'Dupont',
      address: { line1: '12 rue Exemple', postalCode: '38000', city: 'Grenoble' },
    });
    await settingsRepository.set('primaryBeneficiaryId', created.id);

    expect(created.firstName).toBe('Jean');
    expect(created.address.city).toBe('Grenoble');

    const updated = await beneficiaryRepository.save({
      id: created.id,
      firstName: 'Jean',
      lastName: 'Dupont-Martin',
      address: { line1: '3 rue Neuve', postalCode: '38100', city: 'Grenoble' },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.lastName).toBe('Dupont-Martin');
    expect(updated.address.line1).toBe('3 rue Neuve');
    expect(await settingsRepository.get('primaryBeneficiaryId')).toBe(created.id);
    expect(await beneficiaryRepository.list()).toHaveLength(1);
  });

  it('accepte le format a plat du cahier des charges', async () => {
    const created = await beneficiaryRepository.save({
      firstName: 'Marie',
      lastName: 'Martin',
      addressLine1: '4 rue Plate',
      postalCode: '75001',
      city: 'Paris',
    });
    expect(created.address.line1).toBe('4 rue Plate');
    expect(created.address.postalCode).toBe('75001');
  });
});

describe('trajets et vehicules', () => {
  it('conserve les coordonnees resolues du trajet', async () => {
    const trip = await tripRepository.save({
      date: '2026-08-01',
      companyId: 'c1',
      vehicleId: 'v1',
      from: 'Grenoble',
      to: 'Lyon',
      fromCoords: { latitude: 45.18, longitude: 5.72 },
      toCoords: { lat: 45.75, lon: 4.85 },
      km: 110,
    });

    expect(trip.fromCoords).toEqual({ latitude: 45.18, longitude: 5.72 });
    // Les alias lat/lon sont acceptes.
    expect(trip.toCoords).toEqual({ latitude: 45.75, longitude: 4.85 });
  });

  it('normalise le carburant d’un vehicule', async () => {
    const vehicle = await vehicleRepository.save({ name: 'Zoe', cv: 4, fuel: 'inconnu' });
    expect(vehicle.fuel).toBe('petrol');
  });
});

describe('adresses recentes', () => {
  it('ne cree pas de doublon et incremente le compteur', async () => {
    await recentAddressRepository.record({ label: '12 rue Jean Jaures, Grenoble' });
    await recentAddressRepository.record({ label: '12 RUE JEAN-JAURES, GRENOBLE' });

    const all = await recentAddressRepository.list();
    expect(all).toHaveLength(1);
    expect(all[0].useCount).toBe(2);
  });

  it('ne perd pas des coordonnees deja connues', async () => {
    await recentAddressRepository.record({ label: 'Lyon', latitude: 45.75, longitude: 4.85 });
    await recentAddressRepository.record({ label: 'Lyon' });

    const all = await recentAddressRepository.list();
    expect(all[0].latitude).toBeCloseTo(45.75, 5);
  });

  it('retrouve une adresse par un fragment, prefixes en tete', async () => {
    await recentAddressRepository.record({ label: 'Chambery centre' });
    await recentAddressRepository.record({ label: 'Rue de Chambery, Lyon' });

    const found = await recentAddressRepository.search('chambery', 5);
    expect(found).toHaveLength(2);
    expect(found[0].label).toBe('Chambery centre');
  });
});

describe('cache geographique', () => {
  it('memorise puis relit une resolution d’adresse', async () => {
    await geoCacheRepository.set('12 rue Exemple, Grenoble', {
      latitude: 45.18,
      longitude: 5.72,
      label: '12 Rue Exemple 38000 Grenoble',
      provider: 'ban',
    });

    const hit = await geoCacheRepository.get('12 RUE exemple  Grenoble');
    expect(hit.latitude).toBeCloseTo(45.18, 5);
    expect(hit.provider).toBe('ban');
  });

  it('refuse une entree sans coordonnees valides', async () => {
    expect(await geoCacheRepository.set('X', { latitude: NaN, longitude: 1 })).toBeNull();
    expect(await geoCacheRepository.get('X')).toBeNull();
  });
});
