/**
 * Modele de rapport « Etat des frais kilometriques ».
 *
 * Cette couche ne produit AUCUN HTML : elle assemble un objet complet et
 * verifiable (beneficiaire, structure, lignes, totaux, methode de calcul).
 * L'affichage a l'ecran et la mise en page imprimable consomment ce meme objet,
 * ce qui garantit qu'ils ne peuvent pas diverger — et permet de tester le
 * contenu du rapport sans navigateur.
 */

import {
  formatAddressLines,
  formatBeneficiaryName,
  isAddressEmpty,
  isBeneficiaryEmpty,
} from '../models.js';
import {
  computeTripAmounts,
  calculationModeLabel,
  scaleYearForCompany,
  IK_ACCUMULATION_SCOPE,
} from '../mileage/engine.js';
import { CALCULATION_MODES } from '../models.js';
import { normalizeCv } from '../mileage/ikScale.js';
import { formatDateFr, formatMonthFr, lastDayOfMonth } from '../../shared/format.js';

export const REPORT_TITLE = 'État des frais kilométriques';

/**
 * @param {object} params
 * @param {Array}  params.trips        tous les trajets connus (le cumul annuel en depend)
 * @param {Array}  params.companies
 * @param {Array}  params.vehicles
 * @param {object|null} params.beneficiary
 * @param {{companyId: string, vehicleId?: string, from?: string, to?: string}} params.filters
 * @param {string} [params.appVersion]
 * @param {Date}   [params.generatedAt]
 */
export function buildReport({
  trips = [],
  companies = [],
  vehicles = [],
  beneficiary = null,
  filters = {},
  appVersion = '',
  generatedAt = new Date(),
}) {
  const { companyId, vehicleId = '', from = '', to = '' } = filters;

  const company = companies.find((c) => c.id === companyId) || null;
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  // Le cumul annuel s'apprecie sur l'ensemble des trajets, pas seulement sur la
  // periode filtree : on calcule donc tout, puis on filtre.
  const computations = computeTripAmounts(trips, { companies, vehicles });

  const selected = trips
    .filter((trip) => !trip.deletedAt)
    .filter((trip) => trip.companyId === companyId)
    .filter((trip) => !vehicleId || trip.vehicleId === vehicleId)
    .filter((trip) => !from || trip.date >= from)
    .filter((trip) => !to || trip.date <= to)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const lines = selected.map((trip) => {
    const vehicle = vehicleById.get(trip.vehicleId) || null;
    const computed = computations.get(trip.id);
    return {
      id: trip.id,
      date: trip.date,
      dateLabel: formatDateFr(trip.date),
      from: trip.from,
      to: trip.to,
      purpose: trip.purpose || '',
      roundTrip: Boolean(trip.roundTrip),
      vehicleId: trip.vehicleId,
      vehicleName: vehicle?.name || '',
      km: Number(trip.km) || 0,
      amount: Number(computed?.amount) || 0,
      rateInfo: computed?.rateInfo || '',
    };
  });

  const totals = {
    tripCount: lines.length,
    km: round(
      lines.reduce((sum, line) => sum + line.km, 0),
      1,
    ),
    amount: round(
      lines.reduce((sum, line) => sum + line.amount, 0),
      2,
    ),
  };

  return {
    title: REPORT_TITLE,
    period: buildPeriod(from, to),
    beneficiary: buildBeneficiaryBlock(beneficiary),
    company: buildCompanyBlock(company),
    vehicles: buildVehiclesBlock(lines, vehicleById),
    calculation: buildCalculationBlock(company, lines, vehicleById),
    lines,
    totals,
    warnings: buildWarnings({ company, companies, trips, lines }),
    generatedAt: generatedAt.toISOString(),
    generatedAtLabel: formatDateFr(toIsoDate(generatedAt)),
    appVersion,
  };
}

/* ------------------------------------------------------------------ */
/* Avertissements                                                      */
/* ------------------------------------------------------------------ */

/**
 * Signale le seul cas ou le perimetre de cumul retenu peut preter a discussion.
 *
 * Le cumul annuel est apprecie par structure + vehicule + annee. Tant qu'un
 * vehicule ne sert qu'a une seule structure au bareme kilometrique, ce
 * perimetre ne change rien. En revanche, si DEUX structures ou plus utilisent
 * le bareme kilometrique avec LE MEME vehicule la meme annee, chacune repart
 * de la premiere tranche : le total indemnise depasse alors ce que le bareme
 * accorderait pour ce vehicule.
 *
 * On n'impose rien — c'est un choix assume — mais l'utilisateur doit le savoir
 * au moment ou le cas se produit reellement, et pas six mois plus tard.
 */
export function buildWarnings({ company, companies = [], trips = [], lines = [] }) {
  const warnings = [];

  if (company?.calculationMode !== CALCULATION_MODES.IK) return warnings;
  if (IK_ACCUMULATION_SCOPE !== 'company-vehicle-year') return warnings;

  const ikCompanyIds = new Set(
    companies.filter((c) => c.calculationMode === CALCULATION_MODES.IK).map((c) => c.id),
  );
  if (ikCompanyIds.size < 2) return warnings;

  const years = new Set(lines.map((line) => String(line.date).slice(0, 4)));
  const vehicleIds = new Set(lines.map((line) => line.vehicleId));

  for (const vehicleId of vehicleIds) {
    for (const year of years) {
      const sharingCompanies = new Set(
        trips
          .filter((trip) => !trip.deletedAt)
          .filter((trip) => trip.vehicleId === vehicleId)
          .filter((trip) => String(trip.date).slice(0, 4) === year)
          .filter((trip) => ikCompanyIds.has(trip.companyId))
          .map((trip) => trip.companyId),
      );

      if (sharingCompanies.size > 1) {
        const names = companies
          .filter((c) => sharingCompanies.has(c.id))
          .map((c) => c.name)
          .join(', ');
        warnings.push({
          code: 'ik-scope-shared-vehicle',
          message:
            `En ${year}, ce véhicule sert au barème kilométrique pour plusieurs structures (${names}). ` +
            'Chacune repart de la première tranche du barème, ce qui augmente le total indemnisé. ' +
            'Ce fonctionnement est volontaire — à confirmer avec ton expert-comptable.',
        });
      }
    }
  }

  return warnings;
}

/* ------------------------------------------------------------------ */
/* Blocs d'en-tete                                                     */
/* ------------------------------------------------------------------ */

/** Bloc haut-gauche du rapport : identite du beneficiaire (cf. §5). */
function buildBeneficiaryBlock(beneficiary) {
  if (isBeneficiaryEmpty(beneficiary)) {
    return { present: false, name: '', addressLines: [], lines: [] };
  }
  const name = formatBeneficiaryName(beneficiary);
  const addressLines = formatAddressLines(beneficiary.address);
  return {
    present: true,
    name,
    addressLines,
    lines: [name, ...addressLines].filter(Boolean),
  };
}

/** Bloc haut-droit du rapport : structure qui rembourse (cf. §6). */
function buildCompanyBlock(company) {
  if (!company) {
    return { present: false, name: '', addressLines: [], identifiers: [], lines: [] };
  }
  const displayName = company.legalName || company.name;
  const addressLines = isAddressEmpty(company.address) ? [] : formatAddressLines(company.address);

  const identifiers = [];
  if (company.siren) identifiers.push(`SIREN ${formatSiren(company.siren)}`);
  if (company.siret) identifiers.push(`SIRET ${formatSiret(company.siret)}`);

  return {
    present: true,
    id: company.id,
    name: company.name,
    displayName,
    legalName: company.legalName || '',
    type: company.type || '',
    addressLines,
    identifiers,
    lines: [displayName, ...addressLines, ...identifiers].filter(Boolean),
  };
}

/** Recapitulatif des vehicules reellement utilises sur la periode (cf. §8). */
function buildVehiclesBlock(lines, vehicleById) {
  const usedIds = [...new Set(lines.map((line) => line.vehicleId))];
  return usedIds
    .map((id) => vehicleById.get(id))
    .filter(Boolean)
    .map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.name,
      cv: vehicle.cv,
      cvApplied: normalizeCv(vehicle.cv),
      electric: Boolean(vehicle.electric),
      fuel: vehicle.fuel,
      label: `${vehicle.name} — ${vehicle.cv} CV — ${vehicle.electric ? '100 % électrique' : 'thermique / hybride'}`,
    }));
}

/** Methode de calcul et annee du bareme (cf. §8). */
function buildCalculationBlock(company, lines, vehicleById) {
  const usedVehicles = [...new Set(lines.map((line) => line.vehicleId))]
    .map((id) => vehicleById.get(id))
    .filter(Boolean);

  // Le taux BIC depend du vehicule : on ne le mentionne que s'il n'y en a qu'un.
  const singleVehicle = usedVehicles.length === 1 ? usedVehicles[0] : null;

  return {
    mode: company?.calculationMode || 'none',
    label: calculationModeLabel(company, singleVehicle),
    scaleYear: scaleYearForCompany(company),
  };
}

/* ------------------------------------------------------------------ */
/* Periode                                                             */
/* ------------------------------------------------------------------ */

/**
 * « Periode : aout 2026 » quand les bornes couvrent exactement un mois civil,
 * « Du 01/08/2026 au 31/08/2026 » sinon (cf. §7).
 */
export function buildPeriod(from, to) {
  const fromLabel = formatDateFr(from);
  const toLabel = formatDateFr(to);

  if (!from && !to) {
    return { from: '', to: '', label: 'Période : toutes les dates', isFullMonth: false };
  }
  if (!from || !to) {
    const label = from ? `À partir du ${fromLabel}` : `Jusqu’au ${toLabel}`;
    return { from, to, label, isFullMonth: false };
  }

  const fromParts = from.split('-');
  const toParts = to.split('-');
  const sameMonth = fromParts[0] === toParts[0] && fromParts[1] === toParts[1];
  const coversWholeMonth =
    sameMonth &&
    Number(fromParts[2]) === 1 &&
    Number(toParts[2]) === lastDayOfMonth(fromParts[0], fromParts[1]);

  if (coversWholeMonth) {
    return {
      from,
      to,
      label: `Période : ${formatMonthFr(fromParts[0], fromParts[1])}`,
      isFullMonth: true,
    };
  }

  return { from, to, label: `Du ${fromLabel} au ${toLabel}`, isFullMonth: false };
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

function formatSiren(siren) {
  const digits = String(siren).replace(/\D/g, '');
  return digits.length === 9 ? digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : String(siren);
}

function formatSiret(siret) {
  const digits = String(siret).replace(/\D/g, '');
  return digits.length === 14
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')
    : String(siret);
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
