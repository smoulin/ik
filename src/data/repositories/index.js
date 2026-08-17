/**
 * Depots de donnees — point d'entree unique de la persistance.
 *
 * L'interface n'importe jamais `db.js` directement : elle passe par ces objets.
 */

import { STORES } from '../db.js';
import { createRepository } from './createRepository.js';
import {
  createCompany,
  createVehicle,
  createTrip,
  createFavoritePlace,
  createBeneficiary,
} from '../../domain/models.js';

export const companyRepository = createRepository(STORES.COMPANIES, createCompany);
export const vehicleRepository = createRepository(STORES.VEHICLES, createVehicle);
export const tripRepository = createRepository(STORES.TRIPS, createTrip);
export const favoritePlaceRepository = createRepository(STORES.FAVORITE_PLACES, createFavoritePlace);
export const beneficiaryRepository = createRepository(STORES.BENEFICIARIES, createBeneficiary);

export { settingsRepository } from './settingsRepository.js';
export { recentAddressRepository } from './recentAddressRepository.js';
export { geoCacheRepository } from './geoCacheRepository.js';
