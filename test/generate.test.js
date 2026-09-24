import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import sharp from 'sharp';

import { BASEMAPS } from '../src/core/basemaps.js';
import { readLayer } from '../src/core/layers.js';
import { MAP_LAYERS } from '../src/core/maplayers.js';
import { extentFromBbox, tilesInExtent } from '../src/core/tiles.js';
import { estimateMapFileSize, generateMap } from '../src/node/generate.js';

// Colombiers, roughly: a small extent at a low zoom, whose tiles are all put in the cache beforehand. The
// generation then reads them from there, and the tests never reach the network.
const BBOX = [0.42, 46.77, 0.445, 46.79];
const BASEMAP = BASEMAPS['plan-ign'];
const BOUNDARY = {
  name: 'Colombiers',
  inseeCode: '86081',
  polygons: [
    [
      [
        [0.425, 46.775],
        [0.44, 46.775],
        [0.44, 46.785],
        [0.425, 46.775],
      ],
    ],
  ],
};

let tempDir;
let cacheDir;

before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cartes-test-'));
  cacheDir = path.join(tempDir, 'cache');
  const tile = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#e8e4d8' } })
    .png()
    .toBuffer();
  for (const zoom of [13, 14]) {
    for (const { x, y } of tilesInExtent(extentFromBbox(BBOX, zoom, 0))) {
      const tilePath = path.join(cacheDir, BASEMAP.id, String(zoom), String(x), `${y}.tile`);
      await mkdir(path.dirname(tilePath), { recursive: true });
      await writeFile(tilePath, tile);
    }
  }
});

after(() => rm(tempDir, { recursive: true, force: true }));

// The catalog of the Géoplateforme is out of reach: the dates of the data are then missing, as offline.
beforeEach((t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Pas de réseau pendant les tests.');
  });
});

function request(overrides = {}) {
  return {
    basemap: BASEMAP,
    extent: extentFromBbox(BBOX, 14, 0),
    boundary: BOUNDARY,
    dpi: 150,
    format: 'png',
    cacheDir,
    concurrency: 2,
    ...overrides,
  };
}

describe('generateMap', () => {
  it('writes the map at the size of its extent, and tells its steps and the progress of each source', async () => {
    const outputPath = path.join(tempDir, 'carte.png');
    const layers = [
      readLayer(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: { nom: 'Mairie' }, geometry: { type: 'Point', coordinates: [0.43, 46.78] } }],
        }),
        { fileName: 'points.geojson', index: 0 },
      ),
    ];
    const steps = [];
    const progress = [];

    const result = await generateMap(request({ outputPath, layers }), {
      onStep: (message) => steps.push(message),
      onProgress: (event) => progress.push(event),
    });

    const { extent } = request();
    const metadata = await sharp(outputPath).metadata();
    assert.deepEqual([metadata.width, metadata.height], [extent.width, extent.height]);
    assert.deepEqual(result, {
      width: extent.width,
      height: extent.height,
      missing: 0,
      updateDatesMissing: true,
      warnings: [],
    });

    assert.match(steps[0], /^Téléchargement de \d+ tuiles pour « Plan IGN/);
    assert.ok(steps.includes(`Enregistrement dans ${outputPath}…`));
    assert.ok(progress.every(({ sourceId }) => sourceId === BASEMAP.id));
    assert.deepEqual(progress.at(-1), { sourceId: BASEMAP.id, done: extent.tileCount, total: extent.tileCount });
  });

  it('leaves out the outline and the legend when asked to, and says so in its steps', async () => {
    const steps = [];
    await generateMap(request({ outputPath: path.join(tempDir, 'sans-contour.png'), outline: false, legend: false }), {
      onStep: (message) => steps.push(message),
    });
    assert.ok(steps.includes('Ajout de la mention des sources…'));
    assert.ok(!steps.some((message) => message.startsWith('Tracé du contour')));
  });

  it('stops on an aborted signal, before writing anything', async () => {
    const outputPath = path.join(tempDir, 'annulee.png');
    await assert.rejects(
      generateMap(request({ outputPath }), { signal: AbortSignal.abort() }),
      /^Error: Génération annulée\.$/,
    );
    await assert.rejects(access(outputPath));
  });

  it('stops at the next step when aborted once the tiles are downloaded, before writing anything', async () => {
    const outputPath = path.join(tempDir, 'annulee-en-cours.png');
    const controller = new AbortController();
    const steps = [];
    const onStep = (step) => {
      steps.push(step);
      if (step.startsWith('Assemblage')) controller.abort();
    };
    await assert.rejects(
      generateMap(request({ outputPath }), { onStep, signal: controller.signal }),
      /^Error: Génération annulée\.$/,
    );
    assert.equal(steps.at(-1).startsWith('Assemblage'), true, steps.join('\n'));
    await assert.rejects(access(outputPath));
  });
});

describe('generateMap, with the zoning of the PLU', () => {
  // The answers of the Géoportail de l'urbanisme, by the feature type asked for: a PLU approved on
  // 23 January 2020, with one agricultural zone covering the middle of the map.
  function urbanismService(t, { documents = [{ partition: 'DU_86081' }] } = {}) {
    const answers = {
      'wfs_du:doc_urba_com': { features: documents.map((properties) => ({ properties })) },
      'wfs_du:doc_urba': { features: [{ properties: { partition: 'DU_86081', typedoc: 'PLU', datappro: '20200123' } }] },
      'wfs_du:zone_urba': {
        features: [
          {
            properties: { typezone: 'A', libelle: 'Ap', libelong: 'Zone agricole protégée' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0.425, 46.775],
                  [0.44, 46.775],
                  [0.44, 46.785],
                  [0.425, 46.785],
                  [0.425, 46.775],
                ],
              ],
            },
          },
        ],
      },
    };
    const asked = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      const typeName = new URL(url).searchParams.get('TYPENAMES');
      if (!answers[typeName]) throw new Error('Pas de réseau pendant les tests.');
      asked.push(typeName);
      return new Response(JSON.stringify(answers[typeName]), { headers: { 'content-type': 'application/json' } });
    });
    return asked;
  }

  it('reads the zoning before the tiles, then draws it over the basemap', async (t) => {
    const asked = urbanismService(t);
    const outputPath = path.join(tempDir, 'plu.png');
    const steps = [];
    const result = await generateMap(request({ outputPath, mapLayers: [MAP_LAYERS.plu] }), {
      onStep: (message) => steps.push(message),
    });

    assert.deepEqual(asked, ['wfs_du:doc_urba_com', 'wfs_du:doc_urba', 'wfs_du:zone_urba']);
    assert.match(steps[0], /^Lecture de « Zonage du PLU » pour Colombiers/);
    assert.match(steps[1], /1 forme\(s\), 1 étiquette\(s\)/);
    assert.deepEqual(result.warnings, []);

    // The middle of the map is inside the zone: its yellow is laid over the basemap, which is gray.
    const { extent } = request();
    const { data } = await sharp(outputPath)
      .extract({ left: Math.round(extent.width / 2), top: Math.round(extent.height / 2), width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.ok(data[2] < data[0] - 20, `pixel ${[...data]}`);
  });

  it('warns that a municipality without a planning document has no zoning, and still generates the map', async (t) => {
    urbanismService(t, { documents: [] });
    const result = await generateMap(request({ outputPath: path.join(tempDir, 'rnu.png'), mapLayers: [MAP_LAYERS.plu] }));
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^Colombiers n’a pas de document d’urbanisme.*règlement national d’urbanisme/);
  });
});

describe('generateMap, with a layer above its last zoom level', () => {
  it('leaves it out, without asking the service for a single tile, nor crediting it', async (t) => {
    const asked = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
      asked.push(String(url));
      throw new Error('Pas de réseau pendant les tests.');
    });
    // The contour lines stop at zoom 18, and a map at 19 is generated without them: here, the map of the tests is
    // at zoom 14, and the layer made to stop at 13.
    const courbes = { ...MAP_LAYERS.courbes, maxZoom: 13 };
    await generateMap(request({ outputPath: path.join(tempDir, 'sans-courbes.png'), mapLayers: [courbes] }));
    assert.ok(!asked.some((url) => url.includes('ELEVATION.CONTOUR.LINE')), asked.join('\n'));
  });
});

describe('generateMap, with a layer of a WMS', () => {
  it('fails at once, before the tiles, when the service answers an error page, and names the layer', async (t) => {
    // Géorisques on 24 September 2026: a page of MapServer where the image was expected.
    t.mock.method(globalThis, 'fetch', async () => new Response('<HTML>loadLayer(): Unknown identifier.</HTML>', { headers: { 'content-type': 'text/html' } }));
    t.mock.method(globalThis, 'setTimeout', (callback) => callback());
    const steps = [];
    await assert.rejects(
      generateMap(request({ outputPath: path.join(tempDir, 'ppr.png'), mapLayers: [MAP_LAYERS['ppr-mouvements']] }), {
        onStep: (message) => steps.push(message),
      }),
      /^Error: Géorisques ne répond pas pour la couche « PPR mouvements de terrain »/,
    );
    assert.ok(!steps.some((message) => message.startsWith('Téléchargement de') && message.includes('tuiles')), steps.join('\n'));
  });
});

describe('estimateMapFileSize', () => {
  it('estimates the size of the file from a sample of the cached tiles', async () => {
    const { basemap, extent, format, cacheDir: dir, concurrency } = request({ extent: extentFromBbox(BBOX, 13, 0) });
    const size = await estimateMapFileSize({ basemap, extent, format, cacheDir: dir, concurrency });
    assert.ok(size > 0, `${size}`);
  });
});
