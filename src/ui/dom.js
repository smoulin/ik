/**
 * Petits utilitaires DOM. Volontairement minimalistes : l'application n'utilise
 * aucun framework, et n'en a pas besoin a cette echelle.
 */

export const byId = (id) => document.getElementById(id);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Cree un element avec ses attributs et ses enfants.
 *
 * Il n'existe volontairement AUCUNE option permettant d'injecter du HTML :
 * tout texte passe par `text` (donc par textContent) et les enfants sont des
 * noeuds. Une adresse ou un motif contenant des chevrons ne peut donc pas etre
 * interprete comme du balisage, sans avoir a echapper quoi que ce soit.
 */
export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Delegation d'evenement fiable : remonte depuis la cible reelle jusqu'a
 * l'element portant l'attribut. La v0.1.1 lisait `e.target.dataset` directement,
 * ce qui cassait des qu'un bouton contenait un element enfant.
 */
export function delegate(root, eventName, selector, handler) {
  root.addEventListener(eventName, (event) => {
    const match = event.target.closest(selector);
    if (match && root.contains(match)) handler(event, match);
  });
}

export function setHidden(node, hidden) {
  if (node) node.classList.toggle('hidden', Boolean(hidden));
}

/** Remplit un <select>, en preservant la valeur choisie si elle existe encore. */
export function fillSelect(select, items, { labelOf, value, leading = null }) {
  if (!select) return;
  const previous = value ?? select.value;
  select.replaceChildren();
  if (leading) select.append(el('option', { value: leading.value, text: leading.label }));
  for (const item of items) {
    select.append(el('option', { value: item.id, text: labelOf(item) }));
  }
  if (previous && items.some((item) => item.id === previous)) select.value = previous;
  else if (leading) select.value = leading.value;
}

/** Telechargement d'un contenu genere localement (CSV, sauvegarde JSON). */
export function downloadBlob(content, type, fileName) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
