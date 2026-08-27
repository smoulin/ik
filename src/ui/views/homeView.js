/**
 * Onglet « À valider » : traces enregistrées par le GPS, en attente de validation.
 *
 * Une trace est une mesure brute — distance réellement parcourue, horaires,
 * tracé — mais elle ne sait ni à quelle structure elle appartient, ni pourquoi
 * le trajet a été fait. Cet écran sert exactement à cela : compléter puis
 * valider, en deux gestes.
 *
 * L'affectation se fait par pastilles de structure plutôt que par une bascule
 * personnel/professionnel : plusieurs structures coexistent, chacune avec son
 * propre barème.
 */

import { byId, el, setHidden } from '../dom.js';
import { createRouteMap } from '../components/routeMap.js';
import { trackRepository } from '../../data/repositories/index.js';
import { createTrackImportService, trackToTripDraft } from '../../services/tracks/trackImportService.js';
import {
  isRecorderAvailable,
  collectSessions,
  recordingStatus,
  getVehicle,
  readiness,
} from '../../services/tracks/nativeRecorder.js';
import { openRecorderSetup } from '../components/recorderSetup.js';
import { favoritePlaceRepository } from '../../data/repositories/index.js';
import { computeTripAmounts } from '../../domain/mileage/engine.js';
import { toKilometers } from '../../domain/tracks/trackDistance.js';
import { formatKm, formatMoney } from '../../shared/format.js';

export function createHomeView({ store, geo = null, onChanged = () => {}, onEditDraft }) {
  const list = byId('tracksList');
  const statusEl = byId('trackStatus');
  const badge = byId('homeBadge');

  const importService = createTrackImportService({
    trackRepository,
    favoritePlaceRepository,
    geocodingService: geo?.geocodingService || null,
  });

  /** Cartes ouvertes, pour ne pas les refermer à chaque rafraîchissement. */
  const expanded = new Set();
  /** Une carte Leaflet par trace dépliée, créée seulement à l'ouverture. */
  const maps = new Map();

  let tracks = [];

  byId('importTrackInput').addEventListener('change', async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (files.length) await importFiles(files);
  });

  byId('autoRecordHelpBtn').addEventListener('click', () => {
    if (!isRecorderAvailable()) {
      showAutoRecordHelp();
      return;
    }
    openRecorderSetup({ onChanged: refresh }).catch((error) =>
      setStatus(`Configuration indisponible : ${error.message || error}`, 'bad'),
    );
  });

  // Le service enregistre pendant que l'application est fermee : c'est donc a
  // l'ouverture, et a chaque retour au premier plan, qu'on va chercher ce
  // qu'il a produit.
  if (isRecorderAvailable()) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') collectFromDevice();
    });
  }

  /** Recupere les trajets enregistres par le service natif. */
  async function collectFromDevice() {
    if (!isRecorderAvailable()) return;

    try {
      const summary = await collectSessions({
        importGpx: importService.importGpx,
        isDuplicate: importService.isDuplicate,
        // Reimporter la meme trace ne doit pas creer de doublon.
        discard: (track) => trackRepository.remove(track.id, { hard: true }),
      });

      await refresh();

      // L'ordre dit la gravité : un échec passager passe avant un compte-rendu.
      if (summary.problems.length) {
        setStatus(summary.problems.join(' · '), 'bad');
      } else if (summary.imported) {
        setStatus(`${summary.imported} trajet(s) enregistré(s) récupéré(s).`, 'good');
      } else if (summary.unusable) {
        // Ni une réussite ni une panne : un contact mis puis coupé sans rouler.
        setStatus(
          `${summary.unusable} enregistrement(s) sans déplacement, écarté(s).`,
          '',
        );
      }
    } catch (error) {
      setStatus(`Récupération impossible : ${error.message || error}`, 'bad');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Import                                                            */
  /* ---------------------------------------------------------------- */

  async function importFiles(files) {
    let imported = 0;
    const problems = [];

    for (const file of files) {
      try {
        const track = await importService.importGpx({ name: file.name, text: await file.text() });
        if (await importService.isDuplicate(track)) {
          // Réimporter le même fichier ne doit pas créer de doublon.
          await trackRepository.remove(track.id, { hard: true });
          problems.push(`${file.name} : trajet déjà importé.`);
        } else {
          imported += 1;
        }
      } catch (error) {
        problems.push(`${file.name} : ${error.message}`);
      }
    }

    await refresh();

    if (imported && !problems.length) {
      setStatus(`${imported} trajet(s) importé(s).`, 'good');
    } else if (problems.length) {
      setStatus(problems.join(' · '), imported ? '' : 'bad');
    }
  }

  /** Reçoit un fichier partagé depuis une autre application Android. */
  async function importSharedFile(file) {
    await importFiles([file]);
  }

  function setStatus(message, kind = '') {
    statusEl.textContent = message;
    statusEl.className = `status ${kind}`;
  }

  function showAutoRecordHelp() {
    window.alert(
      [
        'Enregistrement automatique des trajets',
        '',
        '1. Installer GPSLogger et MacroDroid (gratuits).',
        '2. MacroDroid : créer une macro « Périphérique Bluetooth connecté »',
        '   vers l’action « Envoyer un intent » :',
        '     Cible   : Broadcast',
        '     Action  : com.mendhak.gpslogger.TASKER_COMMAND',
        '     Paquet  : com.mendhak.gpslogger',
        '     Classe  : com.mendhak.gpslogger.TaskerReceiver',
        '     Extra   : immediatestart = true',
        '3. Une seconde macro sur « déconnecté », avec immediatestop.',
        '4. GPSLogger : format GPX, localisation « Toujours autoriser »,',
        '   et les deux applications en batterie « Sans restriction ».',
        '',
        'À l’arrivée, partager le fichier GPX vers Agilmea IK,',
        'ou l’importer ici avec le bouton « Importer un GPX ».',
      ].join('\n'),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Affichage                                                         */
  /* ---------------------------------------------------------------- */

  async function refresh() {
    tracks = (await trackRepository.list())
      .filter((track) => track.status === 'pending')
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

    // Les favoris ont pu changer depuis l'import : un domicile enregistré hier
    // doit nommer les trajets d'avant-hier. Comparaison locale, sans réseau.
    await importService.matchFavorites(tracks).catch(() => {});

    await refreshRecorderState();

    badge.textContent = String(tracks.length);
    setHidden(badge, tracks.length === 0);

    render();
    nameAnonymousEndpoints();
  }

  /**
   * Donne une adresse aux extrémités qu'aucun lieu favori n'a nommées.
   *
   * En tâche de fond, après l'affichage : la liste doit apparaître tout de
   * suite, même sans réseau. Une extrémité déjà nommée — ou dont le nommage a
   * déjà échoué — n'est pas redemandée, donc cette passe ne coûte rien une fois
   * les trajets connus.
   */
  function nameAnonymousEndpoints() {
    const anonymous = tracks.filter(
      (track) => needsName(track.start) || needsName(track.end),
    );
    if (!anonymous.length) return;

    importService
      .nameEndpoints(anonymous)
      .then((named) => {
        // `nameEndpoints` met à jour les traces déjà en mémoire : un simple
        // réaffichage suffit, sans relire la base.
        if (named) render();
      })
      .catch(() => {});
  }

  function needsName(endpoint) {
    return Boolean(endpoint) && !endpoint.label && !endpoint.labelSource;
  }

  /**
   * Etat de l'enregistrement automatique.
   *
   * Dans le navigateur, la chaine passe encore par un fichier GPX importe a la
   * main. Dans la coque Android, l'application sait si un trajet est en cours
   * et quel vehicule le declenche : autant le dire, c'est ce qui rassure sur le
   * fait que rien n'est en train de se perdre.
   */
  async function refreshRecorderState() {
    const label = byId('autoRecordState');

    if (!isRecorderAvailable()) {
      label.textContent = tracks.length
        ? `${tracks.length} trajet(s) enregistré(s) en attente`
        : 'Aucun trajet en attente. Importe un fichier GPX ou partage-le depuis GPSLogger.';
      return;
    }

    try {
      const [status, vehicle, state] = await Promise.all([
        recordingStatus(),
        getVehicle(),
        readiness(),
      ]);

      if (status.recording) {
        label.textContent = `Enregistrement en cours · ${formatKm(status.kilometers)}`;
        return;
      }

      // Un prerequis manquant ne se voit nulle part ailleurs : sans lui, le
      // trajet ne sera tout simplement jamais enregistre, et l'absence ne
      // s'explique pas d'elle-meme.
      const missing = [
        !vehicle?.name ? 'aucun véhicule choisi' : null,
        !state.location ? 'position refusée' : null,
        !state.backgroundLocation ? 'position en arrière-plan refusée' : null,
        !state.batteryUnrestricted ? 'batterie restreinte' : null,
      ].filter(Boolean);

      label.textContent = missing.length
        ? `Inactif — ${missing.join(', ')}. Appuie sur « Configurer ».`
        : `Prêt — démarre à la connexion de ${vehicle.name}.`;
    } catch {
      label.textContent = 'Enregistrement automatique indisponible.';
    }
  }

  function render() {
    list.replaceChildren();
    maps.clear();

    if (!tracks.length) {
      list.append(
        el('p', {
          class: 'hint',
          text: 'Les trajets enregistrés par le GPS apparaîtront ici, prêts à être complétés et validés.',
        }),
      );
      return;
    }

    for (const track of tracks) list.append(renderTrack(track));
  }

  function renderTrack(track) {
    const km = toKilometers(track.distanceMeters);
    const isOpen = expanded.has(track.id);

    const summary = el(
      'button',
      {
        class: 'trip-summary',
        type: 'button',
        onClick: () => toggle(track.id),
      },
      [
        el('div', { class: 'trip-endpoints' }, [
          el('div', { class: 'meta', text: formatPeriod(track) }),
          endpointLine('A', track.start, track.startedAt),
          endpointLine('B', track.end, track.endedAt),
        ]),
        el('div', { class: 'trip-figures' }, [
          el('div', { class: 'km', text: formatKm(km) }),
          el('div', { class: 'meta', text: isOpen ? 'Replier' : 'Compléter' }),
        ]),
      ],
    );

    const card = el('div', { class: 'trip-card' }, [summary]);
    if (isOpen) card.append(renderDetails(track, km));
    return card;
  }

  function endpointLine(letter, endpoint, isoTime) {
    const time = isoTime ? new Date(isoTime) : null;
    const heure = time && !Number.isNaN(time.getTime())
      ? time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';
    return el('div', { class: 'trip-endpoint' }, [
      el('span', { class: 'dot', text: letter }),
      // Le lieu, lui, est parfaitement connu : ce sont ses coordonnées. C'est
      // son adresse qui manque — soit elle est en cours de résolution, soit
      // aucun fournisseur ne sait la nommer.
      el('span', { text: endpoint?.label || endpointFallback(endpoint) }),
      heure ? el('span', { class: 'meta', text: heure }) : null,
    ]);
  }

  function endpointFallback(endpoint) {
    if (!endpoint) return 'Point inconnu';
    return endpoint.labelSource === 'none' ? 'Adresse non trouvée' : 'Recherche de l’adresse…';
  }

  function formatPeriod(track) {
    const date = track.startedAt ? new Date(track.startedAt) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /** Détail déplié : structure, carte, qualité de la trace, actions. */
  function renderDetails(track, km) {
    let selectedCompanyId = store.state.companies[0]?.id || '';

    const chips = el(
      'div',
      { class: 'company-chips' },
      store.state.companies.map((company) =>
        el('button', {
          type: 'button',
          class: `company-chip${company.id === selectedCompanyId ? ' selected' : ''}`,
          text: company.name,
          onClick: (event) => {
            selectedCompanyId = company.id;
            [...chips.children].forEach((chip) => chip.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
            updateEstimate();
          },
        }),
      ),
    );

    const estimate = el('div', { class: 'meta strong' });
    const mapNode = el('div', { class: 'route-map' });

    function updateEstimate() {
      estimate.textContent = `${formatKm(km)} · ${formatMoney(estimateAmount(km, selectedCompanyId))}`;
    }
    updateEstimate();

    const details = el('div', { class: 'trip-details' }, [
      store.state.companies.length
        ? chips
        : el('p', { class: 'status bad', text: 'Ajoute d’abord une structure dans Réglages.' }),
      estimate,
      mapNode,
      el('div', { class: 'track-quality', text: qualityLabel(track) }),
      // L'action principale occupe toute la largeur ; les deux autres se
      // partagent la suivante en parts égales. Sur un écran de téléphone, les
      // trois côte à côte se repliaient au hasard des libellés.
      el('button', {
        class: 'primary wide',
        text: 'Valider ce trajet',
        onClick: () => convert(track, selectedCompanyId),
      }),
      el('div', { class: 'button-row equal' }, [
        el('button', { text: 'Compléter', onClick: () => editDraft(track, selectedCompanyId) }),
        el('button', { class: 'danger', text: 'Ignorer', onClick: () => ignore(track) }),
      ]),
    ]);

    // La carte n'est chargée qu'ici : elle n'existe que pour la trace ouverte.
    if (track.geometry?.length > 1) {
      const map = createRouteMap(mapNode);
      maps.set(track.id, map);
      map
        .show(track.geometry, { from: track.start?.label, to: track.end?.label })
        .catch(() => setHidden(mapNode, true));
    } else {
      setHidden(mapNode, true);
    }

    return details;
  }

  function estimateAmount(km, companyId) {
    const company = store.getCompany(companyId);
    if (!company) return 0;

    // Le montant dépend du cumul annuel : on simule l'ajout du trajet à
    // l'ensemble existant plutôt que de l'isoler.
    const simulated = {
      id: '__simulation__',
      date: new Date().toISOString().slice(0, 10),
      companyId,
      vehicleId: store.state.vehicles[0]?.id || '',
      km,
      createdAt: new Date().toISOString(),
    };
    const amounts = computeTripAmounts([...store.state.trips, simulated], {
      companies: store.state.companies,
      vehicles: store.state.vehicles,
    });
    return amounts.get('__simulation__')?.amount || 0;
  }

  function qualityLabel(track) {
    const q = track.quality || {};
    const parts = [`${q.usedCount || 0} points retenus`];
    const dropped =
      (q.droppedForAccuracy || 0) + (q.droppedForNoise || 0) + (q.droppedForSpeed || 0);
    if (dropped) parts.push(`${dropped} écartés (bruit GPS)`);
    if (track.rawDistanceMeters > track.distanceMeters) {
      parts.push(`brut ${toKilometers(track.rawDistanceMeters)} km`);
    }
    return parts.join(' · ');
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  function toggle(id) {
    if (expanded.has(id)) {
      maps.get(id)?.destroy();
      expanded.delete(id);
    } else {
      expanded.add(id);
    }
    render();
  }

  async function convert(track, companyId) {
    if (!companyId) {
      window.alert('Choisis une structure.');
      return;
    }
    const vehicleId = store.state.vehicles[0]?.id;
    if (!vehicleId) {
      window.alert('Ajoute d’abord un véhicule dans Réglages.');
      return;
    }

    const draft = trackToTripDraft(track);
    await store.saveTrip({ ...draft, companyId, vehicleId, purpose: '' });
    await trackRepository.save({ ...track, status: 'converted' });

    expanded.delete(track.id);
    await refresh();
    onChanged();
    setStatus('Trajet validé et ajouté à l’historique.', 'good');
  }

  /** Ouvre le formulaire complet, pour préciser motif, véhicule ou distance. */
  function editDraft(track, companyId) {
    onEditDraft?.({ ...trackToTripDraft(track), companyId });
  }

  async function ignore(track) {
    if (!window.confirm('Ignorer ce trajet enregistré ?')) return;
    await trackRepository.save({ ...track, status: 'ignored' });
    expanded.delete(track.id);
    await refresh();
    setStatus('Trajet ignoré.', '');
  }

  return { refresh, importSharedFile, collectFromDevice };
}
