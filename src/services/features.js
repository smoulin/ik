/**
 * Drapeaux de fonctionnalites (cf. §42 et §43).
 *
 * AUCUNE limitation n'est active aujourd'hui : toutes les fonctions sont
 * disponibles. L'interet de ce module est uniquement d'exister — le jour ou une
 * offre payante serait introduite, il suffira de changer la source de `plan`
 * (licence locale, reponse d'un serveur...) sans disséminer des conditions
 * commerciales dans le code metier.
 *
 * Regle a respecter : le metier ne teste JAMAIS un plan tarifaire, seulement
 * une fonctionnalite.
 */

export const PLANS = /** @type {const} */ ({
  FREE: 'free',
  PRO: 'pro',
});

/** Catalogue des fonctionnalites connues et du plan minimal requis. */
export const FEATURES = /** @type {const} */ ({
  multiCompany: PLANS.FREE,
  favoritePlaces: PLANS.FREE,
  addressAutocomplete: PLANS.FREE,
  routeDistance: PLANS.FREE,
  reports: PLANS.FREE,
  csvExport: PLANS.FREE,
  localBackup: PLANS.FREE,

  // Pistes futures, non implementees : listees pour documenter l'intention.
  cloudSync: PLANS.PRO,
  gpsImport: PLANS.PRO,
  advancedReports: PLANS.PRO,
  multiDevice: PLANS.PRO,
});

const PLAN_RANK = { [PLANS.FREE]: 0, [PLANS.PRO]: 1 };

/**
 * Plan courant. En developpement personnel, tout est ouvert : on force `PRO`
 * pour qu'aucune fonctionnalite existante ne puisse etre bridee par megarde.
 */
let currentPlan = PLANS.PRO;

export function setPlan(plan) {
  if (plan in PLAN_RANK) currentPlan = plan;
}

export function getPlan() {
  return currentPlan;
}

/** Une fonctionnalite inconnue est consideree disponible : jamais de blocage surprise. */
export function isFeatureEnabled(feature) {
  const required = FEATURES[feature];
  if (!required) return true;
  return PLAN_RANK[currentPlan] >= PLAN_RANK[required];
}
