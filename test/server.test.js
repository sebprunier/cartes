import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import sharp from 'sharp';

import { extentFromBbox, tilesInExtent } from '../src/core/tiles.js';
import { openApi } from '../src/node/openapi.js';
import { createApiServer } from '../src/node/server.js';

// Colombiers, roughly: its tiles are put in the cache beforehand, and the services of the Géoplateforme are
// answered here, so that the API is tested without reaching the network.
const BBOX = [0.42, 46.77, 0.445, 46.79];
const RING = [
  [0.42, 46.77],
  [0.445, 46.77],
  [0.445, 46.79],
  [0.42, 46.77],
];
const GEOCODING = {
  features: [
    { properties: { citycode: '34081', name: 'Colombiers', postcode: '34440', depcode: '34', context: '34, Hérault' } },
    { properties: { citycode: '86081', name: 'Colombiers', postcode: '86490', depcode: '86', context: '86, Vienne' } },
  ],
};
const BOUNDARY = {
  features: [
    { geometry: { type: 'Polygon', coordinates: [RING] }, properties: { code_insee: '86081', nom_officiel: 'Colombiers' } },
  ],
};
// A WMS added by its address: what it announces, and the image it draws.
const CAPABILITIES = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service><Name>WMS</Name><Title>Exemple</Title></Service>
  <Capability><Layer><Title>Risques</Title><CRS>EPSG:3857</CRS>
    <Layer><Name>CAVITE_LOCALISEE</Name><Title>Cavités souterraines</Title></Layer>
  </Layer></Capability>
</WMS_Capabilities>`;
const POINTS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0.43, 46.78] }, properties: { nom: 'Mairie' } },
  ],
};

const DESCRIPTION = openApi('9.9.9');

/** The schema of what a service answers, as the OpenAPI description gives it. */
function described(method, route, status) {
  return DESCRIPTION.paths[route][method].responses[status].content['application/json'].schema;
}

/**
 * Checks that an answer has only the fields its schema describes, and all those it requires: a field added to
 * the API and forgotten in its description is found here, rather than by a client.
 */
function assertDescribed(body, schema, where) {
  if (schema.type === 'array') {
    assert.ok(Array.isArray(body), where);
    body.forEach((item, index) => assertDescribed(item, schema.items, `${where}[${index}]`));
    return;
  }
  if (schema.type !== 'object' || !schema.properties) return;
  assert.equal(typeof body, 'object', where);
  for (const name of Object.keys(body)) assert.ok(name in schema.properties, `${where}.${name} n’est pas décrit`);
  for (const name of schema.required ?? []) assert.ok(name in body, `${where}.${name} manque`);
  for (const [name, value] of Object.entries(body)) {
    if (value === null || typeof value !== 'object') continue;
    assertDescribed(value, schema.properties[name], `${where}.${name}`);
  }
}

const realFetch = globalThis.fetch;
let tempDir;
let cacheDir;
let tile;

before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cartes-test-'));
  cacheDir = path.join(tempDir, 'cache');
  tile = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#e8e4d8' } })
    .png()
    .toBuffer();
  for (const zoom of [12, 13]) {
    // The margin of the API, 3 % by default, may reach one more row or column of tiles.
    for (const { x, y } of tilesInExtent(extentFromBbox(BBOX, zoom, 0.03))) {
      const tilePath = path.join(cacheDir, 'plan-ign', String(zoom), String(x), `${y}.tile`);
      await mkdir(path.dirname(tilePath), { recursive: true });
      await writeFile(tilePath, tile);
    }
  }
});

after(() => rm(tempDir, { recursive: true, force: true }));

beforeEach((t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const address = String(url);
    if (address.startsWith('http://localhost')) return realFetch(url, options);
    if (address.startsWith('https://data.geopf.fr/geocodage/')) return Response.json(GEOCODING);
    if (address.startsWith('https://data.geopf.fr/wfs/')) return Response.json(BOUNDARY);
    if (address.includes('REQUEST=GetCapabilities')) return new Response(CAPABILITIES);
    if (address.includes('REQUEST=GetMap')) return new Response(tile, { headers: { 'content-type': 'image/png' } });
    // The catalog of the dates of the data, and anything else, is out of reach, as offline.
    throw new Error('Pas de réseau pendant les tests.');
  });
});

/** Starts an API on a free port, for the time of a test. */
async function startApi(t, settings = {}) {
  const outputDir = path.join(tempDir, `sorties-${Math.random().toString(36).slice(2)}`);
  const server = createApiServer({ cacheDir, outputDir, version: '9.9.9', ...settings });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, route, body, headers = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...headers },
      body: body && (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const type = response.headers.get('content-type') ?? '';
    return { response, body: type.startsWith('application/json') ? await response.json() : await response.arrayBuffer() };
  };
  return { call, outputDir };
}

async function waitFor(call, id, statuses = ['terminée', 'échouée', 'annulée']) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { body } = await call('GET', `/cartes/${id}`);
    if (statuses.includes(body.statut)) return body;
    await sleep(20);
  }
  throw new Error(`La carte ${id} ne s'est pas terminée.`);
}

describe('API', () => {
  it('describes itself, and its OpenAPI description, without a key', async (t) => {
    const { call } = await startApi(t, { apiKey: 'secret' });
    const home = await call('GET', '/');
    assert.equal(home.response.status, 200);
    assert.equal(home.body.version, '9.9.9');
    assert.equal(home.body.cleRequise, true);
    assertDescribed(home.body, described('get', '/', 200), 'GET /');
    const openApi = await call('GET', '/openapi.json');
    assert.equal(openApi.body.info.version, '9.9.9');
    assert.ok(openApi.body.paths['/cartes']);
  });

  it('refuses the other services without the key, and serves them with it', async (t) => {
    const { call } = await startApi(t, { apiKey: 'secret' });
    for (const headers of [{}, { Authorization: 'Bearer autre' }]) {
      const { response, body } = await call('GET', '/fonds', undefined, headers);
      assert.equal(response.status, 401);
      assert.match(body.erreur, /^Clé d'API absente ou invalide/);
    }
    const { response } = await call('GET', '/fonds', undefined, { Authorization: 'Bearer secret' });
    assert.equal(response.status, 200);
  });

  it('lists the basemaps and the layers, under their French and English paths', async (t) => {
    const { call } = await startApi(t);
    const basemaps = await call('GET', '/fonds');
    assert.deepEqual(basemaps.body, (await call('GET', '/basemaps')).body);
    assert.ok(basemaps.body.some(({ id, zoomMax }) => id === 'plan-ign' && zoomMax === 19));
    assertDescribed(basemaps.body, described('get', '/fonds', 200), 'GET /fonds');
    const layers = await call('GET', '/maplayers');
    const cadastre = layers.body.find(({ id }) => id === 'cadastre');
    assert.equal(cadastre.theme, 'urbanisme');
    assert.equal(cadastre.fournisseur, 'IGN');
    assert.equal(cadastre.zoomMin, 16);
    assertDescribed(layers.body, described('get', '/couches', 200), 'GET /couches');
  });

  it('searches municipalities by name and department', async (t) => {
    const { call } = await startApi(t);
    const { body } = await call('GET', '/communes?nom=Colombiers&departement=86');
    assert.deepEqual(body.map(({ codeInsee }) => codeInsee), ['86081']);
    assertDescribed(body, described('get', '/communes', 200), 'GET /communes');
    assert.deepEqual((await call('GET', '/municipalities?name=Colombiers&department=86')).body, body);
    const missing = await call('GET', '/communes');
    assert.equal(missing.response.status, 400);
  });

  // The fields of a layer, of a layer added by its address and of a file have English names too, like those of
  // the request itself: they are the ones described, and none other passes.
  it('reads the fields of a layer, of a WMS and of a file under their English names too', async (t) => {
    const { call } = await startApi(t);
    const accepted = await call('POST', '/estimations', {
      municipality: '86081',
      zoom: 13,
      maplayers: [{ id: 'argiles', opacity: 0.4 }],
      customLayers: [
        { url: 'https://exemple.fr/wms', layer: 'CAVITE_LOCALISEE', name: 'Cavités', attribution: '© BRGM' },
      ],
      data: [{ fileName: 'points.geojson', title: 'Points', content: JSON.stringify(POINTS) }],
    });
    assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
    const unknownLayer = await call('POST', '/estimations', {
      commune: '86081',
      couchesPerso: [{ adresse: 'https://exemple.fr/wms', couche: 'INCONNUE', nom: 'Cavités', source: '© BRGM' }],
    });
    assert.equal(unknownLayer.response.status, 400);
    assert.match(unknownLayer.body.erreur, /n’a pas de couche « INCONNUE »/);
    const unknownField = await call('POST', '/estimations', {
      commune: '86081',
      couchesPerso: [
        { adresse: 'https://exemple.fr/wms', wmsLayers: 'CAVITE_LOCALISEE', nom: 'Cavités', source: '© BRGM' },
      ],
    });
    assert.equal(unknownField.response.status, 400);
    assert.match(unknownField.body.erreur, /^Champ inconnu dans une couche ajoutée par son adresse : wmsLayers\./);
  });

  it('answers in French, with a JSON error, what it does not serve or understand', async (t) => {
    const { call } = await startApi(t);
    const unknown = await call('GET', '/nulle-part');
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.body.erreur, 'Aucun service à cette adresse : GET /nulle-part.');
    for (const [body, message] of [
      ['{', /^Le corps de la demande doit être un objet JSON\.$/],
      [{}, /^Le champ commune est obligatoire/],
      [{ commune: '86081', zooom: 13 }, /^Champ inconnu dans la demande : zooom\./],
      [{ commune: '86081', zoom: 25 }, /^Le champ zoom doit être un entier compris entre 0 et 19\.$/],
      [{ commune: '86081', fond: 'aucun' }, /^Fond inconnu : aucun\./],
      [{ commune: '86081', couches: ['aucune'] }, /aucune/],
      [{ commune: 'Colombiers' }, /^Plusieurs communes correspondent à « Colombiers »/],
    ]) {
      const { response, body: error } = await call('POST', '/cartes', body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.match(error.erreur, message);
    }
  });

  it('lowers the highest zoom when the instance asks for it', async (t) => {
    const { call } = await startApi(t, { maxZoom: 16 });
    const { response, body } = await call('POST', '/estimations', { commune: '86081', zoom: 17 });
    assert.equal(response.status, 400);
    assert.match(body.erreur, /compris entre 0 et 16/);
  });

  it('estimates a map for every zoom level, and its weight for the zoom asked for', async (t) => {
    const { call } = await startApi(t);
    const { body } = await call('POST', '/estimations', { municipality: '86081', zoom: 13 });
    assert.deepEqual(body.commune, { codeInsee: '86081', nom: 'Colombiers' });
    assert.equal(body.niveaux[0].zoom, 13);
    assert.equal(body.niveaux.at(-1).zoom, 19);
    assert.ok(body.poids > 0);
    assertDescribed(body, described('post', '/estimations', 200), 'POST /estimations');
  });

  it('generates a map in the background, and serves its file once done', async (t) => {
    const { call } = await startApi(t);
    const created = await call('POST', '/cartes', { commune: '86081', zoom: 13, contour: false });
    assert.equal(created.response.status, 202);
    assert.equal(created.response.headers.get('location'), `/cartes/${created.body.id}`);
    assertDescribed(created.body, described('post', '/cartes', 202), 'POST /cartes');

    const map = await waitFor(call, created.body.id);
    assert.equal(map.statut, 'terminée', map.erreur);
    assertDescribed(map, described('get', '/cartes/{id}', 200), 'GET /cartes/{id}');
    assert.equal(map.nomFichier, '86081-colombiers-plan-ign-z13.png');
    assert.ok(map.etapes.includes(`Enregistrement dans ${map.nomFichier}…`));
    assert.ok(map.avertissements.some((warning) => warning.startsWith('Date de mise à jour des données indisponible')));

    const file = await call('GET', map.fichier);
    assert.equal(file.response.headers.get('content-type'), 'image/png');
    assert.match(file.response.headers.get('content-disposition'), /filename="86081-colombiers-plan-ign-z13\.png"/);
    const { width, height } = await sharp(Buffer.from(file.body)).metadata();
    assert.deepEqual([width, height], [map.largeur, map.hauteur]);
  });

  it('generates one map at a time by default, the next ones waiting their turn', async (t) => {
    const { call } = await startApi(t);
    const first = await call('POST', '/cartes', { commune: '86081', zoom: 13 });
    const second = await call('POST', '/cartes', { commune: '86081', zoom: 12 });
    assert.equal(second.body.statut, 'en attente');
    const notReady = await call('GET', `/cartes/${second.body.id}/fichier`);
    assert.equal(notReady.response.status, 409);
    for (const { body } of [first, second]) assert.equal((await waitFor(call, body.id)).statut, 'terminée');
  });

  it('cancels a waiting map, and removes a finished one with its file', async (t) => {
    const { call, outputDir } = await startApi(t);
    const first = await call('POST', '/cartes', { commune: '86081', zoom: 13 });
    const second = await call('POST', '/cartes', { commune: '86081', zoom: 12 });
    const canceled = await call('DELETE', `/cartes/${second.body.id}`);
    assert.equal(canceled.body.statut, 'annulée');

    await waitFor(call, first.body.id);
    const removed = await call('DELETE', `/maps/${first.body.id}`);
    assert.equal(removed.body.statut, 'supprimée');
    assert.equal((await call('GET', `/cartes/${first.body.id}`)).response.status, 404);
    assert.deepEqual(await readdir(outputDir), []);
  });

  it('forgets a map and its file once kept for the time set', async (t) => {
    const { call, outputDir } = await startApi(t, { retentionMs: 50 });
    const { body } = await call('POST', '/cartes', { commune: '86081', zoom: 12 });
    await waitFor(call, body.id);
    await sleep(150);
    assert.equal((await call('GET', `/cartes/${body.id}`)).response.status, 404);
    assert.deepEqual(await readdir(outputDir), []);
  });
});
