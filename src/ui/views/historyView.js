/**
 * Onglet « Historique » : liste filtrable, modification, duplication, suppression.
 */

import { byId, el, fillSelect, delegate } from '../dom.js';
import { computeTripAmounts } from '../../domain/mileage/engine.js';
import { formatKm, formatMoney, formatDateFr } from '../../shared/format.js';

export function createHistoryView({ store, onEdit, onDuplicate, onChanged = () => {} }) {
  const companyFilter = byId('historyCompany');
  const yearFilter = byId('historyYear');
  const list = byId('historyList');
  const totals = byId('historyTotals');

  companyFilter.addEventListener('change', render);
  yearFilter.addEventListener('change', render);

  byId('clearTripsBtn').addEventListener('click', async () => {
    if (!store.state.trips.length) return;
    const confirmed = window.confirm(
      'Supprimer TOUS les trajets ? Cette action est irréversible sans sauvegarde.',
    );
    if (!confirmed) return;
    await store.deleteAllTrips();
    onChanged();
  });

  delegate(list, 'click', '[data-action]', async (event, button) => {
    const { action, id } = button.dataset;
    if (action === 'edit') onEdit(id);
    if (action === 'duplicate') onDuplicate(id);
    if (action === 'delete') {
      if (!window.confirm('Supprimer ce trajet ?')) return;
      await store.deleteTrip(id);
      onChanged();
    }
  });

  function refreshFilters() {
    fillSelect(companyFilter, store.state.companies, {
      labelOf: (company) => company.name,
      leading: { value: '', label: 'Toutes' },
    });

    const years = [...new Set(store.state.trips.map((trip) => trip.date?.slice(0, 4)))]
      .filter(Boolean)
      .sort()
      .reverse();
    const currentYear = String(new Date().getFullYear());
    if (!years.includes(currentYear)) years.unshift(currentYear);

    const previous = yearFilter.value;
    yearFilter.replaceChildren();
    yearFilter.append(el('option', { value: '', text: 'Toutes les années' }));
    for (const year of years) yearFilter.append(el('option', { value: year, text: year }));
    yearFilter.value = years.includes(previous) ? previous : currentYear;
  }

  function render() {
    const companyId = companyFilter.value;
    const year = yearFilter.value;

    const computations = computeTripAmounts(store.state.trips, {
      companies: store.state.companies,
      vehicles: store.state.vehicles,
    });

    const trips = store.state.trips
      .filter((trip) => !companyId || trip.companyId === companyId)
      .filter((trip) => !year || String(trip.date).startsWith(year))
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) ||
          String(b.createdAt).localeCompare(String(a.createdAt)),
      );

    renderTotals(trips, computations);

    list.replaceChildren();
    if (!trips.length) {
      list.append(el('p', { class: 'hint', text: 'Aucun trajet pour ce filtre.' }));
      return;
    }

    for (const trip of trips) {
      list.append(renderTrip(trip, computations.get(trip.id)));
    }
  }

  function renderTotals(trips, computations) {
    const km = trips.reduce((sum, trip) => sum + (Number(trip.km) || 0), 0);
    const amount = trips.reduce(
      (sum, trip) => sum + (Number(computations.get(trip.id)?.amount) || 0),
      0,
    );

    totals.replaceChildren(
      summary('Trajets', String(trips.length)),
      summary('Kilomètres', formatKm(km)),
      summary('Indemnités', formatMoney(amount)),
    );
  }

  function summary(label, value) {
    return el('div', { class: 'summary' }, [
      el('span', { text: label }),
      el('strong', { text: value }),
    ]);
  }

  function renderTrip(trip, computed) {
    const company = store.getCompany(trip.companyId);
    const vehicle = store.getVehicle(trip.vehicleId);

    const details = el('div', { class: 'trip-main' }, [
      el('strong', { text: `${trip.from} → ${trip.to}` }),
      el('div', {
        class: 'meta',
        text: [formatDateFr(trip.date), company?.name || '?', vehicle?.name || '?']
          .filter(Boolean)
          .join(' · '),
      }),
      el('div', {
        class: 'meta strong',
        text: [
          formatKm(trip.km),
          formatMoney(computed?.amount || 0),
          trip.roundTrip ? 'aller-retour' : null,
          trip.purpose || null,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    ]);

    const actions = el('div', { class: 'trip-actions' }, [
      el('button', { text: 'Modifier', dataset: { action: 'edit', id: trip.id } }),
      el('button', { text: 'Dupliquer', dataset: { action: 'duplicate', id: trip.id } }),
      el('button', {
        class: 'danger',
        text: 'Suppr.',
        dataset: { action: 'delete', id: trip.id },
      }),
    ]);

    return el('div', { class: 'trip-item' }, [details, actions]);
  }

  function refresh() {
    refreshFilters();
    render();
  }

  return { refresh };
}
