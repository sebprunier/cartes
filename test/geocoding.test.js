import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  BATCH_SIZE,
  GeocodingError,
  classify,
  expandAbbreviations,
  geocodeCsv,
  withMunicipality,
  sendBatch,
} from '../src/core/geocoding.js';
import { requestForm } from '../src/core/http.js';
import { GEOCODING_STATUS, parseCsv, readLayer } from '../src/core/layers.js';

// The answers of the service to 430 addresses of Colombiers, recorded with the truth of the Base Adresse
// Nationale: the thresholds are checked on real answers, and the geocoding is replayed without the network.
const [fixtureHeader, ...fixtureRows] = parseCsv(
  readFileSync(new URL('./fixtures/geocodage-colombiers.csv', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n'),
);
const recorded = fixtureRows.map((row) => Object.fromEntries(fixtureHeader.map((name, column) => [name, row[column]])));
const byAddress = new Map(recorded.map((row) => [row.adresse, row]));

/** Answers a batch as the service would, from the recorded answers; unknown addresses find nothing. */
function recordedService(calls = []) {
  return async (csv) => {
    const [, ...rows] = parseCsv(csv);
    calls.push(rows);
    const lines = rows.map(([id, address, inseeCode]) => {
      const answer = byAddress.get(address) ?? {};
      return [id, `"${address}"`, inseeCode, answer.longitude ?? '', answer.latitude ?? '', answer.result_score ?? '',
        answer.result_type ?? '', answer.result_label ? `"${answer.result_label}"` : ''].join(',');
    });
    return ['id,adresse,code_insee,longitude,latitude,result_score,result_type,result_label', ...lines].join('\n');
  };
}

describe('classify', () => {
  const classified = recorded.map((row) => ({
    ...row,
    status: classify({ address: row.adresse, type: row.result_type, score: Number(row.result_score || 0) }),
  }));

  // An address placed wrongly looks right: that is the one mistake the thresholds must never make.
  it('finds none of the wrong answers of the measure, and loses none of the right ones', () => {
    const wrongFound = classified.filter((row) => row.status === GEOCODING_STATUS.found && row.verdict !== 'juste');
    assert.deepEqual(wrongFound.map((row) => row.adresse), []);
    const rightLost = classified.filter((row) => row.status === GEOCODING_STATUS.missing && row.verdict === 'juste');
    assert.deepEqual(rightLost.map((row) => row.adresse), []);
  });

  it('never finds an invented street, a place name, or an address of another municipality', () => {
    for (const category of ['voie inventée', 'nom de lieu', 'autre commune']) {
      const statuses = new Set(classified.filter((row) => row.categorie === category).map((row) => row.status));
      assert.deepEqual([...statuses], [GEOCODING_STATUS.missing], category);
    }
  });

  it('asks to check a number the base does not know, placed in the middle of its street', () => {
    const statuses = classified.filter((row) => row.categorie === 'numéro inexistant').map((row) => row.status);
    assert.ok(statuses.every((status) => status === GEOCODING_STATUS.check));
  });

  it('never takes the centre of the municipality for an address, whatever its score', () => {
    assert.equal(classify({ address: 'Stade', type: 'municipality', score: 0.99 }), GEOCODING_STATUS.missing);
  });
});

describe('expandAbbreviations', () => {
  it('spells out the usual types of streets, and leaves the words that only look like them', () => {
    assert.equal(expandAbbreviations('4 Imp. Saint - Fleur 86490 Colombiers'), '4 Impasse Saint - Fleur 86490 Colombiers');
    assert.equal(expandAbbreviations('47 Rte des Mottes'), '47 Route des Mottes');
    assert.equal(expandAbbreviations('3 ch de la Garenne'), '3 Chemin de la Garenne');
    assert.equal(expandAbbreviations('5 r. Pasteur'), '5 Rue Pasteur');
    assert.equal(expandAbbreviations('Champ Rond'), 'Champ Rond');
    assert.equal(expandAbbreviations('La Chapelle, Route de Rouhet'), 'La Chapelle, Route de Rouhet');
  });
});

describe('withMunicipality', () => {
  it('adds the name of the municipality to an address that lacks it, and only then', () => {
    assert.equal(withMunicipality('10 Rue de la Grnade Vallée', 'Colombiers'), '10 Rue de la Grnade Vallée Colombiers');
    assert.equal(withMunicipality('10 Rue de la Grande Vallée 86490 COLOMBIERS', 'Colombiers'), '10 Rue de la Grande Vallée 86490 COLOMBIERS');
    assert.equal(withMunicipality('3 Mavault saint martin la pallu', 'Saint-Martin-la-Pallu'), '3 Mavault saint martin la pallu');
    assert.equal(withMunicipality('Place de Manderen', undefined), 'Place de Manderen');
  });
});

describe('geocodeCsv', () => {
  // A file as a French spreadsheet writes it: semicolons, a quoted field, an abbreviation, a blank line.
  const file =
    'nom;adresse;type\n' +
    'Mairie;10 Rue de la Grande Vallée 86490 Colombiers;public\n' +
    '"Salle; grande";4 Imp. Saint - Fleur 86490 Colombiers;public\n' +
    '\n' +
    'Nouveau lotissement;251 Rue Claveurier 86490 Colombiers;privé\n' +
    'Stade;Stade 86490 Colombiers;public\n' +
    'Sans adresse;;public\n';
  const date = new Date('2026-09-23T10:00:00Z');

  it('places each address, classes it, and says which line of the file to fix', async () => {
    const { summary, rows } = await geocodeCsv(file, { inseeCode: '86081', send: recordedService(), date });
    assert.deepEqual(summary, { total: 5, found: 2, check: 1, missing: 2 });
    assert.deepEqual(
      rows.map(({ line, status }) => [line, status]),
      [
        [2, 'trouvée'],
        [3, 'trouvée'], // Found once « Imp. » is spelled out: the recorded answer is the one to « Impasse ».
        [5, 'à vérifier'],
        [6, 'introuvable'],
        [7, 'introuvable'],
      ],
    );
    assert.equal(rows[2].found, 'Rue Claveurier 86490 Colombiers');
  });

  it('keeps the search within the municipality of the map', async () => {
    const calls = [];
    await geocodeCsv(file, { inseeCode: '86081', send: recordedService(calls), date });
    assert.ok(calls.flat().every(([, , inseeCode]) => inseeCode === '86081'));
    // An empty address is not sent.
    assert.equal(calls.flat().length, 4);
  });

  it('writes the file back the way it was written, with the coordinates and the geocoding of each row', async () => {
    const { csv } = await geocodeCsv(file, { inseeCode: '86081', send: recordedService(), date });
    assert.ok(csv.startsWith('\uFEFF'), 'marque UTF-8, pour les tableurs');
    const lines = csv.slice(1).trim().split('\n');
    assert.equal(
      lines[0],
      'nom;adresse;type;latitude;longitude;geocodage_statut;geocodage_score;geocodage_adresse_trouvee;geocodage_date',
    );
    assert.equal(
      lines[1],
      'Mairie;10 Rue de la Grande Vallée 86490 Colombiers;public;46,767271;0,418589;trouvée;0,95;' +
        '10 Rue de la Grande Vallée 86490 Colombiers;2026-09-23',
    );
    assert.match(lines[2], /^"Salle; grande";/);
    // An address not found has no coordinates, but keeps what the service answered, to help fixing it.
    assert.match(lines[4], /^Stade;Stade 86490 Colombiers;public;;;introuvable;0,68;Colombiers;2026-09-23$/);
  });

  it('gives a file the map draws at once: the addresses found, and those to check when asked', async () => {
    const { csv } = await geocodeCsv(file, { inseeCode: '86081', send: recordedService(), date });
    const layer = readLayer(csv, { fileName: 'lieux.csv' });
    assert.deepEqual(layer.features.map((feature) => feature.label), ['Mairie', 'Salle; grande']);
    assert.equal(readLayer(csv, { fileName: 'lieux.csv', unverified: true }).features.length, 3);
    assert.equal(layer.geocodedOn, '2026-09-23');
  });

  it('geocodes again a file geocoded before, replacing its former results', async () => {
    const first = await geocodeCsv(file, { inseeCode: '86081', send: recordedService(), date });
    const again = await geocodeCsv(first.csv, { inseeCode: '86081', send: recordedService(), date });
    const header = again.csv.slice(1).split('\n')[0].split(';');
    assert.equal(header.filter((name) => name === 'latitude').length, 1);
    assert.deepEqual(again.summary, first.summary);
  });

  it('gives the service the name of the municipality with the addresses written without it', async () => {
    const calls = [];
    await geocodeCsv('nom;adresse\nLieu;10 Rue de la Grnade Vallée\n', {
      inseeCode: '86081',
      municipalityName: 'Colombiers',
      send: recordedService(calls),
      date,
    });
    assert.equal(calls[0][0][1], '10 Rue de la Grnade Vallée Colombiers');
  });

  it('assembles an address written in several columns', async () => {
    const calls = [];
    await geocodeCsv('numéro,voie,commune\n10,Rue de la Grande Vallée,86490 Colombiers\n', {
      inseeCode: '86081',
      send: recordedService(calls),
      date,
    });
    assert.equal(calls[0][0][1], '10 Rue de la Grande Vallée 86490 Colombiers');
  });

  it('sends a long file by batches, and tells how far it is', async () => {
    const calls = [];
    const progress = [];
    await geocodeCsv(file, { inseeCode: '86081', send: recordedService(calls), batchSize: 2, date, onProgress: (p) => progress.push(p) });
    assert.deepEqual(calls.map((batch) => batch.length), [2, 2]);
    assert.deepEqual(progress, [{ done: 2, total: 4 }, { done: 4, total: 4 }]);
    assert.ok(BATCH_SIZE <= 2000, 'un lot doit rester sous les 30 s au-delà desquelles une requête est abandonnée');
  });

  it('says which columns it expects when the file has no address', async () => {
    await assert.rejects(geocodeCsv('nom;commentaire\nMairie;ouverte\n', { inseeCode: '86081' }), GeocodingError);
  });
});

describe('sendBatch', () => {
  it('asks the service for the columns it needs, and keeps the search to the column of the INSEE code', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('id,adresse\n'));
    await sendBatch('id,adresse,code_insee\n2,Stade,86081\n');
    const [url, { method, body }] = fetch.mock.calls[0].arguments;
    assert.equal(url, 'https://data.geopf.fr/geocodage/search/csv');
    assert.equal(method, 'POST');
    assert.equal(body.get('columns'), 'adresse');
    assert.equal(body.get('citycode'), 'code_insee');
    assert.deepEqual(body.getAll('result_columns'), ['longitude', 'latitude', 'result_score', 'result_type', 'result_label']);
    assert.equal(await body.get('data').text(), 'id,adresse,code_insee\n2,Stade,86081\n');
  });
});

describe('requestForm', () => {
  it('sends the form again when the service is busy, and gives up after three tries', async (t) => {
    const answers = [429, 503, 200];
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
      new Response('réponse', { status: answers.shift() }),
    );
    assert.equal(await requestForm('https://exemple.fr/', new FormData(), { retryDelayMs: 1 }), 'réponse');
    assert.equal(fetch.mock.callCount(), 3);

    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
    await assert.rejects(requestForm('https://exemple.fr/', new FormData(), { retryDelayMs: 1 }), /HTTP 429/);
  });
});
