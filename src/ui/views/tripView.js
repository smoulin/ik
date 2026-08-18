/**
 * Onglet « Trajet » : saisie, calcul de distance, enregistrement, edition.
 */

import { byId, el, fillSelect, setHidden } from '../dom.js';
import { attachAddressAutocomplete } from '../components/addressAutocomplete.js';
import { createRouteMap } from '../components/routeMap.js';
import { computeTripAmounts } from '../../domain/mileage/engine.js';
import {
  formatKm,
  formatMoney,
  formatDateFr,
  todayIso,
  parseDecimal,
  formatDecimalInput,
} from '../../shared/format.js';

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
    routePreference: byId('routePreference'),
  };

  const saveBtn = byId('saveTripBtn');
  const cancelBtn = byId('cancelEditBtn');
  const calcBtn = byId('calcDistanceBtn');
  const statusEl = byId('routeStatus');
  const mapBtn = byId('showMapBtn');
  const mapContainer = byId('routeMap');

  /** Coordonnees connues des adresses saisies : evite un geocodage inutile. */
  let fromCoords = null;
  let toCoords = null;
  let editingId = null;
  let calculating = false;

  /** Trace du dernier calcul, conservee pour l'affichage a la demande. */
  let lastGeometry = null;
  const routeMap = createRouteMap(mapContainer);

  /**
   * Distance aller du dernier calcul reseau. Elle permet de basculer
   * aller simple / aller-retour instantanement, sans rappeler le fournisseur.
   */
  let lastOneWayKm = null;

  /** Anti-rebond du recalcul automatique : le serveur accepte 1 requete/seconde. */
  let recalcTimer = null;

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

  function itineraryLabel(preference) {
    return (
      { fastest: 'le plus rapide', 'no-highway': 'sans autoroute', 'no-toll': 'sans péage' }[
        preference
      ] || 'le plus rapide'
    );
  }

  /* ---------------------------------------------------------------- */
  /* Carte, affichee uniquement sur demande explicite                  */
  /* ---------------------------------------------------------------- */

  function hideMap() {
    setHidden(mapContainer, true);
    mapBtn.textContent = 'Voir le trajet sur la carte';
  }

  async function toggleMap() {
    if (!mapContainer.classList.contains('hidden')) {
      hideMap();
      return;
    }
    if (!lastGeometry) return;

    mapBtn.disabled = true;
    try {
      setHidden(mapContainer, false);
      await routeMap.show(lastGeometry, {
        from: fields.from.value.trim(),
        to: fields.to.value.trim(),
      });
      mapBtn.textContent = 'Masquer la carte';
    } catch (error) {
      hideMap();
      showStatus(`Carte indisponible : ${error.message}`, 'bad');
    } finally {
      mapBtn.disabled = false;
    }
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
        preference: fields.routePreference.value,
      });

      fromCoords = result.fromCoords;
      toCoords = result.toCoords;
      fields.km.value = formatDecimalInput(result.km, 1);

      lastOneWayKm = result.oneWayKm;
      lastGeometry = result.geometry;
      setHidden(mapBtn, !lastGeometry);
      hideMap();

      const sens = fields.roundTrip.checked ? 'Aller-retour' : 'Aller simple';
      const itineraire = itineraryLabel(fields.routePreference.value);
      // La duree renvoyee par Valhalla est peu fiable hors autoroute : on ne
      // l'affiche pas, seule la distance est exploitable.
      showStatus(`${sens} · ${itineraire} : ${formatKm(result.km)}`, 'good');
    } catch (error) {
      lastGeometry = null;
      // La distance aller n'est plus fiable : on ne doit plus proposer de
      // basculer en aller-retour a partir d'une valeur perimee.
      lastOneWayKm = null;
      setHidden(mapBtn, true);
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
    // parseDecimal distingue « champ vide ou illisible » (null) de « 0 saisi » :
    // sans cette distinction, « 10,5 » enregistrait un trajet a 0 km.
    const km = parseDecimal(fields.km.value);

    const trip = {
      id: editingId || undefined,
      date: fields.date.value,
      companyId: fields.company.value,
      vehicleId: fields.vehicle.value,
      from: fields.from.value.trim(),
      to: fields.to.value.trim(),
      fromCoords,
      toCoords,
      km,
      purpose: fields.purpose.value.trim(),
      roundTrip: fields.roundTrip.checked,
      distanceSource: fromCoords && toCoords ? 'routing' : 'manual',
      routePreference: fields.routePreference.value,
    };

    const problem = validate(trip);
    if (problem) {
      showStatus(problem, 'bad');
      fields.km.focus();
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
    if (trip.km === null) return 'Indique la distance en kilomètres (ex. 10,5).';
    if (trip.km < 0) return 'La distance ne peut pas être négative.';
    if (trip.km === 0) return 'La distance est à 0 km : corrige-la ou lance le calcul.';
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
    fields.routePreference.value = 'fastest';
    lastGeometry = null;
    lastOneWayKm = null;
    if (recalcTimer !== null) {
      clearTimeout(recalcTimer);
      recalcTimer = null;
    }
    setHidden(mapBtn, true);
    hideMap();
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
    fields.km.value = formatDecimalInput(trip.km);
    fields.purpose.value = trip.purpose || '';
    fields.roundTrip.checked = Boolean(trip.roundTrip);
    fields.routePreference.value = trip.routePreference || 'fastest';
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
    fields.km.value = formatDecimalInput(trip.km);
    fields.purpose.value = trip.purpose || '';
    fields.roundTrip.checked = Boolean(trip.roundTrip);
    fields.routePreference.value = trip.routePreference || 'fastest';
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

    // Meme presentation et memes actions que dans l'historique : le trajet qui
    // vient d'etre saisi est justement celui qu'on veut pouvoir corriger.
    container.append(
      el('div', { class: 'trip-item' }, [
        el('div', { class: 'trip-main' }, [
          el('strong', { text: `${trip.from} → ${trip.to}` }),
          el('div', {
            class: 'meta',
            text: [formatDateFr(trip.date), company?.name || '?', vehicle?.name || '?'].join(' · '),
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
        ]),
        el('div', { class: 'trip-actions' }, [
          el('button', { text: 'Modifier', onClick: () => edit(trip.id) }),
          el('button', { text: 'Dupliquer', onClick: () => duplicate(trip.id) }),
          el('button', {
            class: 'danger',
            text: 'Suppr.',
            onClick: () => removeTrip(trip.id),
          }),
        ]),
      ]),
    );
  }

  /** Suppression depuis « Dernier trajet », avec la meme confirmation qu'ailleurs. */
  async function removeTrip(id) {
    if (!window.confirm('Supprimer ce trajet ?')) return;
    await store.deleteTrip(id);
    // Si le trajet supprime etait en cours d'edition, le formulaire n'a plus d'objet.
    if (editingId === id) reset();
    onSaved();
  }

  /* ---------------------------------------------------------------- */

  calcBtn.addEventListener('click', calculateDistance);
  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', reset);
  mapBtn.addEventListener('click', toggleMap);

  // Aller-retour : la distance aller est deja connue, un simple facteur suffit.
  // Aucun appel reseau, donc reponse immediate.
  fields.roundTrip.addEventListener('change', () => {
    if (lastOneWayKm === null) return;
    const km = fields.roundTrip.checked ? lastOneWayKm * 2 : lastOneWayKm;
    fields.km.value = formatDecimalInput(Math.round(km * 10) / 10, 1);
    const sens = fields.roundTrip.checked ? 'Aller-retour' : 'Aller simple';
    showStatus(`${sens} · ${itineraryLabel(fields.routePreference.value)} : ${formatKm(km)}`, 'good');
  });

  // Changement d'itineraire : la distance doit etre recalculee cote serveur.
  // On le declenche automatiquement, avec un delai qui evite d'enchainer les
  // requetes si l'utilisateur parcourt la liste (le serveur accepte 1 req/s).
  fields.routePreference.addEventListener('change', () => {
    lastGeometry = null;
    setHidden(mapBtn, true);
    hideMap();
    scheduleRecalculation();
  });

  function scheduleRecalculation() {
    if (recalcTimer !== null) clearTimeout(recalcTimer);

    // Rien à recalculer tant qu'aucun trajet n'a été résolu.
    if (!fields.from.value.trim() || !fields.to.value.trim()) return;
    if (lastOneWayKm === null) return;

    showStatus('Nouvel itinéraire : calcul en cours…');
    recalcTimer = setTimeout(() => {
      recalcTimer = null;
      calculateDistance();
    }, 400);
  }

  return { refresh, edit, duplicate, reset };
}
