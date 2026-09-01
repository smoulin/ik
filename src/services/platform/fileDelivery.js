/**
 * Remise d'un fichier genere par l'application : export CSV, sauvegarde JSON.
 *
 * Le navigateur et la coque native n'ont pas la meme notion de
 * « telecharger ». Sur le web, un lien `download` suffit. Dans une WebView
 * Android, ce lien ne declenche rien du tout — le clic est silencieusement
 * ignore, ce qui donne des boutons qui semblent morts.
 *
 * Cote natif on ecrit donc reellement le fichier dans le dossier de
 * l'application, puis on ouvre la feuille de partage d'Android : l'utilisateur
 * choisit lui-meme la destination, courriel, messagerie ou stockage. C'est le
 * comportement attendu sur un telephone, ou la notion de « dossier des
 * telechargements » ne veut pas dire grand-chose.
 */

import { Capacitor } from '@capacitor/core';

/**
 * @param {string} content   contenu du fichier, deja construit
 * @param {string} type      type MIME
 * @param {string} fileName  nom propose
 * @returns {Promise<void>}
 */
export async function deliverFile(content, type, fileName) {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(content, type, fileName);
    return;
  }

  // Import dynamique : le navigateur n'a aucune raison de charger ces greffons.
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  await Share.share({ title: fileName, url: uri });
}

function downloadInBrowser(content, type, fileName) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
