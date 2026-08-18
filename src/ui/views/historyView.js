/**
 * Onglet « Tous les trajets » : navigation mois par mois, trajets regroupés
 * par jour, chacun dépliable.
 *
 * La carte n'est chargée qu'au dépliage d'un trajet : afficher un fond
 * cartographique par ligne enverrait les coordonnées de tous les trajets aux
 * serveurs de tuiles à chaque ouverture de l'écran, ce qui serait contraire à
 * leur politique d'usage autant qu'à la discrétion attendue de l'application.
 */

import { byId, qsa, el, fillSelect, setHidden } from '../dom.js';
import { createRouteMap } from '../components/routeMap.js';
import { computeTripAmounts } from '../../domain/mileage/engine.js';
import { formatKm, formatMoney } from '../../shared/format.js';

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export function createHistoryView({ store, onEdit, onDuplicate, onChanged = () => {} }) {
  const companyFilter = byId('historyCompany');
  const list = byId('historyList');
  const totals = byId('historyTotals');
  const monthLabel = byId('monthLabel');

  /**
   * Periode affichee : une granularite et une date de reference.
   * Le mois est la vue par defaut — c'est la maille d'un etat de frais.
   */
  let scope = 'month';
  let cursor = new Date();

  const expanded = new Set();
  const maps = new Map();

  companyFilter.addEventListener('change', render);
  byId('prevPeriodBtn').addEventListener('click', () => shiftPeriod(-1));
  byId('nextPeriodBtn').addEventListener('click', () => shiftPeriod(1));
  byId('todayBtn').addEventListener('click', () => {
    cursor = new Date();
    render();
  });

  for (const button of qsa('.scope-btn')) {
    button.addEventListener('click', () => {
      scope = button.dataset.scope;
      qsa('.scope-btn').forEach((b) => b.classList.toggle('active', b === button));
      render();
    });
  }

  byId('clearTripsBtn').addEventListener('click', async () => {
    if (!store.state.trips.length) return;
    const confirmed = window.confirm(
      'Supprimer TOUS les trajets ? Cette action est irréversible sans sauvegarde.',
    );
    if (!confirmed) return;
    await store.deleteAllTrips();
    onChanged();
  });

  /** Avance ou recule d'une unite de la granularite courante. */
  function shiftPeriod(delta) {
    const d = new Date(cursor);
    if (scope === 'day') d.setDate(d.getDate() + delta);
    else if (scope === 'month') d.setMonth(d.getMonth() + delta, 1);
    else d.setFullYear(d.getFullYear() + delta, 0, 1);
    cursor = d;
    render();
  }

  /**
   * Prefixe ISO de la periode affichee. Les dates etant stockees en
   * AAAA-MM-JJ, un simple prefixe suffit a filtrer jour, mois ou annee.
   */
  function periodPrefix() {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');

    if (scope === 'day') return `${year}-${month}-${day}`;
    if (scope === 'month') return `${year}-${month}`;
    return String(year);
  }

  function periodLabel() {
    if (scope === 'day') {
      return cursor.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    if (scope === 'month') return `${MOIS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    return String(cursor.getFullYear());
  }

  function emptyLabel() {
    if (scope === 'day') return 'Aucun trajet ce jour-là.';
    if (scope === 'month') return `Aucun trajet en ${periodLabel()}.`;
    return `Aucun trajet en ${periodLabel()}.`;
  }

  /* ---------------------------------------------------------------- */
  /* Sélection                                                         */
  /* ---------------------------------------------------------------- */

  function selectedTrips() {
    const companyId = companyFilter.value;
    const prefix = periodPrefix();

    return store.state.trips
      .filter((trip) => !companyId || trip.companyId === companyId)
      .filter((trip) => String(trip.date).startsWith(prefix))
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) ||
          String(b.createdAt).localeCompare(String(a.createdAt)),
      );
  }

  /* ---------------------------------------------------------------- */
  /* Rendu                                                             */
  /* ---------------------------------------------------------------- */

  function render() {
    monthLabel.textContent = periodLabel();

    const trips = selectedTrips();
    const computations = computeTripAmounts(store.state.trips, {
      companies: store.state.companies,
      vehicles: store.state.vehicles,
    });

    renderTotals(trips, computations);

    list.replaceChildren();
    maps.clear();

    if (!trips.length) {
      list.append(el('p', { class: 'hint', text: emptyLabel() }));
      return;
    }

    // Regroupement par jour, comme dans un agenda.
    for (const [date, dayTrips] of groupByDay(trips)) {
      list.append(renderDay(date, dayTrips, computations));
    }
  }

  function groupByDay(trips) {
    const groups = new Map();
    for (const trip of trips) {
      if (!groups.has(trip.date)) groups.set(trip.date, []);
      groups.get(trip.date).push(trip);
    }
    return groups;
  }

  function renderDay(date, dayTrips, computations) {
    const km = dayTrips.reduce((sum, trip) => sum + (Number(trip.km) || 0), 0);
    const amount = dayTrips.reduce(
      (sum, trip) => sum + (Number(computations.get(trip.id)?.amount) || 0),
      0,
    );

    return el('div', { class: 'day-group' }, [
      el('div', { class: 'day-head' }, [
        el('span', { class: 'day-date', text: formatDayLabel(date) }),
        el('span', {
          class: 'day-total',
          text: `${dayTrips.length} trajet(s) · ${formatKm(km)} · ${formatMoney(amount)}`,
        }),
      ]),
      ...dayTrips.map((trip) => renderTrip(trip, computations.get(trip.id))),
    ]);
  }

  function formatDayLabel(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function renderTrip(trip, computed) {
    const isOpen = expanded.has(trip.id);
    const company = store.getCompany(trip.companyId);
    const vehicle = store.getVehicle(trip.vehicleId);

    const summary = el(
      'button',
      { class: 'trip-summary', type: 'button', onClick: () => toggle(trip.id) },
      [
        el('div', { class: 'trip-endpoints' }, [
          el('div', { class: 'trip-endpoint' }, [
            el('span', { class: 'dot', text: 'A' }),
            el('span', { text: trip.from }),
          ]),
          el('div', { class: 'trip-endpoint' }, [
            el('span', { class: 'dot', text: 'B' }),
            el('span', { text: trip.to }),
          ]),
          el('div', {
            class: 'meta',
            text: [company?.name, vehicle?.name, trip.roundTrip ? 'aller-retour' : null]
              .filter(Boolean)
              .join(' · '),
          }),
        ]),
        el('div', { class: 'trip-figures' }, [
          el('div', { class: 'km', text: formatKm(trip.km) }),
          el('div', { class: 'amount', text: formatMoney(computed?.amount || 0) }),
        ]),
      ],
    );

    const card = el('div', { class: 'trip-card' }, [summary]);
    if (isOpen) card.append(renderDetails(trip, computed));
    return card;
  }

  function renderDetails(trip, computed) {
    const mapNode = el('div', { class: 'route-map' });

    const details = el('div', { class: 'trip-details' }, [
      trip.purpose ? el('div', { class: 'meta strong', text: `Motif : ${trip.purpose}` }) : null,
      el('div', { class: 'meta', text: computed?.rateInfo || '' }),
      mapNode,
      el('div', { class: 'button-row' }, [
        el('button', { text: 'Modifier', onClick: () => onEdit(trip.id) }),
        el('button', { text: 'Dupliquer', onClick: () => onDuplicate(trip.id) }),
        el('button', { class: 'danger', text: 'Supprimer', onClick: () => remove(trip.id) }),
      ]),
    ]);

    // La carte n'existe que si le trajet porte des coordonnées résolues.
    if (trip.fromCoords && trip.toCoords) {
      const map = createRouteMap(mapNode);
      maps.set(trip.id, map);
      map
        .show(
          [
            [trip.fromCoords.latitude, trip.fromCoords.longitude],
            [trip.toCoords.latitude, trip.toCoords.longitude],
          ],
          { from: trip.from, to: trip.to },
        )
        .catch(() => setHidden(mapNode, true));
    } else {
      setHidden(mapNode, true);
    }

    return details;
  }

  function toggle(id) {
    if (expanded.has(id)) {
      maps.get(id)?.destroy();
      expanded.delete(id);
    } else {
      expanded.add(id);
    }
    render();
  }

  async function remove(id) {
    if (!window.confirm('Supprimer ce trajet ?')) return;
    await store.deleteTrip(id);
    expanded.delete(id);
    onChanged();
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

  function refresh() {
    fillSelect(companyFilter, store.state.companies, {
      labelOf: (company) => company.name,
      leading: { value: '', label: 'Toutes' },
    });
    render();
  }

  return { refresh };
}
