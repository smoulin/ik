/**
 * Baremes officiels — donnees brutes.
 *
 * ATTENTION : ces valeurs sont verrouillees par des tests. Ne les modifier qu'a
 * la publication d'un nouveau bareme officiel, et en AJOUTANT une entree plutot
 * qu'en ecrasant l'ancienne : les rapports passes doivent rester reproductibles.
 *
 * CONVENTION D'INDEXATION — les deux tables sont indexees par **annee du
 * deplacement** (l'annee ou les kilometres ont ete parcourus), jamais par annee
 * de declaration. Un trajet du 15/06/2024 lit donc l'entree 2024.
 *
 * Le langage courant dit « les baremes 2026 » pour ceux qui servent a declarer
 * les revenus 2025 : c'est cette ambiguite qui avait fait indexer le bareme
 * kilometrique sur 2026 alors qu'il s'applique aux deplacements de 2025.
 */

/**
 * Bareme kilometrique, arrete du 27 mars 2023.
 *
 * `a` : forfait <= 5 000 km, `b`/`c` : tranche 5 001 - 20 000 km, `d` : > 20 000 km.
 * Montant = km * a  |  km * b + c  |  km * d
 *
 * Cet arrete est la derniere revalorisation en date (+5,4 %). Aucun texte ne
 * l'a modifie depuis : il s'applique inchange aux deplacements de 2022 a 2025.
 * Les coefficients sont donc definis UNE fois puis rattaches a ces annees —
 * recopier le tableau inviterait la divergence a la premiere correction.
 *
 * La table electrique n'est pas calculee. Elle vaut la majoration de 20 %
 * prevue par le texte, mais telle que l'administration l'a arrondie et
 * publiee : 0,529 x 1,2 = 0,6348, publie a 0,635. La calculer ferait diverger
 * l'application du texte officiel.
 *
 * https://bofip.impots.gouv.fr/bofip/2185-PGP.html
 */
const IK_ARRETE_2023_03_27 = {
  reference: 'Arrêté du 27 mars 2023',
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
};

/** Annees de deplacement couvertes par l'arrete du 27 mars 2023. */
const IK_YEARS_2023_ARRETE = [2022, 2023, 2024, 2025];

/** Bareme kilometrique par annee de deplacement. */
export const IK_SCALES = Object.fromEntries(
  IK_YEARS_2023_ARRETE.map((year) => [
    year,
    {
      label: `Barème IK France — déplacements ${year}`,
      year,
      reference: IK_ARRETE_2023_03_27.reference,
      thermal: IK_ARRETE_2023_03_27.thermal,
      electric: IK_ARRETE_2023_03_27.electric,
    },
  ]),
);

/**
 * Bareme forfaitaire carburant BIC, par annee de DEPENSE.
 *
 * Celui-ci est republie chaque annee, et il baisse. Contrairement au bareme
 * kilometrique, l'annee compte donc reellement : un trajet de 2023 et le meme
 * trajet en 2025 ne donnent pas le meme montant.
 *
 * 2023 : https://bofip.impots.gouv.fr/bofip/2095-PGP.html/identifiant=BOI-BAREME-000003-20240306
 * 2024 : https://bofip.impots.gouv.fr/bofip/2095-PGP.html/identifiant=BOI-BAREME-000003-20250219
 * 2025 : https://bofip.impots.gouv.fr/bofip/2095-PGP.html/identifiant=BOI-BAREME-000003-20260218
 */
export const BIC_FUEL_SCALES = {
  2023: {
    label: 'Barème carburant BIC — dépenses 2023',
    year: 2023,
    reference: 'BOI-BAREME-000003-20240306',
    rates: {
      '3-4': { diesel: 0.099, petrol: 0.123, lpg: 0.073 },
      '5-7': { diesel: 0.122, petrol: 0.152, lpg: 0.09 },
      '8-9': { diesel: 0.145, petrol: 0.181, lpg: 0.107 },
      '10-11': { diesel: 0.164, petrol: 0.203, lpg: 0.121 },
      '12+': { diesel: 0.182, petrol: 0.226, lpg: 0.135 },
    },
  },
  2024: {
    label: 'Barème carburant BIC — dépenses 2024',
    year: 2024,
    reference: 'BOI-BAREME-000003-20250219',
    rates: {
      '3-4': { diesel: 0.094, petrol: 0.119, lpg: 0.074 },
      '5-7': { diesel: 0.116, petrol: 0.147, lpg: 0.091 },
      '8-9': { diesel: 0.137, petrol: 0.174, lpg: 0.108 },
      '10-11': { diesel: 0.155, petrol: 0.197, lpg: 0.122 },
      '12+': { diesel: 0.172, petrol: 0.219, lpg: 0.136 },
    },
  },
  2025: {
    label: 'Barème carburant BIC — dépenses 2025',
    year: 2025,
    reference: 'BOI-BAREME-000003-20260218',
    rates: {
      '3-4': { diesel: 0.089, petrol: 0.113, lpg: 0.072 },
      '5-7': { diesel: 0.11, petrol: 0.139, lpg: 0.089 },
      '8-9': { diesel: 0.131, petrol: 0.165, lpg: 0.106 },
      '10-11': { diesel: 0.148, petrol: 0.187, lpg: 0.12 },
      '12+': { diesel: 0.165, petrol: 0.208, lpg: 0.133 },
    },
  },
};

/** Bornes d'une table indexee par annee. */
function boundaries(scales) {
  const years = Object.keys(scales).map(Number).sort((a, b) => a - b);
  return { first: years[0], last: years[years.length - 1] };
}

/**
 * Derniere annee PUBLIEE, et plus ancienne connue.
 *
 * « Courant » ne veut plus rien dire des qu'on manipule plusieurs annees : ce
 * qui compte est la derniere annee pour laquelle un bareme existe. Le bareme
 * des deplacements de l'annee en cours ne parait qu'au printemps suivant.
 */
export const IK_SCALE_YEARS = boundaries(IK_SCALES);
export const BIC_SCALE_YEARS = boundaries(BIC_FUEL_SCALES);

export const LATEST_IK_SCALE_YEAR = IK_SCALE_YEARS.last;
export const LATEST_BIC_SCALE_YEAR = BIC_SCALE_YEARS.last;

/** Bornes des tranches du bareme kilometrique, en kilometres cumules sur l'annee. */
export const IK_BRACKETS = { low: 5000, high: 20000 };
