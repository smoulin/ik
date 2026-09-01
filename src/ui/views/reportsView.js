/**
 * Onglet « Rapports » : generation, apercu ecran, export CSV, impression PDF.
 *
 * L'apercu et le document imprime sont produits a partir du MEME objet
 * (`buildReport`), afin qu'ils ne puissent pas diverger.
 */

import { byId, el, fillSelect, setHidden, downloadBlob } from '../dom.js';
import { buildReport } from '../../domain/reporting/reportModel.js';
import { renderPrintReport } from '../report/printReport.js';
import { buildCsv, csvFileName } from '../../services/export/csvExport.js';
import { printCurrentView } from '../../services/platform/printing.js';
import { formatKm, formatMoney, formatNumberFr, todayIso, lastDayOfMonth } from '../../shared/format.js';

export function createReportsView({ store, appVersion }) {
  const companySelect = byId('reportCompany');
  const vehicleSelect = byId('reportVehicle');
  const fromInput = byId('reportFrom');
  const toInput = byId('reportTo');
  const card = byId('reportCard');
  const rowsBody = byId('reportRows');

  let currentReport = null;

  byId('generateReportBtn').addEventListener('click', generate);
  byId('csvBtn').addEventListener('click', exportCsv);
  byId('printBtn').addEventListener('click', () => {
    printCurrentView().catch((error) => console.warn('[impression] echec', error));
  });

  byId('reportThisMonthBtn').addEventListener('click', () => setMonthRange(0));
  byId('reportPrevMonthBtn').addEventListener('click', () => setMonthRange(-1));
  byId('reportThisYearBtn').addEventListener('click', () => {
    const year = new Date().getFullYear();
    fromInput.value = `${year}-01-01`;
    toInput.value = `${year}-12-31`;
  });

  /** Renseigne les bornes du mois courant (offset 0) ou d'un mois precedent. */
  function setMonthRange(offset) {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    fromInput.value = `${year}-${month}-01`;
    toInput.value = `${year}-${month}-${String(lastDayOfMonth(year, month)).padStart(2, '0')}`;
  }

  function generate() {
    // Aucune structure choisie = rapport de synthèse, toutes structures.
    const companyId = companySelect.value;

    currentReport = buildReport({
      trips: store.state.trips,
      companies: store.state.companies,
      vehicles: store.state.vehicles,
      beneficiary: store.state.beneficiary,
      filters: {
        companyId,
        vehicleId: vehicleSelect.value,
        from: fromInput.value,
        to: toInput.value,
      },
      appVersion,
    });

    renderScreen(currentReport);
    renderPrintReport(byId('print-report'), currentReport);
    setHidden(card, false);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------------------------------------------------------- */
  /* Apercu ecran                                                      */
  /* ---------------------------------------------------------------- */

  function renderScreen(report) {
    byId('reportTitle').textContent = report.allCompanies
      ? report.title
      : `${report.title} — ${report.company.name}`;

    renderWarnings(report);

    byId('reportSummary').replaceChildren(
      summary('Trajets', String(report.totals.tripCount)),
      summary('Total kilomètres', formatKm(report.totals.km)),
      summary('Total indemnités', formatMoney(report.totals.amount)),
    );

    renderCompanyTotals(report);

    rowsBody.replaceChildren();
    if (!report.lines.length) {
      rowsBody.append(
        el('tr', {}, [el('td', { colspan: '6', text: 'Aucun trajet sur cette période.' })]),
      );
    } else {
      for (const line of report.lines) {
        rowsBody.append(
          el('tr', {}, [
            el('td', { text: line.dateLabel }),
            el('td', {}, [
              el('div', { text: `${line.from} → ${line.to}` }),
              line.roundTrip ? el('div', { class: 'meta', text: 'aller-retour' }) : null,
            ]),
            el('td', {}, [
              el('div', { text: line.purpose }),
              // Sur une synthèse, chaque ligne doit dire qui rembourse.
              report.allCompanies
                ? el('div', { class: 'meta strong', text: line.companyName })
                : null,
            ]),
            el('td', { text: line.vehicleName }),
            el('td', { class: 'num', text: formatNumberFr(line.km, 1) }),
            el('td', { class: 'num' }, [
              el('div', { text: formatMoney(line.amount) }),
              el('div', { class: 'meta', text: line.rateInfo }),
            ]),
          ]),
        );
      }
    }

    // Sur une synthèse, chaque structure applique sa propre méthode.
    const method = report.allCompanies
      ? [
          report.period.label,
          ...report.calculationsByCompany.map((c) => `${c.companyName} : ${c.label}`),
        ].join(' · ')
      : [
          report.period.label,
          `Méthode : ${report.calculation.label}`,
          // Plusieurs années possibles : le barème suit la date de chaque trajet.
          report.calculation.scaleYears?.length
            ? `Barème ${report.calculation.scaleYears.join(' et ')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');
    byId('reportMethod').textContent = method;
  }

  /** Sous-totaux par structure, propres au rapport de synthèse. */
  function renderCompanyTotals(report) {
    const container = byId('reportByCompany');
    container.replaceChildren();
    if (!report.allCompanies || !report.byCompany.length) return;

    container.append(el('h3', { text: 'Détail par structure' }));
    for (const entry of report.byCompany) {
      container.append(
        el('div', { class: 'settings-item' }, [
          el('div', { class: 'settings-item-main' }, [
            el('strong', { text: entry.name }),
            el('div', { class: 'meta', text: `${entry.tripCount} trajet(s) · ${formatKm(entry.km)}` }),
          ]),
          el('div', { class: 'trip-figures' }, [
            el('div', { class: 'amount', text: formatMoney(entry.amount) }),
          ]),
        ]),
      );
    }
  }

  /** Signale ce qui manquera sur le PDF avant que l'utilisateur ne l'imprime. */
  function renderWarnings(report) {
    const container = byId('reportWarnings');
    container.replaceChildren();

    // Une synthèse n'est pas un état de frais : elle n'est adressée à aucune
    // structure et ne doit pas être remise telle quelle pour remboursement.
    if (report.allCompanies) {
      container.append(
        el('p', {
          class: 'status warn',
          text:
            '⚠ Document de synthèse, toutes structures confondues. Pour une demande de ' +
            'remboursement, génère un état par structure : c’est elle qui rembourse.',
        }),
      );
    }

    const missing = [];
    if (!report.beneficiary.present) {
      missing.push('le bénéficiaire (Réglages → Bénéficiaire des remboursements)');
    }
    if (!report.allCompanies && !report.company.addressLines.length) {
      missing.push('l’adresse de la structure (Réglages → Structures)');
    }

    if (missing.length) {
      container.append(
        el('p', {
          class: 'status bad',
          text: `À compléter pour un rapport exploitable : ${missing.join(', ')}.`,
        }),
      );
    }

    // Avertissements métier (périmètre du cumul annuel du barème).
    for (const warning of report.warnings || []) {
      container.append(el('p', { class: 'status warn', text: `⚠ ${warning.message}` }));
    }
  }

  function summary(label, value) {
    return el('div', { class: 'summary' }, [
      el('span', { text: label }),
      el('strong', { text: value }),
    ]);
  }

  /* ---------------------------------------------------------------- */

  function exportCsv() {
    if (!currentReport || !currentReport.lines.length) {
      window.alert('Génère d’abord un rapport contenant des trajets.');
      return;
    }
    const companyName = currentReport.company.name;
    downloadBlob(
      buildCsv(currentReport, { companyName }),
      'text/csv;charset=utf-8',
      csvFileName(currentReport, { companyName }),
    );
  }

  function refresh() {
    fillSelect(companySelect, store.state.companies, {
      labelOf: (company) => company.name,
      leading: { value: '', label: 'Toutes les structures' },
    });
    fillSelect(vehicleSelect, store.state.vehicles, {
      labelOf: (vehicle) => vehicle.name,
      leading: { value: '', label: 'Tous les véhicules' },
    });

    if (!fromInput.value || !toInput.value) setMonthRange(0);
    if (!fromInput.value) fromInput.value = todayIso();
  }

  return { refresh };
}
