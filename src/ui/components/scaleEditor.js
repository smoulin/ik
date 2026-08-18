/**
 * Editeur de bareme personnalise.
 *
 * Une ligne par tranche : borne haute, taux au kilometre, forfait facultatif.
 * La derniere ligne represente « au-dela » et n'a pas de borne — c'est elle qui
 * garantit que toute distance est couverte.
 *
 * Le composant ne connait ni le stockage ni le moteur de calcul : il produit et
 * consomme la structure decrite dans domain/mileage/customScale.js.
 */

import { el, byId } from '../dom.js';
import { parseDecimal, formatDecimalInput } from '../../shared/format.js';
import {
  normalizeCustomScale,
  validateCustomScale,
  describeCustomScale,
} from '../../domain/mileage/customScale.js';

export function createScaleEditor({ container, previewNode, addButton, labelInput }) {
  /** Etat de travail : tableau de tranches en cours d'edition. */
  let brackets = [];

  function setScale(scale) {
    const normalized = normalizeCustomScale(scale);
    labelInput.value = normalized.label === 'Barème personnalisé' ? '' : normalized.label;
    brackets = normalized.brackets.map((b) => ({ ...b }));
    render();
  }

  /** Lit l'etat courant sous la forme attendue par le moteur de calcul. */
  function getScale() {
    return {
      label: labelInput.value.trim(),
      brackets: brackets.map((b) => ({ ...b })),
    };
  }

  function validate() {
    return validateCustomScale(getScale());
  }

  function addBracket() {
    // La nouvelle tranche s'insere avant « au-dela », qui reste toujours en dernier.
    const last = brackets[brackets.length - 1];
    const suggested = lastBoundedLimit() ? lastBoundedLimit() * 2 : 5000;

    if (last && last.upToKm === null) {
      brackets.splice(brackets.length - 1, 0, { upToKm: suggested, rate: last.rate, flatBonus: 0 });
    } else {
      brackets.push({ upToKm: suggested, rate: 0, flatBonus: 0 });
    }
    render();
  }

  function lastBoundedLimit() {
    const bounded = brackets.filter((b) => b.upToKm !== null);
    return bounded.length ? bounded[bounded.length - 1].upToKm : 0;
  }

  function removeBracket(index) {
    brackets.splice(index, 1);
    if (!brackets.length) brackets.push({ upToKm: null, rate: 0, flatBonus: 0 });
    render();
  }

  function render() {
    container.replaceChildren();

    brackets.forEach((bracket, index) => {
      const isOpen = bracket.upToKm === null;

      const limitField = isOpen
        ? el('div', { class: 'scale-open', text: 'Au-delà' })
        : el('input', {
            type: 'text',
            inputmode: 'numeric',
            value: bracket.upToKm === null ? '' : String(bracket.upToKm),
            placeholder: '5 000',
            'aria-label': 'Jusqu’à combien de kilomètres',
            onInput: (event) => {
              bracket.upToKm = parseDecimal(event.target.value);
              updatePreview();
            },
          });

      const rateField = el('input', {
        type: 'text',
        inputmode: 'decimal',
        value: formatDecimalInput(bracket.rate),
        placeholder: '0,529',
        'aria-label': 'Taux en euros par kilomètre',
        onInput: (event) => {
          bracket.rate = parseDecimal(event.target.value) ?? 0;
          updatePreview();
        },
      });

      const bonusField = el('input', {
        type: 'text',
        inputmode: 'decimal',
        value: bracket.flatBonus ? formatDecimalInput(bracket.flatBonus) : '',
        placeholder: '0',
        'aria-label': 'Forfait ajouté, en euros',
        onInput: (event) => {
          bracket.flatBonus = parseDecimal(event.target.value) ?? 0;
          updatePreview();
        },
      });

      container.append(
        el('div', { class: 'scale-row' }, [
          el('div', { class: 'scale-cell' }, [
            el('span', { class: 'scale-caption', text: 'Jusqu’à (km)' }),
            limitField,
          ]),
          el('div', { class: 'scale-cell' }, [
            el('span', { class: 'scale-caption', text: '€ / km' }),
            rateField,
          ]),
          el('div', { class: 'scale-cell' }, [
            el('span', { class: 'scale-caption', text: '+ forfait €' }),
            bonusField,
          ]),
          el('button', {
            type: 'button',
            class: 'danger scale-remove',
            text: '✕',
            'aria-label': 'Supprimer cette tranche',
            onClick: () => removeBracket(index),
          }),
        ]),
      );
    });

    updatePreview();
  }

  /** Retour immediat : l'utilisateur voit l'effet de sa saisie sans enregistrer. */
  function updatePreview() {
    if (!previewNode) return;
    const problems = validate();
    if (problems.length) {
      previewNode.textContent = problems[0];
      previewNode.className = 'status bad';
      return;
    }
    previewNode.textContent = describeCustomScale(getScale());
    previewNode.className = 'hint';
  }

  addButton.addEventListener('click', (event) => {
    event.preventDefault();
    addBracket();
  });
  labelInput.addEventListener('input', updatePreview);

  return { setScale, getScale, validate };
}

/** Barème de départ proposé : la forme du barème officiel, à ajuster. */
export function defaultCustomScale() {
  return {
    label: '',
    brackets: [
      { upToKm: 5000, rate: 0.529, flatBonus: 0 },
      { upToKm: 20000, rate: 0.316, flatBonus: 1065 },
      { upToKm: null, rate: 0.37, flatBonus: 0 },
    ],
  };
}

/** Raccourci utilise par la vue Reglages. */
export function mountScaleEditor() {
  return createScaleEditor({
    container: byId('scaleBrackets'),
    previewNode: byId('scalePreview'),
    addButton: byId('addBracketBtn'),
    labelInput: byId('customScaleLabel'),
  });
}
