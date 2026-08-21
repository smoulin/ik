/**
 * Impression de l'ecran courant.
 *
 * Sur le web, `window.print()` fait le travail. Dans une WebView Android, cette
 * fonction n'existe pas : le clic ne produit rien du tout, sans la moindre
 * erreur — d'ou des boutons qui paraissent morts.
 *
 * Cote natif on passe donc par le service d'impression du systeme, via un
 * greffon minimal ecrit pour l'occasion. Il ouvre la boite de dialogue Android,
 * qui propose aussi bien une imprimante que « Enregistrer au format PDF ».
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const AgilmeaPrint = registerPlugin('AgilmeaPrint');

export async function printCurrentView(title = 'Agilmea IK') {
  if (!Capacitor.isNativePlatform()) {
    window.print();
    return;
  }

  await AgilmeaPrint.print({ title });
}
