import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { HttpError } from '../src/core/http.js';
import { cachedTileLoader } from '../src/node/cache.js';
import {
  TILE_SIZE,
  downloadTiles,
  extentFromBbox,
  groundResolution,
  lonLatToPixel,
  sampleTiles,
  tilesInExtent,
} from '../src/core/tiles.js';

// Bounding box of Colombiers (86081), as returned by ADMIN EXPRESS.
const COLOMBIERS_BBOX = [0.38344088, 46.75332418, 0.48673916, 46.80743244];

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

describe('lonLatToPixel', () => {
  it('places the origin at the center of the world image', () => {
    assert.deepEqual(lonLatToPixel(0, 0, 0), [128, 128]);
  });

  it('places the top left corner of the Web Mercator world at (0, 0)', () => {
    const [x, y] = lonLatToPixel(-180, 85.0511287798066, 3);
    assert.equal(x, 0);
    assert.ok(Math.abs(y) < 1e-6);
  });

  it('doubles the coordinates at each zoom level', () => {
    const [x10, y10] = lonLatToPixel(0.43, 46.77, 10);
    const [x11, y11] = lonLatToPixel(0.43, 46.77, 11);
    assert.ok(Math.abs(x11 - 2 * x10) < 1e-6);
    assert.ok(Math.abs(y11 - 2 * y10) < 1e-6);
  });
});

describe('groundResolution', () => {
  it('matches the Web Mercator resolution at the equator', () => {
    assert.ok(Math.abs(groundResolution(0, 0) - 156543.03) < 0.01);
  });

  it('decreases with the cosine of the latitude', () => {
    assert.ok(Math.abs(groundResolution(60, 10) - groundResolution(0, 10) / 2) < 1e-9);
  });
});

describe('extentFromBbox', () => {
  it('computes the image size and the tiles to download', () => {
    const extent = extentFromBbox(COLOMBIERS_BBOX, 17, 0.03);
    assert.equal(extent.width, 10207);
    assert.equal(extent.height, 7807);
    assert.equal(extent.tileCount, 1271);
  });

  it('lists tiles covering exactly the pixel window', () => {
    const extent = extentFromBbox(COLOMBIERS_BBOX, 14, 0.03);
    const tiles = [...tilesInExtent(extent)];
    assert.equal(tiles.length, extent.tileCount);
    assert.equal(tiles[0].x, Math.floor(extent.xMin / TILE_SIZE));
    assert.equal(tiles[0].y, Math.floor(extent.yMin / TILE_SIZE));
    assert.equal(tiles.at(-1).x, Math.floor((extent.xMax - 1) / TILE_SIZE));
    assert.equal(tiles.at(-1).y, Math.floor((extent.yMax - 1) / TILE_SIZE));
  });

  it('adds the margin on each side', () => {
    const withoutMargin = extentFromBbox(COLOMBIERS_BBOX, 17);
    const withMargin = extentFromBbox(COLOMBIERS_BBOX, 17, 0.1);
    assert.ok(Math.abs(withMargin.width - withoutMargin.width * 1.2) <= 2);
    assert.ok(Math.abs(withMargin.height - withoutMargin.height * 1.2) <= 2);
  });
});

describe('sampleTiles', () => {
  it('takes the tile at the center of each cell of the grid', () => {
    const extent = { tiles: { xMin: 100, yMin: 200, xMax: 111, yMax: 205 } }; // 12 × 6 tiles
    const tiles = sampleTiles(extent, 3);
    assert.equal(tiles.length, 9);
    assert.deepEqual(tiles.slice(0, 3), [
      { x: 102, y: 201 },
      { x: 106, y: 201 },
      { x: 110, y: 201 },
    ]);
    assert.deepEqual(tiles.at(-1), { x: 110, y: 205 });
  });

  it('takes all the tiles in a direction with fewer tiles than the grid', () => {
    const extent = { tiles: { xMin: 0, yMin: 0, xMax: 1, yMax: 9 } }; // 2 × 10 tiles
    const tiles = sampleTiles(extent, 6);
    assert.equal(tiles.length, 12);
    assert.deepEqual(new Set(tiles.map((tile) => tile.x)), new Set([0, 1]));
  });
});

describe('downloadTiles', () => {
  // 4 × 4 tiles at zoom 4.
  const extent = { zoom: 4, tiles: { xMin: 0, yMin: 0, xMax: 3, yMax: 3 } };
  const basemap = { id: 'test' };
  let server;
  let respond;
  let requests;
  let cacheDir;

  before(async () => {
    server = http.createServer((req, res) => {
      requests.push(req.url);
      const status = respond(req.url, requests.filter((url) => url === req.url).length);
      if (status === 200) {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(PNG_1PX);
      } else {
        res.writeHead(status, { 'content-type': 'text/plain' });
        res.end('error');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    basemap.url = `http://127.0.0.1:${server.address().port}/{z}/{x}/{y}`;
  });

  after(() => server.close());

  beforeEach(async () => {
    requests = [];
    cacheDir = await mkdtemp(path.join(tmpdir(), 'cartes-test-'));
  });

  afterEach(() => rm(cacheDir, { recursive: true, force: true }));

  const download = () =>
    downloadTiles(basemap, extent.zoom, [...tilesInExtent(extent)], {
      loadTile: cachedTileLoader({ cacheDir, basemapId: basemap.id, zoom: extent.zoom, retryDelayMs: 1 }),
      concurrency: 3,
    });

  it('downloads the tiles into the cache and reuses them', async () => {
    respond = () => 200;
    const tiles = await download();
    assert.equal(tiles.length, 16);
    assert.ok(tiles.every((tile) => tile.content && existsSync(tile.content)));
    assert.equal(requests.length, 16);

    await download();
    assert.equal(requests.length, 16);
  });

  it('retries transient errors', async () => {
    respond = (url, count) => (count === 1 ? 400 : 200);
    const tiles = await download();
    assert.ok(tiles.every((tile) => tile.content && !tile.error));
  });

  it('considers a tile missing when it keeps answering 404', async () => {
    respond = (url) => (url === '/4/1/2' ? 404 : 200);
    const tiles = await download();
    const missing = tiles.find((tile) => tile.x === 1 && tile.y === 2);
    assert.equal(missing.content, null);
    assert.equal(missing.error, undefined);
    assert.equal(requests.filter((url) => url === '/4/1/2').length, 2);
  });

  it('reports a tile that keeps failing without stopping the others', async () => {
    respond = (url) => (url === '/4/3/0' ? 500 : 200);
    const tiles = await download();
    const failed = tiles.filter((tile) => tile.error);
    assert.equal(failed.length, 1);
    assert.ok(failed[0].error instanceof HttpError);
    assert.equal(failed[0].error.status, 500);
    assert.equal(tiles.filter((tile) => tile.content).length, 15);
  });

  it('aborts when too many tiles fail in a row', async () => {
    respond = () => 503;
    await assert.rejects(download(), (error) => {
      assert.match(error.message, /Téléchargement interrompu/);
      assert.ok(error.cause instanceof HttpError);
      return true;
    });
    const requestCount = requests.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(requests.length, requestCount);
  });
});
