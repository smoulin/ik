/**
 * Balayer une carte vers la droite decouvre une poubelle ; l'appui dessus
 * supprime. Comme dans Gmail, deux gestes volontaires tiennent lieu de
 * confirmation.
 *
 * Le geste n'est retenu que s'il est nettement horizontal : faire defiler la
 * liste ne doit jamais ouvrir une carte.
 */

import { el } from '../dom.js';

const REVEAL_PX = 76;
const DECIDE_PX = 10;

/** Une seule carte ouverte a la fois, comme dans les listes natives. */
let openRow = null;

export function attachSwipeToDelete(card, { onDelete }) {
  const trash = el('button', {
    class: 'swipe-trash',
    type: 'button',
    'aria-label': 'Supprimer ce trajet',
    text: '🗑',
    onClick: () => onDelete(),
  });
  const row = el('div', { class: 'swipe-row' }, [trash, card]);

  let startX = 0;
  let startY = 0;
  let offset = 0;
  let base = 0;
  let mode = null; // null | 'swipe' | 'scroll'
  let dragged = false;

  function setOffset(px, animate) {
    offset = Math.max(0, Math.min(REVEAL_PX, px));
    card.style.transition = animate ? 'transform 160ms ease' : 'none';
    card.style.transform = offset ? `translateX(${offset}px)` : '';
    trash.tabIndex = offset === REVEAL_PX ? 0 : -1;
  }

  function close() {
    setOffset(0, true);
    if (openRow === api) openRow = null;
  }

  const api = { close };

  card.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    base = offset;
    mode = null;
    dragged = false;
  });

  card.addEventListener('pointermove', (event) => {
    if (mode === 'scroll') return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (mode === null) {
      if (Math.abs(dy) > DECIDE_PX && Math.abs(dy) >= Math.abs(dx)) {
        mode = 'scroll';
        return;
      }
      if (Math.abs(dx) < DECIDE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      mode = 'swipe';
      card.setPointerCapture?.(event.pointerId);
      if (openRow && openRow !== api) openRow.close();
    }

    dragged = true;
    setOffset(base + dx, false);
  });

  const finish = () => {
    if (mode !== 'swipe') return;
    mode = null;
    if (offset > REVEAL_PX / 2) {
      setOffset(REVEAL_PX, true);
      openRow = api;
    } else {
      close();
    }
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', finish);

  // Un balayage se termine sur un « click » : il ne doit pas deplier la carte.
  // Une carte ouverte se referme au lieu de se deplier.
  card.addEventListener(
    'click',
    (event) => {
      if (dragged || offset > 0) {
        event.stopPropagation();
        event.preventDefault();
        dragged = false;
        if (offset > 0 && !event.target.closest('.swipe-trash')) close();
      }
    },
    true,
  );

  setOffset(0, false);
  return row;
}
