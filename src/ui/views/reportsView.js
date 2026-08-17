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
  byId('printBtn').addEventListener('click', () => window.print());

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
    const companyId = companySelect.value;
    if (!companyId) {
      window.alert('Choisis une structure.');
      return;
    }

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
    byId('reportTitle').textContent = `${report.title} — ${report.company.name}`;

    renderWarnings(report);

    byId('reportSummary').replaceChildren(
      summary('Trajets', String(report.totals.tripCount)),
      summary('Total kilomètres', formatKm(report.totals.km)),
      summary('Total indemnités', formatMoney(report.totals.amount)),
    );

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
            el('td', { text: line.purpose }),
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

    const method = [
      report.period.label,
      `Méthode : ${report.calculation.label}`,
      report.calculation.scaleYear ? `Barème ${report.calculation.scaleYear}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    byId('reportMethod').textContent = method;
  }

  /** Signale ce qui manquera sur le PDF avant que l'utilisateur ne l'imprime. */
  function renderWarnings(report) {
    const container = byId('reportWarnings');
    container.replaceChildren();

    const missing = [];
    if (!report.beneficiary.present) {
      missing.push('le bénéficiaire (Réglages → Bénéficiaire des remboursements)');
    }
    if (!report.company.addressLines.length) {
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
    fillSelect(companySelect, store.state.companies, { labelOf: (company) => company.name });
    fillSelect(vehicleSelect, store.state.vehicles, {
      labelOf: (vehicle) => vehicle.name,
      leading: { value: '', label: 'Tous les véhicules' },
    });

    if (!fromInput.value || !toInput.value) setMonthRange(0);
    if (!fromInput.value) fromInput.value = todayIso();
  }

  return { refresh };
}
