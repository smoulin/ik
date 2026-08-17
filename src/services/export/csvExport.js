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
 * Colonnes contenant du texte libre saisi par l'utilisateur.
 * Seules celles-ci sont protegees contre l'interpretation en formule ;
 * les colonnes Date, Kilometres et Montant restent des valeurs brutes,
 * pour que le tableur continue de les traiter comme des nombres et des dates.
 */
const TEXT_COLUMN_INDEXES = new Set([1, 2, 3, 4, 5, 8]);

/** Caracteres qui font demarrer une formule dans Excel, LibreOffice et Sheets. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Neutralise l'interpretation d'un champ texte comme formule de tableur.
 *
 * Sans cela, un motif aussi banal que « -50 % remise » ou « + frais de parking »
 * s'affiche « #NOM? » dans Excel au lieu du texte saisi, et « =HYPERLINK(...) »
 * deviendrait un lien cliquable.
 *
 * L'apostrophe de tete est la convention des tableurs : elle force le format
 * texte et n'est PAS affichee dans la cellule.
 */
export function escapeCsvFormula(value) {
  const text = String(value ?? '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

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

  const encodeCell = (value, columnIndex, isHeader) => {
    const raw = isHeader || !TEXT_COLUMN_INDEXES.has(columnIndex)
      ? String(value ?? '')
      : escapeCsvFormula(value);
    return `"${raw.replace(/"/g, '""')}"`;
  };

  return (
    BOM +
    [CSV_HEADER, ...rows]
      .map((row, rowIndex) =>
        row.map((value, columnIndex) => encodeCell(value, columnIndex, rowIndex === 0)).join(';'),
      )
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
