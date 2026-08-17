/**
 * Baremes officiels — donnees brutes.
 *
 * ATTENTION : ces valeurs sont reprises telles quelles de la version 0.1.1 et
 * sont verrouillees par des tests. Ne les modifier qu'a la publication d'un
 * nouveau bareme officiel, et en ajoutant une nouvelle entree plutot qu'en
 * ecrasant l'ancienne (les rapports passes doivent rester reproductibles).
 */

/**
 * Bareme kilometrique.
 * `a` : forfait <= 5 000 km, `b`/`c` : tranche 5 001 - 20 000 km, `d` : > 20 000 km.
 * Montant = km * a  |  km * b + c  |  km * d
 *
 * Source : Urssaf / bareme kilometrique applicable aux revenus 2025 (publie 2026).
 * https://www.urssaf.fr/accueil/outils-documentation/taux-baremes/indemnites-kilometriques.html
 */
export const IK_SCALES = {
  2026: {
    label: 'Barème IK France 2026',
    year: 2026,
    thermal: {
      3: { a: 0.529, b: 0.316, c: 1065, d: 0.37 },
      4: { a: 0.606, b: 0.34, c: 1330, d: 0.407 },
      5: { a: 0.636, b: 0.357, c: 1395, d: 0.427 },
      6: { a: 0.665, b: 0.374, c: 1457, d: 0.447 },
      7: { a: 0.697, b: 0.394, c: 1515, d: 0.47 },
    },
    electric: {
      3: { a: 0.635, b: 0.379, c: 1278, d: 0.444 },
      4: { a: 0.727, b: 0.408, c: 1596, d: 0.488 },
      5: { a: 0.763, b: 0.428, c: 1674, d: 0.512 },
      6: { a: 0.798, b: 0.449, c: 1748, d: 0.536 },
      7: { a: 0.836, b: 0.473, c: 1818, d: 0.564 },
    },
  },
};

export const CURRENT_IK_SCALE_YEAR = 2026;

/**
 * Bareme forfaitaire carburant BIC.
 * Dernier bareme officiel disponible au 17/08/2026 : depenses 2025, publie le 18/02/2026.
 * https://bofip.impots.gouv.fr/bofip/2095-PGP.html/identifiant=BOI-BAREME-000003-20260218
 */
export const BIC_FUEL_SCALES = {
  2025: {
    label: 'Barème carburant BIC 2025',
    year: 2025,
    rates: {
      '3-4': { diesel: 0.089, petrol: 0.113, lpg: 0.072 },
      '5-7': { diesel: 0.11, petrol: 0.139, lpg: 0.089 },
      '8-9': { diesel: 0.131, petrol: 0.165, lpg: 0.106 },
      '10-11': { diesel: 0.148, petrol: 0.187, lpg: 0.12 },
      '12+': { diesel: 0.165, petrol: 0.208, lpg: 0.133 },
    },
  },
};

export const CURRENT_BIC_SCALE_YEAR = 2025;

/** Bornes des tranches du bareme kilometrique, en kilometres cumules sur l'annee. */
export const IK_BRACKETS = { low: 5000, high: 20000 };
