/**
 * Monogramme Agilmea, redessine en SVG.
 *
 * Reprend les trois elements de l'identite : le « A » forme de deux jambages
 * obliques asymetriques, le cadre carre dore ouvert sur ses cotes, et le
 * contraste bleu marine / or. En vectoriel plutot qu'en image : net a toutes
 * les tailles, quelques centaines d'octets, aucune requete.
 *
 * Construit noeud par noeud, sans innerHTML : l'application n'ecrit nulle part
 * de balisage sous forme de chaine.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function node(tag, attributes) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

/**
 * @param {{size?: number, withWordmark?: boolean, title?: string}} options
 * @returns {SVGElement}
 */
export function createLogo({ size = 34, withWordmark = false, title = 'Agilmea' } = {}) {
  const svg = node('svg', {
    viewBox: withWordmark ? '0 0 340 110' : '0 0 100 100',
    width: withWordmark ? size * 3.1 : size,
    height: size,
    role: 'img',
    'aria-label': title,
    fill: 'none',
  });

  // Cadre dore : quatre traits, volontairement interrompus aux angles.
  svg.append(
    node('path', {
      d: 'M22 20 H78 M22 20 V80 M22 80 H78 M78 20 V80',
      stroke: 'var(--gold)',
      'stroke-width': 4,
      'stroke-linecap': 'square',
    }),
  );

  // Jambage principal, du haut a gauche vers le bas.
  svg.append(node('path', { d: 'M56 8 L70 8 L34 92 L20 92 Z', fill: 'var(--brand-ink)' }));
  // Second jambage, plus court, qui ferme le A.
  svg.append(node('path', { d: 'M53 34 L64 34 L88 92 L74 92 Z', fill: 'var(--brand-ink)' }));

  if (withWordmark) {
    const text = node('text', {
      x: 112,
      y: 70,
      'font-size': 46,
      'letter-spacing': 10,
      fill: 'var(--brand-ink)',
      'font-weight': 400,
      'font-family': 'inherit',
    });
    text.textContent = 'AGILMEA';
    svg.append(text);
  }

  return svg;
}

/** Place le monogramme dans l'en-tete de l'application. */
export function mountHeaderLogo(container) {
  if (!container) return;
  container.replaceChildren(createLogo({ size: 38 }));
}
