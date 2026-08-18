/**
 * Etat applicatif en memoire.
 *
 * Les volumes en jeu (quelques centaines de trajets) tiennent largement en
 * memoire : on charge tout au demarrage, et chaque ecriture passe par un depot
 * puis rafraichit l'etat. L'interface ne touche donc jamais IndexedDB.
 */

import {
  companyRepository,
  vehicleRepository,
  tripRepository,
  favoritePlaceRepository,
  beneficiaryRepository,
  settingsRepository,
  trackRepository,
} from '../data/repositories/index.js';
import { SETTING_KEYS } from '../data/repositories/settingsRepository.js';
import { recentAddressRepository } from '../data/repositories/recentAddressRepository.js';
import { splitFrenchAddress } from '../shared/address.js';

export function createStore() {
  const state = {
    companies: [],
    vehicles: [],
    trips: [],
    favoritePlaces: [],
    beneficiary: null,
    loaded: false,
  };

  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify() {
    for (const listener of listeners) listener(state);
  }

  async function load() {
    const [companies, vehicles, trips, favoritePlaces] = await Promise.all([
      companyRepository.list(),
      vehicleRepository.list(),
      tripRepository.list(),
      favoritePlaceRepository.list(),
    ]);

    state.companies = companies.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    state.vehicles = vehicles.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    state.trips = trips;
    state.favoritePlaces = favoritePlaces.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    state.beneficiary = await loadPrimaryBeneficiary();
    state.loaded = true;

    notify();
    return state;
  }

  /**
   * Un seul beneficiaire principal aujourd'hui, mais stocke dans un depot
   * multi-enregistrements : passer a plusieurs beneficiaires ne demandera
   * aucune migration de donnees (cf. §26).
   */
  async function loadPrimaryBeneficiary() {
    const id = await settingsRepository.get(SETTING_KEYS.PRIMARY_BENEFICIARY_ID, null);
    if (id) {
      const found = await beneficiaryRepository.get(id);
      if (found && !found.deletedAt) return found;
    }
    const all = await beneficiaryRepository.list();
    return all[0] || null;
  }

  /* -------------------------------------------------------------- */
  /* Ecritures                                                       */
  /* -------------------------------------------------------------- */

  async function saveCompany(input) {
    const saved = await companyRepository.save(input);
    await load();
    return saved;
  }

  async function saveVehicle(input) {
    const saved = await vehicleRepository.save(input);
    await load();
    return saved;
  }

  async function saveTrip(input) {
    const saved = await tripRepository.save(input);
    // Les adresses utilisees alimentent l'historique de suggestions (§30).
    await rememberTripAddresses(saved);
    await load();
    return saved;
  }

  async function rememberTripAddresses(trip) {
    const entries = [
      { label: trip.from, coords: trip.fromCoords },
      { label: trip.to, coords: trip.toCoords },
    ];
    for (const entry of entries) {
      if (!entry.label) continue;
      // Le code postal et la ville sont deduits du libelle : sans eux, choisir
      // plus tard cette adresse laissait ces champs vides dans les formulaires.
      const { postalCode, city } = splitFrenchAddress(entry.label);
      await recentAddressRepository.record({
        label: entry.label,
        postalCode,
        city,
        latitude: entry.coords?.latitude ?? null,
        longitude: entry.coords?.longitude ?? null,
      });
    }
  }

  async function saveFavoritePlace(input) {
    const saved = await favoritePlaceRepository.save(input);
    await load();
    return saved;
  }

  async function saveBeneficiary(input) {
    const saved = await beneficiaryRepository.save({ ...input, id: input.id || state.beneficiary?.id });
    await settingsRepository.set(SETTING_KEYS.PRIMARY_BENEFICIARY_ID, saved.id);
    await load();
    return saved;
  }

  /* -------------------------------------------------------------- */
  /* Suppressions                                                    */
  /* -------------------------------------------------------------- */

  /** Une structure encore utilisee par un trajet ne peut pas etre supprimee. */
  function companyUsage(id) {
    return state.trips.filter((trip) => trip.companyId === id).length;
  }

  function vehicleUsage(id) {
    return state.trips.filter((trip) => trip.vehicleId === id).length;
  }

  async function deleteCompany(id) {
    if (companyUsage(id) > 0) throw new Error('Structure utilisee par des trajets.');
    await companyRepository.remove(id);
    await load();
  }

  async function deleteVehicle(id) {
    if (vehicleUsage(id) > 0) throw new Error('Vehicule utilise par des trajets.');
    await vehicleRepository.remove(id);
    await load();
  }

  async function deleteTrip(id) {
    await tripRepository.remove(id);
    await load();
  }

  async function deleteFavoritePlace(id) {
    await favoritePlaceRepository.remove(id);
    await load();
  }

  /** Marque une trace GPS comme traitee : elle quitte l'ecran d'accueil. */
  async function markTrackConverted(trackId) {
    const track = await trackRepository.get(trackId);
    if (track) await trackRepository.save({ ...track, status: 'converted' });
  }

  async function deleteAllTrips() {
    for (const trip of state.trips) await tripRepository.remove(trip.id);
    await load();
  }

  /* -------------------------------------------------------------- */
  /* Lectures                                                        */
  /* -------------------------------------------------------------- */

  const getCompany = (id) => state.companies.find((company) => company.id === id) || null;
  const getVehicle = (id) => state.vehicles.find((vehicle) => vehicle.id === id) || null;
  const getTrip = (id) => state.trips.find((trip) => trip.id === id) || null;
  const getFavoritePlace = (id) => state.favoritePlaces.find((place) => place.id === id) || null;

  return {
    state,
    subscribe,
    load,
    saveCompany,
    saveVehicle,
    saveTrip,
    saveFavoritePlace,
    saveBeneficiary,
    deleteCompany,
    deleteVehicle,
    deleteTrip,
    deleteFavoritePlace,
    deleteAllTrips,
    markTrackConverted,
    companyUsage,
    vehicleUsage,
    getCompany,
    getVehicle,
    getTrip,
    getFavoritePlace,
  };
}
