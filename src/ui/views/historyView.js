/**
 * Onglet « Historique » : navigation mois par mois, trajets regroupés
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
import { findNearestPlace } from '../../services/tracks/trackImportService.js';
import { formatAddressOneLine } from '../../domain/models.js';
import { normalizeText } from '../../shared/normalize.js';
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

export function createHistoryView({
  store,
  geo = null,
  onEdit,
  onDuplicate,
  onAddForDate = () => {},
  onChanged = () => {},
}) {
  /**
   * Traces d'itineraire deja calculees, le temps de la session.
   *
   * Un trajet ne stocke pas son trace : le conserver alourdirait la base et
   * chaque sauvegarde de quelques milliers de points par trajet. Il est donc
   * recalcule a l'ouverture de la carte, puis retenu ici pour qu'un second
   * depliage soit instantane.
   */
  const routeCache = new Map();
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
  // Sens demandé par l'utilisateur, inverse de la convention habituelle : la
  // flèche de gauche avance dans le temps. Les libellés d'accessibilité, dans
  // index.html, ont été inversés avec elle pour ne pas annoncer le contraire.
  byId('prevPeriodBtn').addEventListener('click', () => shiftPeriod(1));
  byId('nextPeriodBtn').addEventListener('click', () => shiftPeriod(-1));
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

  /**
   * La periode affichee est-elle deja celle d'aujourd'hui ? Le lien
   * « Aujourd'hui » n'a alors aucun effet : le montrer laisse croire qu'il est
   * casse, puisque cliquer ne change rien a l'ecran.
   */
  function isCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = scope === 'day' ? `${year}-${month}-${day}` : scope === 'month' ? `${year}-${month}` : String(year);
    return periodPrefix() === today;
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
          // Les journées, de la plus récente à la plus ancienne.
          String(b.date).localeCompare(String(a.date)) ||
          // Mais à l'intérieur d'une journée, dans l'ordre de saisie : le
          // trajet ajouté par le « + » du jour se range SOUS les précédents,
          // là où le geste le fait attendre.
          String(a.createdAt).localeCompare(String(b.createdAt)),
      );
  }

  /* ---------------------------------------------------------------- */
  /* Rendu                                                             */
  /* ---------------------------------------------------------------- */

  function render() {
    monthLabel.textContent = periodLabel();
    setHidden(byId('todayBtn'), isCurrentPeriod());

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
      // Ajout direct a la date du groupe : saisir un trajet oublie sans avoir
      // a rechercher la date dans le formulaire.
      el('button', {
        class: 'day-add',
        type: 'button',
        text: '+',
        title: `Ajouter un trajet le ${formatDayLabel(date)}`,
        'aria-label': `Ajouter un trajet le ${formatDayLabel(date)}`,
        onClick: () => onAddForDate(date),
      }),
    ]);
  }

  function formatDayLabel(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /**
   * Une extrémité de trajet, nommée quand elle correspond à un lieu favori.
   *
   * Le trajet ne porte que ce qui a été saisi : tantôt « Maison », tantôt
   * l'adresse complète, selon le jour et la façon dont il est entré. Passer par
   * le favori uniformise les deux — on lit toujours le nom, puis l'adresse.
   */
  function endpointLabel(text, coords) {
    const place = matchFavorite(text, coords);
    if (!place) return el('span', { text });

    const address = formatAddressOneLine(place.address);
    return el('span', { class: 'endpoint-named' }, [
      el('strong', { text: place.name }),
      address ? ` ${address}` : null,
    ]);
  }

  /**
   * Rapprochement d'une extrémité avec un lieu favori.
   *
   * Les coordonnées d'abord : elles ne dépendent pas de la façon d'écrire une
   * adresse. Le texte ensuite, pour les trajets saisis sans coordonnées.
   */
  function matchFavorite(text, coords) {
    const places = store.state.favoritePlaces;
    if (!places.length) return null;

    if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
      const near = findNearestPlace([coords.latitude, coords.longitude], places);
      if (near) return near.place;
    }

    const wanted = normalizeText(text);
    if (!wanted) return null;
    return (
      places.find(
        (place) =>
          normalizeText(place.name) === wanted ||
          normalizeText(formatAddressOneLine(place.address)) === wanted,
      ) || null
    );
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
            endpointLabel(trip.from, trip.fromCoords),
          ]),
          el('div', { class: 'trip-endpoint' }, [
            el('span', { class: 'dot', text: 'B' }),
            endpointLabel(trip.to, trip.toCoords),
          ]),
          el('div', {
            class: 'meta',
            text: [company?.name, vehicle?.name, trip.roundTrip ? 'aller-retour' : null]
              .filter(Boolean)
              .join(' · '),
          }),
          // Le motif justifie le trajet : il se lit sans avoir a deplier.
          trip.purpose ? el('div', { class: 'trip-purpose', text: trip.purpose }) : null,
        ]),
        el('div', { class: 'trip-figures' }, [
          el('div', { class: 'km', text: formatKm(trip.km) }),
          el('div', { class: 'amount', text: formatMoney(computed?.amount || 0) }),
        ]),
      ],
    );

    // L'identifiant sert à ramener le trajet sous les yeux après modification.
    const card = el('div', { class: 'trip-card', id: `trip-${trip.id}` }, [summary]);
    if (isOpen) card.append(renderDetails(trip, computed));
    return card;
  }

  function renderDetails(trip, computed) {
    const mapNode = el('div', { class: 'route-map' });

    const details = el('div', { class: 'trip-details' }, [
      // Le motif est desormais porte par la ligne repliee : ne pas le repeter ici.
      el('div', { class: 'meta', text: computed?.rateInfo || '' }),
      mapNode,
      el('div', { class: 'button-row equal' }, [
        el('button', { text: 'Modifier', onClick: () => onEdit(trip.id) }),
        el('button', { text: 'Dupliquer', onClick: () => onDuplicate(trip.id) }),
        el('button', { class: 'danger', text: 'Supprimer', onClick: () => remove(trip.id) }),
      ]),
    ]);

    // La carte n'existe que si le trajet porte des coordonnées résolues.
    if (trip.fromCoords && trip.toCoords) {
      showRoute(trip, mapNode);
    } else {
      setHidden(mapNode, true);
    }

    return details;
  }

  /**
   * Carte d'un trajet : la route réellement suivie, pas la corde.
   *
   * Les deux extrémités s'affichent d'abord — c'est immédiat et cela ne dépend
   * de rien. L'itinéraire les remplace ensuite, quand il arrive. Sans réseau,
   * la ligne droite reste : mieux vaut une carte approximative que pas de carte.
   */
  function showRoute(trip, mapNode) {
    const ends = [
      [trip.fromCoords.latitude, trip.fromCoords.longitude],
      [trip.toCoords.latitude, trip.toCoords.longitude],
    ];
    const labels = { from: trip.from, to: trip.to };

    const map = createRouteMap(mapNode);
    maps.set(trip.id, map);

    const draw = (points) => map.show(points, labels).catch(() => setHidden(mapNode, true));

    const known = routeCache.get(trip.id);
    if (known) {
      draw(known);
      return;
    }

    draw(ends);
    if (!geo?.distanceService) return;

    geo.distanceService
      .computeTripDistance({
        from: trip.from,
        to: trip.to,
        fromCoords: trip.fromCoords,
        toCoords: trip.toCoords,
        // L'aller suffit : le retour emprunte le même tracé à l'écran.
        roundTrip: false,
        preference: trip.routePreference,
      })
      .then((route) => {
        if (!route.geometry?.length) return;
        routeCache.set(trip.id, route.geometry);
        /*
         * On redessine par un réaffichage, et non sur la carte courante : un
         * `render()` peut survenir pendant la requête, et l'ancienne carte se
         * retrouve alors détachée du document — le tracé y serait dessiné pour
         * personne. Le cache, lui, survit au réaffichage, et `showRoute` le
         * consulte avant de relancer quoi que ce soit : aucune boucle possible.
         */
        if (expanded.has(trip.id)) render();
      })
      .catch(() => {});
  }

  /** Déplie un trajet et l'amène sous les yeux — après une modification. */
  function openTrip(id) {
    expanded.add(id);
    render();
    // Le rendu vient d'avoir lieu : l'élément existe.
    document.getElementById(`trip-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  return { refresh, openTrip };
}
