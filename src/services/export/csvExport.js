/**
 * Export CSV.
 *
 * Format identique a la version 0.1.1 (verrouille par un test) :
 * separateur point-virgule, guillemets systematiques, fin de ligne CRLF et
 * BOM UTF-8 — ce qui permet a Excel en configuration francaise d'ouvrir le
 * fichier correctement d'un simple double-clic.
 */

// Colonnes identiques a la v0.1.1, accents compris : un tableur ou un classeur
// deja construit sur un export precedent doit continuer a fonctionner.
export const CSV_HEADER = [
  'Date',
  'Structure',
  'Véhicule',
  'Départ',
  'Destination',
  'Motif',
  'Kilomètres',
  'Montant EUR',
  'Calcul',
];

/**
 * @param {object} report  objet produit par buildReport()
 * @param {{companyName: string}} context
 */
export function buildCsv(report, { companyName = '' } = {}) {
  const rows = report.lines.map((line) => [
    line.date,
    companyName,
    line.vehicleName,
    line.from,
    line.to,
    line.purpose,
    Number(line.km).toFixed(1),
    Number(line.amount).toFixed(2),
    line.rateInfo,
  ]);

  // BOM UTF-8, construit par code point : le caractere litteral est invisible
  // et se perdrait au moindre changement d'encodage du fichier source.
  const BOM = String.fromCharCode(0xfeff);

  return (
    BOM +
    [CSV_HEADER, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
  );
}

export function csvFileName(report, { companyName = '' } = {}) {
  const slug = String(companyName || 'rapport')
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const period = report.period?.from || new Date().toISOString().slice(0, 10);
  return `agilmea-ik-${slug}-${period}.csv`;
}
