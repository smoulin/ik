/**
 * Onglet « Réglages » : bénéficiaire, structures, véhicules, lieux favoris,
 * sauvegarde/restauration et informations sur la version.
 */

import { byId, el, delegate, setHidden, downloadBlob } from '../dom.js';
import { attachAddressAutocomplete } from '../components/addressAutocomplete.js';
import { suggestionToAddress } from '../../services/geo/types.js';
import { calculationModeName } from '../../domain/mileage/engine.js';
import { formatAddressOneLine, isAddressEmpty, composeAddressLabel } from '../../domain/models.js';
import { parseDecimal, formatDecimalInput } from '../../shared/format.js';
import { mountScaleEditor, defaultCustomScale } from '../components/scaleEditor.js';
import { buildBackup, restoreBackup, inspectBackup } from '../../services/backup/backupService.js';
import { GEO_ATTRIBUTIONS } from '../../services/geo/index.js';
import { nativeBuild } from '../../services/tracks/nativeRecorder.js';

export function createSettingsView({ store, geo, appVersion, onChanged = () => {} }) {
  /* ================================================================ */
  /* Bénéficiaire                                                      */
  /* ================================================================ */

  const beneficiaryFields = {
    firstName: byId('beneficiaryFirstName'),
    lastName: byId('beneficiaryLastName'),
    address: byId('beneficiaryAddress'),
    address2: byId('beneficiaryAddress2'),
    postalCode: byId('beneficiaryPostalCode'),
    city: byId('beneficiaryCity'),
  };
  const beneficiaryStatus = byId('beneficiaryStatus');

  attachAddressAutocomplete(beneficiaryFields.address, {
    service: geo.addressSearchService,
    onSelect: (suggestion) => {
      // On ne garde que la voie dans le champ adresse ; CP et ville ont le leur.
      beneficiaryFields.address.value = suggestion.label;
      if (suggestion.postalCode) beneficiaryFields.postalCode.value = suggestion.postalCode;
      if (suggestion.city) beneficiaryFields.city.value = suggestion.city;
    },
  });

  byId('saveBeneficiaryBtn').addEventListener('click', async () => {
    try {
      await store.saveBeneficiary({
        id: store.state.beneficiary?.id,
        firstName: beneficiaryFields.firstName.value,
        lastName: beneficiaryFields.lastName.value,
        address: {
          label: composeAddressLabel({
            line1: beneficiaryFields.address.value,
            postalCode: beneficiaryFields.postalCode.value,
            city: beneficiaryFields.city.value,
          }),
          line1: beneficiaryFields.address.value,
          line2: beneficiaryFields.address2.value,
          postalCode: beneficiaryFields.postalCode.value,
          city: beneficiaryFields.city.value,
          country: 'FR',
        },
      });
      setStatus(beneficiaryStatus, 'Bénéficiaire enregistré.', 'good');
      onChanged();
    } catch (error) {
      setStatus(beneficiaryStatus, `Enregistrement impossible : ${error.message}`, 'bad');
    }
  });

  function refreshBeneficiary() {
    const beneficiary = store.state.beneficiary;
    beneficiaryFields.firstName.value = beneficiary?.firstName || '';
    beneficiaryFields.lastName.value = beneficiary?.lastName || '';
    beneficiaryFields.address.value = beneficiary?.address?.line1 || '';
    beneficiaryFields.address2.value = beneficiary?.address?.line2 || '';
    beneficiaryFields.postalCode.value = beneficiary?.address?.postalCode || '';
    beneficiaryFields.city.value = beneficiary?.address?.city || '';
  }

  /* ================================================================ */
  /* Structures                                                        */
  /* ================================================================ */

  const companyDialog = byId('companyDialog');
  const companyFields = {
    id: byId('companyId'),
    name: byId('companyName'),
    legalName: byId('companyLegalName'),
    type: byId('companyType'),
    siret: byId('companySiret'),
    address: byId('companyAddress'),
    postalCode: byId('companyPostalCode'),
    city: byId('companyCity'),
    scheme: byId('companyScheme'),
    fixedRate: byId('companyFixedRate'),
  };

  /** Coordonnées de l'adresse choisie : conservées pour un usage futur. */
  let companyAddressCoords = null;

  attachAddressAutocomplete(companyFields.address, {
    service: geo.addressSearchService,
    onSelect: (suggestion) => {
      companyFields.address.value = suggestion.label;
      if (suggestion.postalCode) companyFields.postalCode.value = suggestion.postalCode;
      if (suggestion.city) companyFields.city.value = suggestion.city;
      companyAddressCoords = suggestionToAddress(suggestion);
    },
    onInput: () => {
      companyAddressCoords = null;
    },
  });

  const scaleEditor = mountScaleEditor();

  companyFields.scheme.addEventListener('change', toggleFixedRate);

  function toggleFixedRate() {
    const mode = companyFields.scheme.value;
    setHidden(byId('fixedRateWrap'), mode !== 'fixed');
    setHidden(byId('customScaleWrap'), mode !== 'custom');
  }

  function openCompanyDialog(id = null) {
    const company = id ? store.getCompany(id) : null;
    byId('companyDialogTitle').textContent = company ? 'Modifier la structure' : 'Ajouter une structure';

    companyFields.id.value = company?.id || '';
    companyFields.name.value = company?.name || '';
    companyFields.legalName.value = company?.legalName || '';
    companyFields.type.value = company?.type || '';
    companyFields.siret.value = company?.siret || '';
    companyFields.address.value = company?.address?.line1 || company?.address?.label || '';
    companyFields.postalCode.value = company?.address?.postalCode || '';
    companyFields.city.value = company?.address?.city || '';
    companyFields.scheme.value = company?.calculationMode || 'ik2026';
    companyFields.fixedRate.value = formatDecimalInput(company?.calculationSettings?.fixedRate);
    scaleEditor.setScale(company?.calculationSettings?.customScale || defaultCustomScale());
    companyAddressCoords = company?.address?.latitude
      ? { latitude: company.address.latitude, longitude: company.address.longitude }
      : null;

    toggleFixedRate();
    companyDialog.showModal();
  }

  // « Annuler » ferme la boite, sans rien valider. En bouton de soumission (le
  // defaut d'un <button> dans un <form>), il declenchait la validation HTML des
  // champs requis : « Veuillez renseigner ce champ » alors que l'utilisateur
  // renonce justement a saisir. D'ou type="button" et fermeture explicite.
  byId('cancelCompanyDialogBtn').addEventListener('click', () => companyDialog.close());

  byId('saveCompanyDialogBtn').addEventListener('click', async (event) => {
    event.preventDefault();

    const name = companyFields.name.value.trim();
    if (!name) {
      window.alert('Indique un nom.');
      return;
    }
    // Le taux se saisit « 0,139 » : la virgule doit etre acceptee (voir parseDecimal).
    const parsedRate = parseDecimal(companyFields.fixedRate.value);
    const isFixed = companyFields.scheme.value === 'fixed';

    if (isFixed && parsedRate === null) {
      window.alert('Indique le taux en euros par kilomètre (ex. 0,139).');
      companyFields.fixedRate.focus();
      return;
    }
    if (isFixed && parsedRate <= 0) {
      window.alert('Le taux doit être supérieur à 0.');
      companyFields.fixedRate.focus();
      return;
    }
    const fixedRate = parsedRate ?? 0;

    // Bareme a tranches : on refuse un bareme incoherent plutot que de produire
    // des montants imprevisibles.
    const isCustom = companyFields.scheme.value === 'custom';
    if (isCustom) {
      const problems = scaleEditor.validate();
      if (problems.length) {
        window.alert(problems.join('\n'));
        return;
      }
    }

    await store.saveCompany({
      id: companyFields.id.value || undefined,
      name,
      legalName: companyFields.legalName.value,
      type: companyFields.type.value,
      siret: companyFields.siret.value,
      address: {
        label: composeAddressLabel({
          line1: companyFields.address.value,
          postalCode: companyFields.postalCode.value,
          city: companyFields.city.value,
        }),
        line1: companyFields.address.value,
        postalCode: companyFields.postalCode.value,
        city: companyFields.city.value,
        country: 'FR',
        latitude: companyAddressCoords?.latitude ?? null,
        longitude: companyAddressCoords?.longitude ?? null,
      },
      calculationMode: companyFields.scheme.value,
      calculationSettings: {
        fixedRate,
        // Hors mode « barème personnalisé », on conserve le barème déjà saisi :
        // basculer temporairement de mode ne doit pas le faire perdre.
        customScale: isCustom
          ? scaleEditor.getScale()
          : (store.getCompany(companyFields.id.value)?.calculationSettings?.customScale ?? null),
      },
    });

    companyDialog.close();
    onChanged();
  });

  function refreshCompanies() {
    const container = byId('companiesList');
    container.replaceChildren();

    if (!store.state.companies.length) {
      container.append(el('p', { class: 'hint', text: 'Aucune structure.' }));
      return;
    }

    for (const company of store.state.companies) {
      const meta = [
        calculationModeName(company),
        isAddressEmpty(company.address) ? null : formatAddressOneLine(company.address),
        company.siret ? `SIRET ${company.siret}` : null,
      ].filter(Boolean);

      container.append(
        settingsItem({
          title: company.name,
          metaLines: meta,
          id: company.id,
          kind: 'company',
        }),
      );
    }
  }

  /* ================================================================ */
  /* Véhicules                                                         */
  /* ================================================================ */

  const vehicleDialog = byId('vehicleDialog');
  const vehicleFields = {
    id: byId('vehicleId'),
    name: byId('vehicleName'),
    cv: byId('vehicleCv'),
    electric: byId('vehicleElectric'),
    fuel: byId('vehicleFuel'),
  };

  function openVehicleDialog(id = null) {
    const vehicle = id ? store.getVehicle(id) : null;
    byId('vehicleDialogTitle').textContent = vehicle ? 'Modifier le véhicule' : 'Ajouter un véhicule';
    vehicleFields.id.value = vehicle?.id || '';
    vehicleFields.name.value = vehicle?.name || '';
    vehicleFields.cv.value = vehicle?.cv || '';
    vehicleFields.electric.value = String(Boolean(vehicle?.electric));
    vehicleFields.fuel.value = vehicle?.fuel || 'petrol';
    vehicleDialog.showModal();
  }

  byId('cancelVehicleDialogBtn').addEventListener('click', () => vehicleDialog.close());

  byId('saveVehicleDialogBtn').addEventListener('click', async (event) => {
    event.preventDefault();
    const name = vehicleFields.name.value.trim();
    const cv = Number(vehicleFields.cv.value);
    if (!name || !(cv >= 1)) {
      window.alert('Indique le nom et la puissance fiscale.');
      return;
    }
    await store.saveVehicle({
      id: vehicleFields.id.value || undefined,
      name,
      cv,
      electric: vehicleFields.electric.value === 'true',
      fuel: vehicleFields.fuel.value,
    });
    vehicleDialog.close();
    onChanged();
  });

  function refreshVehicles() {
    const container = byId('vehiclesList');
    container.replaceChildren();

    if (!store.state.vehicles.length) {
      container.append(el('p', { class: 'hint', text: 'Aucun véhicule.' }));
      return;
    }

    for (const vehicle of store.state.vehicles) {
      const fuelLabel =
        vehicle.fuel === 'petrol' ? 'essence' : vehicle.fuel === 'diesel' ? 'gazole' : 'GPL';
      container.append(
        settingsItem({
          title: vehicle.name,
          metaLines: [
            `${vehicle.cv} CV · ${vehicle.electric ? '100 % électrique' : 'thermique / hybride'}`,
            `carburant BIC : ${fuelLabel}`,
          ],
          id: vehicle.id,
          kind: 'vehicle',
        }),
      );
    }
  }

  /* ================================================================ */
  /* Lieux favoris                                                     */
  /* ================================================================ */

  const placeDialog = byId('placeDialog');
  const placeFields = {
    id: byId('placeId'),
    name: byId('placeName'),
    address: byId('placeAddress'),
    postalCode: byId('placePostalCode'),
    city: byId('placeCity'),
    latitude: byId('placeLatitude'),
    longitude: byId('placeLongitude'),
  };

  attachAddressAutocomplete(placeFields.address, {
    service: geo.addressSearchService,
    onSelect: (suggestion) => {
      placeFields.address.value = suggestion.label;
      if (suggestion.postalCode) placeFields.postalCode.value = suggestion.postalCode;
      if (suggestion.city) placeFields.city.value = suggestion.city;
      // Coordonnées mémorisées : la même recherche ne sera plus jamais refaite (§34).
      if (Number.isFinite(suggestion.latitude)) {
        placeFields.latitude.value = formatDecimalInput(suggestion.latitude);
        placeFields.longitude.value = formatDecimalInput(suggestion.longitude);
      }
    },
    onInput: () => {
      placeFields.latitude.value = '';
      placeFields.longitude.value = '';
    },
  });

  function openPlaceDialog(id = null) {
    const place = id ? store.getFavoritePlace(id) : null;
    byId('placeDialogTitle').textContent = place ? 'Modifier le lieu' : 'Ajouter un lieu favori';
    placeFields.id.value = place?.id || '';
    placeFields.name.value = place?.name || '';
    placeFields.address.value = place?.address?.line1 || place?.address?.label || '';
    placeFields.postalCode.value = place?.address?.postalCode || '';
    placeFields.city.value = place?.address?.city || '';
    placeFields.latitude.value = formatDecimalInput(place?.latitude);
    placeFields.longitude.value = formatDecimalInput(place?.longitude);
    placeDialog.showModal();
  }

  byId('cancelPlaceDialogBtn').addEventListener('click', () => placeDialog.close());

  byId('savePlaceDialogBtn').addEventListener('click', async (event) => {
    event.preventDefault();

    const name = placeFields.name.value.trim();
    if (!name) {
      window.alert('Indique un nom de lieu.');
      return;
    }

    const label = composeAddressLabel({
      line1: placeFields.address.value,
      postalCode: placeFields.postalCode.value,
      city: placeFields.city.value,
    });

    await store.saveFavoritePlace({
      id: placeFields.id.value || undefined,
      name,
      address: {
        label,
        line1: placeFields.address.value,
        postalCode: placeFields.postalCode.value,
        city: placeFields.city.value,
        country: 'FR',
      },
      latitude: parseDecimal(placeFields.latitude.value),
      longitude: parseDecimal(placeFields.longitude.value),
    });

    placeDialog.close();
    onChanged();
  });

  function refreshPlaces() {
    const container = byId('placesList');
    container.replaceChildren();

    if (!store.state.favoritePlaces.length) {
      container.append(
        el('p', {
          class: 'hint',
          text: 'Aucun lieu favori. Ajoute « Domicile » et « Bureau » : la saisie des trajets ira beaucoup plus vite.',
        }),
      );
      return;
    }

    for (const place of store.state.favoritePlaces) {
      const metaLines = [formatAddressOneLine(place.address) || 'Adresse non renseignée'];
      if (Number.isFinite(place.latitude)) {
        metaLines.push(`coordonnées enregistrées (${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)})`);
      }
      container.append(
        settingsItem({
          title: `★ ${place.name}`,
          metaLines,
          id: place.id,
          kind: 'place',
        }),
      );
    }
  }

  /* ================================================================ */
  /* Sauvegarde / restauration                                         */
  /* ================================================================ */

  const backupStatus = byId('backupStatus');

  byId('exportBackupBtn').addEventListener('click', async () => {
    const backup = await buildBackup({ appVersion });
    downloadBlob(
      JSON.stringify(backup, null, 2),
      'application/json',
      `agilmea-ik-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
    );
    setStatus(backupStatus, 'Sauvegarde exportée.', 'good');
  });

  byId('importBackupInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const inspection = inspectBackup(data);
      if (!inspection.valid) throw new Error(inspection.reason);

      const summary = [
        `${inspection.counts.companies} structure(s)`,
        `${inspection.counts.vehicles} véhicule(s)`,
        `${inspection.counts.trips} trajet(s)`,
        // Absent des fichiers antérieurs à leur prise en charge : ne rien dire
        // vaut mieux qu'annoncer « 0 trajet à valider » sans le savoir.
        inspection.counts.tracks === null
          ? null
          : `${inspection.counts.tracks} trajet(s) à valider`,
      ]
        .filter(Boolean)
        .join(', ');
      const message = inspection.legacy
        ? `Sauvegarde au format v0.1.1 détectée (${summary}). Elle sera convertie. Remplacer toutes les données actuelles ?`
        : `Sauvegarde détectée (${summary}). Remplacer toutes les données actuelles ?`;

      if (!window.confirm(message)) return;

      await restoreBackup(data);
      await store.load();
      setStatus(backupStatus, 'Sauvegarde importée.', 'good');
      onChanged();
    } catch (error) {
      setStatus(backupStatus, `Import impossible : ${error.message}`, 'bad');
    }
  });

  /* ================================================================ */
  /* À propos                                                          */
  /* ================================================================ */

  function refreshAbout() {
    byId('aboutVersion').textContent = `Agilmea IK v${appVersion}`;

    // Dans la coque Android, on ajoute la version du paquet : c'est la seule
    // qui distingue deux APK une fois installes.
    nativeBuild()
      .then((build) => {
        if (!build) return;
        byId('aboutVersion').textContent =
          `Agilmea IK v${appVersion} · coque ${build.versionName} (${build.versionCode})`;
      })
      .catch(() => {});

    byId('aboutStorage').textContent =
      'Données enregistrées uniquement sur cet appareil (IndexedDB). Aucune donnée n’est envoyée à un serveur, hormis les adresses recherchées, transmises au service de recherche d’adresses.';
    byId('aboutAttributions').textContent = GEO_ATTRIBUTIONS.join(' · ');
  }

  /* ================================================================ */
  /* Actions communes                                                  */
  /* ================================================================ */

  function settingsItem({ title, metaLines, id, kind }) {
    return el('div', { class: 'settings-item' }, [
      el(
        'div',
        { class: 'settings-item-main' },
        [
          el('strong', { text: title }),
          ...metaLines.map((line) => el('div', { class: 'meta', text: line })),
        ].filter(Boolean),
      ),
      el('div', { class: 'item-actions' }, [
        el('button', { text: 'Modifier', dataset: { action: `edit-${kind}`, id } }),
        el('button', { class: 'danger', text: 'Suppr.', dataset: { action: `delete-${kind}`, id } }),
      ]),
    ]);
  }

  byId('addCompanyBtn').addEventListener('click', () => openCompanyDialog());
  byId('addVehicleBtn').addEventListener('click', () => openVehicleDialog());
  byId('addPlaceBtn').addEventListener('click', () => openPlaceDialog());

  delegate(byId('tab-settings'), 'click', '[data-action]', async (event, button) => {
    const { action, id } = button.dataset;

    if (action === 'edit-company') openCompanyDialog(id);
    if (action === 'edit-vehicle') openVehicleDialog(id);
    if (action === 'edit-place') openPlaceDialog(id);

    if (action === 'delete-company') await removeCompany(id);
    if (action === 'delete-vehicle') await removeVehicle(id);
    if (action === 'delete-place') await removePlace(id);
  });

  async function removeCompany(id) {
    const usage = store.companyUsage(id);
    if (usage > 0) {
      window.alert(
        `Impossible : ${usage} trajet(s) utilisent cette structure. Supprime ou réaffecte d’abord ces trajets.`,
      );
      return;
    }
    if (!window.confirm('Supprimer cette structure ?')) return;
    await store.deleteCompany(id);
    onChanged();
  }

  async function removeVehicle(id) {
    const usage = store.vehicleUsage(id);
    if (usage > 0) {
      window.alert(
        `Impossible : ${usage} trajet(s) utilisent ce véhicule. Supprime ou réaffecte d’abord ces trajets.`,
      );
      return;
    }
    if (!window.confirm('Supprimer ce véhicule ?')) return;
    await store.deleteVehicle(id);
    onChanged();
  }

  async function removePlace(id) {
    if (!window.confirm('Supprimer ce lieu favori ?')) return;
    await store.deleteFavoritePlace(id);
    onChanged();
  }

  function setStatus(node, message, kind = '') {
    node.textContent = message;
    node.className = `status ${kind}`;
    if (message) setTimeout(() => {
      node.textContent = '';
      node.className = 'status';
    }, 4000);
  }

  function refresh() {
    refreshBeneficiary();
    refreshCompanies();
    refreshVehicles();
    refreshPlaces();
    refreshAbout();
  }

  return { refresh };
}
