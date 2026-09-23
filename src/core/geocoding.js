// Geocoding of the addresses of a CSV file, by the geocoding service of the Géoplateforme, which relies on the
// Base Adresse Nationale. The file is sent by batches, the search kept to the municipality of the map, and each
// row comes back classed: found, to check, or not found — the service answers « ok » even when it is wrong.
// The thresholds were measured on 430 addresses of Colombiers, written as a town hall would write them (#10).

import { requestForm } from './http.js';
import { GEOCODING_COLUMNS, GEOCODING_STATUS, addressColumns, csvSeparator, parseCsv } from './layers.js';
import { normalizeName } from './municipalities.js';

const GEOCODING_CSV_URL = 'https://data.geopf.fr/geocodage/search/csv';

// Rows sent in one request: 2,000 take about 7 s, where 10,000 would pass the 30 s after which a request is given up.
export const BATCH_SIZE = 2000;

// Below this score, no answer of the measure was right: an invented street, « Mairie », « Salle des fêtes »…
// reached 0.68 at most. From the other one up, none was wrong — with a margin above the 0.83 of the one trap met,
// a street name that its abbreviation had made ambiguous.
export const NOT_FOUND_BELOW = 0.7;
export const FOUND_FROM = 0.85;

// Types of streets written short, spelled out before sending: « 4 Imp. Saint-Fleur » found « 4 Saint Fleur »,
// another place 130 m away, where « 4 Impasse Saint-Fleur » found the right one.
const ABBREVIATIONS = [
  [/\bimp\b\.?/i, 'Impasse'],
  [/\brte\b\.?/i, 'Route'],
  [/\bch\b\.?/i, 'Chemin'],
  [/\bpl\b\.?/i, 'Place'],
  [/\bav\b\.?/i, 'Avenue'],
  [/\bbd\b\.?/i, 'Boulevard'],
  [/\ball\b\.?/i, 'Allée'],
  [/\btrav\b\.?/i, 'Traverse'],
  [/\bsq\b\.?/i, 'Square'],
  [/\br\.(?=\s)/i, 'Rue'],
];

export class GeocodingError extends Error {}

/**
 * An address with the name of its municipality, when it does not carry it already. The search is kept to the
 * municipality either way, but the name in the text helps the service forgive a typo: of 60 misspelt addresses
 * written without it, 15 were not found, where all were placed once it was added — and none wrongly (#10).
 */
export function withMunicipality(address, municipalityName) {
  if (!municipalityName || normalizeName(address).includes(normalizeName(municipalityName))) return address;
  return `${address} ${municipalityName}`;
}

/** An address with its usual abbreviations of street types spelled out. */
export function expandAbbreviations(address) {
  return ABBREVIATIONS.reduce(
    (text, [pattern, full]) => text.replace(new RegExp(`${pattern.source}(?=\\s)`, 'gi'), full),
    address,
  );
}

/**
 * Status of an answer of the service to an address: found, to check, or not found. The centre of the
 * municipality is never an answer, and a number asked for but a point in the middle of the street is to check.
 */
export function classify({ address, type, score }) {
  if (!type || type === 'municipality' || !(score >= NOT_FOUND_BELOW)) return GEOCODING_STATUS.missing;
  if (/^\s*\d/.test(address) && type !== 'housenumber') return GEOCODING_STATUS.check;
  return score >= FOUND_FROM ? GEOCODING_STATUS.found : GEOCODING_STATUS.check;
}

/**
 * Geocodes the addresses of a CSV file, within the municipality `inseeCode`, whose name `municipalityName` is added
 * to the addresses that do not carry it. Returns the file with its columns,
 * in the same separator, plus the coordinates and the geocoding of each row — ready to be drawn, and to be kept
 * so as not to geocode again — and a report: the counts, and each row with what was found for it.
 */
export async function geocodeCsv(
  text,
  { inseeCode, municipalityName, onProgress = () => {}, send = sendBatch, batchSize = BATCH_SIZE, date = new Date() },
) {
  const separator = csvSeparator(text);
  const [header, ...lines] = parseCsv(text);
  const headers = header.map((name) => name.trim().toLowerCase());
  // A file geocoded before, then corrected, is geocoded again: its former results are replaced.
  const former = new Set(['latitude', 'longitude', ...Object.values(GEOCODING_COLUMNS)]);
  const kept = headers.flatMap((name, column) => (former.has(name) ? [] : [column]));
  const columns = addressColumns(headers);
  if (!columns) {
    throw new GeocodingError(
      'Aucune colonne d’adresse dans ce fichier : une colonne « adresse », ou des colonnes « numéro », « voie », ' +
        '« code postal » et « commune », sont attendues.',
    );
  }

  // Rows keep the number of their line in the file — the header is line 1 — for the report to say which to fix.
  const rows = lines
    .map((line, index) => ({
      line: index + 2,
      values: line,
      address: columns.map((column) => line[column]?.trim()).filter(Boolean).join(' '),
    }))
    .filter(({ values }) => !values.every((value) => value.trim() === ''));

  const answers = new Map();
  const toSend = rows.filter((row) => row.address);
  for (let start = 0; start < toSend.length; start += batchSize) {
    const batch = toSend.slice(start, start + batchSize);
    const request = toCsv([
      ['id', 'adresse', 'code_insee'],
      ...batch.map((row) => [String(row.line), withMunicipality(expandAbbreviations(row.address), municipalityName), inseeCode]),
    ]);
    const [answerHeader, ...answerRows] = parseCsv(await send(request));
    const at = (name) => answerHeader.indexOf(name);
    for (const answer of answerRows) {
      answers.set(Number(answer[at('id')]), {
        longitude: Number(answer[at('longitude')]),
        latitude: Number(answer[at('latitude')]),
        score: answer[at('result_score')] === '' ? undefined : Number(answer[at('result_score')]),
        type: answer[at('result_type')] || undefined,
        label: answer[at('result_label')] || undefined,
      });
    }
    onProgress({ done: Math.min(start + batchSize, toSend.length), total: toSend.length });
  }

  // Numbers are written the way the file writes them: with a decimal comma in a file of French spreadsheet.
  const number = (value, digits) => {
    const written = String(Number(value.toFixed(digits)));
    return separator === ';' ? written.replace('.', ',') : written;
  };
  const day = date.toISOString().slice(0, 10);
  const report = rows.map((row) => {
    const answer = answers.get(row.line) ?? {};
    const status = row.address ? classify({ address: row.address, ...answer }) : GEOCODING_STATUS.missing;
    return { line: row.line, address: row.address, status, found: answer.label, score: answer.score, answer };
  });

  const csv = toCsv(
    [
      [...kept.map((column) => header[column]), 'latitude', 'longitude', ...Object.values(GEOCODING_COLUMNS)],
      ...rows.map((row, index) => {
        const { status, found, score, answer } = report[index];
        const placed = status !== GEOCODING_STATUS.missing && Number.isFinite(answer.latitude);
        return [
          ...kept.map((column) => row.values[column] ?? ''),
          placed ? number(answer.latitude, 6) : '',
          placed ? number(answer.longitude, 6) : '',
          status,
          score === undefined ? '' : number(score, 2),
          found ?? '',
          day,
        ];
      }),
    ],
    separator,
  );

  const count = (status) => report.filter((row) => row.status === status).length;
  return {
    // The mark of UTF-8 lets a spreadsheet open the file with its accents.
    csv: `\uFEFF${csv}`,
    summary: {
      total: report.length,
      found: count(GEOCODING_STATUS.found),
      check: count(GEOCODING_STATUS.check),
      missing: count(GEOCODING_STATUS.missing),
    },
    rows: report.map(({ answer, ...row }) => row),
  };
}

/** Sends a batch to the service, the search kept to the municipality written in its « code_insee » column. */
export async function sendBatch(csv) {
  const form = new FormData();
  form.append('data', new Blob([csv], { type: 'text/csv' }), 'adresses.csv');
  form.append('columns', 'adresse');
  // The name of the column holding the INSEE code, not the code itself.
  form.append('citycode', 'code_insee');
  for (const column of ['longitude', 'latitude', 'result_score', 'result_type', 'result_label']) {
    form.append('result_columns', column);
  }
  return requestForm(GEOCODING_CSV_URL, form);
}

/** Rows written as CSV, the fields that need it between quotes. */
function toCsv(rows, separator = ',') {
  const field = (value) =>
    /["\n\r]/.test(value) || value.includes(separator) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${rows.map((row) => row.map((value) => field(String(value))).join(separator)).join('\n')}\n`;
}
