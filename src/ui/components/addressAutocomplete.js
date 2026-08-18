/**
 * Champ d'adresse avec autocompletion.
 *
 * Contraintes d'ergonomie du cahier des charges (§ « Exigences d'ergonomie ») :
 *  - pense pour le smartphone : cibles tactiles hautes, liste courte, lisible ;
 *  - anti-rebond et annulation de la requete precedente (geres par le controleur) ;
 *  - favoris visuellement distincts et toujours en tete ;
 *  - degradation silencieuse hors ligne : les favoris et les adresses recentes
 *    restent proposes meme sans reseau.
 *
 * Le composant ne connait aucun fournisseur : il recoit un service de recherche.
 */

import { el } from '../dom.js';
import { createSearchController } from '../../services/geo/addressSearchService.js';

const SOURCE_ICONS = {
  favorite: '★', // etoile pleine
  recent: '↺', // fleche circulaire
  provider: '⌕', // loupe
};

/**
 * @param {HTMLInputElement} input
 * @param {object} options
 * @param {{search: Function}} options.service
 * @param {(suggestion: object) => void} [options.onSelect]
 * @param {() => void} [options.onInput]  appele des que l'utilisateur modifie le texte
 */
export function attachAddressAutocomplete(input, { service, onSelect = () => {}, onInput = () => {} }) {
  if (!input) return { destroy() {}, setValue() {} };

  const wrapper = el('div', { class: 'autocomplete' });
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);

  const panel = el('div', { class: 'autocomplete-panel hidden', role: 'listbox' });
  wrapper.append(panel);

  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');

  let suggestions = [];
  let activeIndex = -1;
  let open = false;

  const controller = createSearchController({
    service,
    limit: 6,
    minChars: 1,
    onResults: (results) => render(results),
    onError: () => {
      /* Panne reseau : on garde ce qu'on a, sans message bloquant. */
    },
  });

  function render(results) {
    suggestions = results;
    activeIndex = -1;
    panel.replaceChildren();

    if (!results.length) {
      close();
      return;
    }

    results.forEach((suggestion, index) => {
      const option = el(
        'div',
        {
          class: `autocomplete-option source-${suggestion.source}`,
          role: 'option',
          id: `ac-option-${index}`,
          dataset: { index: String(index) },
        },
        [
          el('span', { class: 'autocomplete-icon', text: SOURCE_ICONS[suggestion.source] || '' }),
          el('span', { class: 'autocomplete-texts' }, [
            el('span', { class: 'autocomplete-primary', text: primaryLabel(suggestion) }),
            // Adresse exacte qui sera inseree dans le champ. Affichee en clair
            // pour un favori : son nom seul laissait douter de ce qui allait
            // reellement etre repris.
            el('span', {
              class: `autocomplete-secondary${suggestion.source === 'favorite' ? ' is-address' : ''}`,
              text: detailLabel(suggestion),
            }),
          ]),
        ],
      );

      // pointerdown plutot que click : le champ ne perd pas le focus avant la selection.
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        select(index);
      });

      panel.append(option);
    });

    openPanel();
  }

  function primaryLabel(suggestion) {
    // Un favori s'affiche sous son nom (« Domicile »), pas sous son adresse.
    return suggestion.source === 'favorite' ? suggestion.name || suggestion.label : suggestion.label;
  }

  /**
   * Deuxieme ligne : toujours l'adresse complete telle qu'elle sera reprise.
   * Pour un favori, c'est ce qui leve le doute sur le contenu du champ.
   */
  function detailLabel(suggestion) {
    if (suggestion.source === 'favorite') {
      return suggestion.fullLabel || suggestion.secondary || '';
    }
    return suggestion.secondary || '';
  }

  function openPanel() {
    open = true;
    panel.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    open = false;
    activeIndex = -1;
    panel.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlight(index) {
    activeIndex = index;
    Array.from(panel.children).forEach((child, i) => {
      child.classList.toggle('active', i === index);
    });
    if (index >= 0) {
      input.setAttribute('aria-activedescendant', `ac-option-${index}`);
      panel.children[index]?.scrollIntoView({ block: 'nearest' });
    }
  }

  function select(index) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    input.value = suggestion.fullLabel || suggestion.label;
    close();
    controller.cancel();
    onSelect(suggestion);
  }

  input.addEventListener('input', () => {
    onInput();
    controller.query(input.value);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) controller.query(input.value);
  });

  input.addEventListener('blur', () => {
    // Laisse le temps a un pointerdown en cours de se terminer.
    setTimeout(close, 120);
  });

  input.addEventListener('keydown', (event) => {
    if (!open || !suggestions.length) {
      if (event.key === 'Escape') controller.cancel();
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        highlight((activeIndex + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        highlight((activeIndex - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        if (activeIndex >= 0) {
          event.preventDefault();
          select(activeIndex);
        }
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      default:
        break;
    }
  });

  return {
    /** Renseigne le champ sans declencher de recherche (edition d'un trajet). */
    setValue(value) {
      controller.cancel();
      input.value = value ?? '';
      close();
    },
    destroy() {
      controller.cancel();
      close();
    },
  };
}
