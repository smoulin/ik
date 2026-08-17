/**
 * Onglet « Trajet » : saisie, calcul de distance, enregistrement, edition.
 */

import { byId, el, fillSelect, setHidden } from '../dom.js';
import { attachAddressAutocomplete } from '../components/addressAutocomplete.js';
import { computeTripAmounts } from '../../domain/mileage/engine.js';
import { formatKm, formatMoney, formatDateFr, todayIso } from '../../shared/format.js';

export function createTripView({ store, geo, onSaved = () => {}, switchTab }) {
  const fields = {
    date: byId('tripDate'),
    company: byId('tripCompany'),
    vehicle: byId('tripVehicle'),
    from: byId('tripFrom'),
    to: byId('tripTo'),
    km: byId('tripKm'),
    purpose: byId('tripPurpose'),
    roundTrip: byId('roundTrip'),
  };

  const saveBtn = byId('saveTripBtn');
  const cancelBtn = byId('cancelEditBtn');
  const calcBtn = byId('calcDistanceBtn');
  const statusEl = byId('routeStatus');

  /** Coordonnees connues des adresses saisies : evite un geocodage inutile. */
  let fromCoords = null;
  let toCoords = null;
  let editingId = null;
  let calculating = false;

  const fromAutocomplete = attachAddressAutocomplete(fields.from, {
    service: geo.addressSearchService,
    onSelect: (suggestion) => {
      fromCoords = coordsOf(suggestion);
    },
    onInput: () => {
      fromCoords = null;
    },
  });

  const toAutocomplete = attachAddressAutocomplete(fields.to, {
    service: geo.addressSearchService,
    onSelect: (suggestion) => {
      toCoords = coordsOf(suggestion);
    },
    onInput: () => {
      toCoords = null;
    },
  });

  function coordsOf(suggestion) {
    if (!suggestion || !Number.isFinite(suggestion.latitude)) return null;
    return { latitude: suggestion.latitude, longitude: suggestion.longitude };
  }

  function showStatus(message, kind = '') {
    statusEl.textContent = message;
    statusEl.className = `status ${kind}`;
  }

  /* ---------------------------------------------------------------- */
  /* Calcul de distance                                                */
  /* ---------------------------------------------------------------- */

  async function calculateDistance() {
    const from = fields.from.value.trim();
    const to = fields.to.value.trim();

    if (!from || !to) {
      showStatus('Saisis le départ et la destination.', 'bad');
      return;
    }
    if (calculating) return;

    calculating = true;
    calcBtn.disabled = true;
    calcBtn.textContent = 'Calcul en cours…';
    showStatus('Recherche de l’itinéraire…');

    try {
      const result = await geo.distanceService.computeTripDistance({
        from,
        to,
        fromCoords,
        toCoords,
        roundTrip: fields.roundTrip.checked,
      });

      fromCoords = result.fromCoords;
      toCoords = result.toCoords;
      fields.km.value = result.km.toFixed(1);

      const sens = fields.roundTrip.checked ? 'Aller-retour' : 'Aller simple';
      showStatus(`${sens} : ${formatKm(result.km)} · calcul routier OpenStreetMap/OSRM`, 'good');
    } catch (error) {
      showStatus(`${error.message} Tu peux saisir les kilomètres manuellement.`, 'bad');
    } finally {
      calculating = false;
      calcBtn.textContent = 'Calculer les kilomètres';
      refreshAvailability();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Enregistrement                                                    */
  /* ---------------------------------------------------------------- */

  async function save() {
    const trip = {
      id: editingId || undefined,
      date: fields.date.value,
      companyId: fields.company.value,
      vehicleId: fields.vehicle.value,
      from: fields.from.value.trim(),
      to: fields.to.value.trim(),
      fromCoords,
      toCoords,
      km: Number(fields.km.value),
      purpose: fields.purpose.value.trim(),
      roundTrip: fields.roundTrip.checked,
      distanceSource: fromCoords && toCoords ? 'routing' : 'manual',
    };

    const problem = validate(trip);
    if (problem) {
      showStatus(problem, 'bad');
      return;
    }

    saveBtn.disabled = true;
    try {
      await store.saveTrip(trip);
      const wasEditing = Boolean(editingId);
      reset();
      showStatus(wasEditing ? 'Trajet modifié.' : 'Trajet enregistré.', 'good');
      onSaved();
    } catch (error) {
      showStatus(`Enregistrement impossible : ${error.message}`, 'bad');
    } finally {
      saveBtn.disabled = false;
      refreshAvailability();
    }
  }

  function validate(trip) {
    if (!trip.date) return 'Indique la date du trajet.';
    if (!trip.companyId) return 'Choisis une structure.';
    if (!trip.vehicleId) return 'Choisis un véhicule.';
    if (!trip.from) return 'Indique le point de départ.';
    if (!trip.to) return 'Indique la destination.';
    if (!Number.isFinite(trip.km) || trip.km < 0) return 'Indique une distance valide.';
    return null;
  }

  function reset() {
    editingId = null;
    fromCoords = null;
    toCoords = null;
    fromAutocomplete.setValue('');
    toAutocomplete.setValue('');
    fields.km.value = '';
    fields.purpose.value = '';
    fields.roundTrip.checked = false;
    fields.date.value = todayIso();
    saveBtn.textContent = 'Enregistrer le trajet';
    setHidden(cancelBtn, true);
    showStatus('');
  }

  /** Charge un trajet existant dans le formulaire (bouton « Modifier »). */
  function edit(id) {
    const trip = store.getTrip(id);
    if (!trip) return;

    editingId = id;
    fields.date.value = trip.date;
    fields.company.value = trip.companyId;
    fields.vehicle.value = trip.vehicleId;
    fromAutocomplete.setValue(trip.from);
    toAutocomplete.setValue(trip.to);
    fields.km.value = trip.km;
    fields.purpose.value = trip.purpose || '';
    fields.roundTrip.checked = Boolean(trip.roundTrip);
    fromCoords = trip.fromCoords;
    toCoords = trip.toCoords;

    saveBtn.textContent = 'Enregistrer les modifications';
    setHidden(cancelBtn, false);
    showStatus('Modification en cours.', '');
    switchTab('trip');
  }

  /** Duplique un trajet : meme parcours, date du jour, pas encore enregistre. */
  function duplicate(id) {
    const trip = store.getTrip(id);
    if (!trip) return;

    editingId = null;
    fields.date.value = todayIso();
    fields.company.value = trip.companyId;
    fields.vehicle.value = trip.vehicleId;
    fromAutocomplete.setValue(trip.from);
    toAutocomplete.setValue(trip.to);
    fields.km.value = trip.km;
    fields.purpose.value = trip.purpose || '';
    fields.roundTrip.checked = Boolean(trip.roundTrip);
    fromCoords = trip.fromCoords;
    toCoords = trip.toCoords;

    saveBtn.textContent = 'Enregistrer le trajet';
    setHidden(cancelBtn, false);
    showStatus('Copie d’un trajet existant — vérifie la date.', '');
    switchTab('trip');
  }

  /* ---------------------------------------------------------------- */
  /* Rafraichissement                                                  */
  /* ---------------------------------------------------------------- */

  function refreshAvailability() {
    const ready = store.state.companies.length > 0 && store.state.vehicles.length > 0;
    saveBtn.disabled = !ready;
    calcBtn.disabled = !ready || calculating;
    setHidden(byId('setupBanner'), ready);
  }

  function refresh() {
    fillSelect(fields.company, store.state.companies, { labelOf: (c) => c.name });
    fillSelect(fields.vehicle, store.state.vehicles, { labelOf: (v) => v.name });
    if (!fields.date.value) fields.date.value = todayIso();
    refreshAvailability();
    refreshLastTrip();
  }

  function refreshLastTrip() {
    const container = byId('lastTrip');
    const trips = [...store.state.trips].sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    const trip = trips[0];

    container.replaceChildren();
    if (!trip) {
      container.append(el('p', { class: 'hint', text: 'Aucun trajet enregistré.' }));
      return;
    }

    const computed = computeTripAmounts(store.state.trips, {
      companies: store.state.companies,
      vehicles: store.state.vehicles,
    }).get(trip.id);

    const company = store.getCompany(trip.companyId);
    const vehicle = store.getVehicle(trip.vehicleId);

    container.append(
      el('strong', { text: `${trip.from} → ${trip.to}` }),
      el('div', {
        class: 'meta',
        text: [
          formatDateFr(trip.date),
          company?.name || '?',
          vehicle?.name || '?',
          formatKm(trip.km),
          formatMoney(computed?.amount || 0),
        ].join(' · '),
      }),
    );
  }

  /* ---------------------------------------------------------------- */

  calcBtn.addEventListener('click', calculateDistance);
  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', reset);
  fields.roundTrip.addEventListener('change', () => {
    // La distance affichee ne correspond plus au sens choisi : on invite a recalculer.
    if (fields.km.value) showStatus('Le sens a changé : relance le calcul si besoin.', '');
  });

  return { refresh, edit, duplicate, reset };
}
