/**
 * Mise en page imprimable de l'etat des frais kilometriques.
 *
 * Construit uniquement a partir de l'objet renvoye par `buildReport()` : le
 * rendu ecran et le rendu papier consomment la meme source, ils ne peuvent donc
 * pas diverger.
 *
 * Le document est genere en DOM (jamais par concatenation de HTML) : aucune
 * donnee saisie ne peut etre interpretee comme du balisage.
 */

import { el } from '../dom.js';
import { formatKm, formatMoney, formatNumberFr } from '../../shared/format.js';

/**
 * @param {HTMLElement} container  la section #print-report
 * @param {object} report          resultat de buildReport()
 */
export function renderPrintReport(container, report) {
  container.replaceChildren();

  container.append(buildHeader(report));
  container.append(el('h1', { class: 'print-title', text: report.title }));
  container.append(el('p', { class: 'print-period', text: report.period.label }));
  container.append(buildTable(report));
  container.append(buildFooterInfo(report));
}

/* ------------------------------------------------------------------ */
/* En-tete : beneficiaire a gauche (§5), structure a droite (§6)        */
/* ------------------------------------------------------------------ */

function buildHeader(report) {
  const beneficiaryBlock = el('div', { class: 'print-party print-beneficiary' }, [
    el('div', { class: 'print-party-role', text: 'Bénéficiaire' }),
    report.beneficiary.present
      ? el('div', { class: 'print-party-name', text: report.beneficiary.name })
      : el('div', { class: 'print-party-missing', text: 'Bénéficiaire non renseigné' }),
    ...report.beneficiary.addressLines.map((line) => el('div', { text: line })),
  ]);

  const companyBlock = report.allCompanies
    ? el('div', { class: 'print-party print-company' }, [
        el('div', { class: 'print-party-role', text: 'Structures' }),
        el('div', { class: 'print-party-name', text: 'Toutes structures' }),
        ...report.byCompany.map((entry) => el('div', { text: entry.name })),
      ])
    : el('div', { class: 'print-party print-company' }, [
        el('div', { class: 'print-party-role', text: 'Structure' }),
        el('div', { class: 'print-party-name', text: report.company.displayName || '—' }),
        ...report.company.addressLines.map((line) => el('div', { text: line })),
        ...report.company.identifiers.map((line) => el('div', { class: 'print-ids', text: line })),
      ]);

  return el('header', { class: 'print-head' }, [beneficiaryBlock, companyBlock]);
}

/* ------------------------------------------------------------------ */
/* Tableau des trajets (§8)                                            */
/* ------------------------------------------------------------------ */

function buildTable(report) {
  // Sur une synthèse, une colonne de plus : qui rembourse chaque trajet.
  const withCompany = Boolean(report.allCompanies);
  const columnCount = withCompany ? 8 : 7;

  const head = el('thead', {}, [
    el(
      'tr',
      {},
      [
        el('th', { text: 'Date' }),
        withCompany ? el('th', { text: 'Structure' }) : null,
        el('th', { text: 'Départ' }),
        el('th', { text: 'Destination' }),
        el('th', { text: 'Motif' }),
        el('th', { text: 'Véhicule' }),
        el('th', { class: 'num', text: 'Km' }),
        el('th', { class: 'num', text: 'Montant' }),
      ].filter(Boolean),
    ),
  ]);

  const rows = report.lines.length
    ? report.lines.map((line) =>
        el(
          'tr',
          {},
          [
            el('td', { text: line.dateLabel }),
            withCompany ? el('td', { text: line.companyName }) : null,
            el('td', { text: line.from }),
            el('td', { text: line.roundTrip ? `${line.to} (aller-retour)` : line.to }),
            el('td', { text: line.purpose }),
            el('td', { text: line.vehicleName }),
            el('td', { class: 'num', text: formatNumberFr(line.km, 1) }),
            el('td', { class: 'num', text: formatMoney(line.amount) }),
          ].filter(Boolean),
        ),
      )
    : [
        el('tr', {}, [
          el('td', { colspan: String(columnCount), text: 'Aucun trajet sur cette période.' }),
        ]),
      ];

  // Les deux dernières colonnes portent les totaux, le reste sert de libellé.
  const labelSpan = String(columnCount - 2);

  const footRows = [
    el('tr', {}, [
      el('td', { colspan: labelSpan, class: 'total-label', text: 'Total kilomètres' }),
      el('td', { class: 'num total', text: formatNumberFr(report.totals.km, 1) }),
      el('td', { class: 'num', text: '' }),
    ]),
    el('tr', {}, [
      el('td', { colspan: labelSpan, class: 'total-label', text: 'Total indemnités' }),
      el('td', { class: 'num', text: '' }),
      el('td', { class: 'num total', text: formatMoney(report.totals.amount) }),
    ]),
  ];

  // Sur une synthèse, chaque structure rembourse sa part : le total global
  // ne suffit pas, il faut le détail.
  for (const entry of report.byCompany || []) {
    footRows.push(
      el('tr', { class: 'company-total' }, [
        el('td', { colspan: labelSpan, class: 'total-label', text: `dont ${entry.name}` }),
        el('td', { class: 'num', text: formatNumberFr(entry.km, 1) }),
        el('td', { class: 'num', text: formatMoney(entry.amount) }),
      ]),
    );
  }

  return el('table', { class: 'print-table' }, [
    head,
    el('tbody', {}, rows),
    el('tfoot', {}, footRows),
  ]);
}

/* ------------------------------------------------------------------ */
/* Rappel de la methode de calcul (§8)                                 */
/* ------------------------------------------------------------------ */

function buildFooterInfo(report) {
  const rows = [];

  rows.push(
    infoRow(
      'Nombre de trajets',
      `${report.totals.tripCount} · ${formatKm(report.totals.km)}`,
    ),
  );

  if (report.vehicles.length) {
    rows.push(
      infoRow(
        report.vehicles.length > 1 ? 'Véhicules' : 'Véhicule',
        report.vehicles.map((vehicle) => vehicle.label).join(' | '),
      ),
    );
    rows.push(
      infoRow(
        'Puissance fiscale retenue',
        report.vehicles
          .map((vehicle) =>
            vehicle.cvApplied === Number(vehicle.cv)
              ? `${vehicle.cv} CV`
              : `${vehicle.cv} CV (barème ${vehicle.cvApplied} CV)`,
          )
          .join(' | '),
      ),
    );
  }

  if (report.allCompanies) {
    // Chaque structure applique sa propre méthode : une ligne unique serait fausse.
    for (const entry of report.calculationsByCompany) {
      rows.push(infoRow(entry.companyName, entry.label));
    }
    rows.push(
      infoRow(
        'Nature du document',
        'Synthèse toutes structures — pour une demande de remboursement, éditer un état par structure.',
      ),
    );
  } else {
    rows.push(infoRow('Méthode de calcul', report.calculation.label));
    if (report.calculation.scaleYear) {
      rows.push(infoRow('Année du barème', String(report.calculation.scaleYear)));
    }
  }

  const info = el('section', { class: 'print-info' }, rows);

  const footer = el('footer', { class: 'print-footer' }, [
    el('div', {
      text: `Édité le ${report.generatedAtLabel} avec Agilmea IK ${report.appVersion}.`,
    }),
    el('div', {
      text: 'Document à conserver avec les justificatifs. Vérifier la conformité du régime fiscal retenu avec votre professionnel du chiffre.',
    }),
  ]);

  return el('div', {}, [info, footer]);
}

function infoRow(label, value) {
  return el('div', { class: 'print-info-row' }, [
    el('span', { class: 'print-info-label', text: label }),
    el('span', { class: 'print-info-value', text: value }),
  ]);
}
