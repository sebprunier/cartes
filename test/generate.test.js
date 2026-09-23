import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import sharp from 'sharp';

import { BASEMAPS } from '../src/core/basemaps.js';
import { readLayer } from '../src/core/layers.js';
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
    assert.deepEqual(result, { width: extent.width, height: extent.height, missing: 0, updateDatesMissing: true });

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
});

describe('estimateMapFileSize', () => {
  it('estimates the size of the file from a sample of the cached tiles', async () => {
    const { basemap, extent, format, cacheDir: dir, concurrency } = request({ extent: extentFromBbox(BBOX, 13, 0) });
    const size = await estimateMapFileSize({ basemap, extent, format, cacheDir: dir, concurrency });
    assert.ok(size > 0, `${size}`);
  });
});
