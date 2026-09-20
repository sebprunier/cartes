import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TILE_SIZE, extentFromBbox } from '../src/core/tiles.js';
import {
  VectorLayerError,
  categoriesInTiles,
  readVectorLayer,
  vectorTileShapes,
  vectorTilesInExtent,
} from '../src/core/vectortiles.js';

const COLOMBIERS_BBOX = [0.38344088, 46.75332418, 0.48673916, 46.80743244];
const styleOf = ({ ALEA }) => ({ Fort: { fill: '#c0392b' }, Moyen: { fill: '#e8913c' } })[ALEA];

/** A decoded tile holding one square polygon, given in tile coordinates. */
const tileWith = (x, y, zoom, ring, properties = { ALEA: 'Fort' }) => ({
  x,
  y,
  zoom,
  layers: [{ name: 'rga', extent: 4096, features: [{ shape: 'polygon', properties, rings: [ring] }] }],
});

describe('vectorTilesInExtent', () => {
  it('reads the tiles at the zoom of the map when the data goes that far', () => {
    const extent = extentFromBbox(COLOMBIERS_BBOX, 10, 0.03);
    const { zoom, tiles } = vectorTilesInExtent(extent, 12);
    assert.equal(zoom, 10);
    assert.ok(tiles.length >= 1);
    for (const tile of tiles) assert.equal(tile.zoom, 10);
  });

  it('stops at the zoom of the archive, whose tiles are then drawn larger', () => {
    const extent = extentFromBbox(COLOMBIERS_BBOX, 16, 0.03);
    const { zoom, tiles } = vectorTilesInExtent(extent, 12);
    assert.equal(zoom, 12);
    // The tiles cover the whole image, each one sixteen times wider than at its own zoom level.
    const size = TILE_SIZE * 2 ** (16 - 12);
    const xs = tiles.map(({ x }) => x);
    assert.ok(Math.min(...xs) * size <= extent.xMin);
    assert.ok((Math.max(...xs) + 1) * size >= extent.xMax);
  });
});

describe('vectorTileShapes', () => {
  const extent = extentFromBbox(COLOMBIERS_BBOX, 12, 0.03);
  const tileOf = (ring, properties) => {
    const x = Math.floor(extent.xMin / TILE_SIZE);
    const y = Math.floor(extent.yMin / TILE_SIZE);
    return tileWith(x, y, 12, ring, properties);
  };

  it('places a shape in image pixels, with the area it covers', () => {
    const [shape] = vectorTileShapes([tileOf([[0, 0], [4095, 0], [4095, 4095], [0, 0]])], extent, { styleOf });
    assert.match(shape.path, /^M[\d.,-]+L/);
    assert.ok(shape.path.endsWith('Z'));
    assert.equal(shape.fill, '#c0392b');
    assert.ok(shape.box.width > 0 && shape.box.height > 0);
  });

  it('cuts back the margin of a tile, which its neighbour draws too', () => {
    // A ring going well beyond the tile: what is drawn must stay inside it.
    const tile = tileOf([[-400, -400], [8000, -400], [8000, 8000], [-400, 8000], [-400, -400]]);
    const [shape] = vectorTileShapes([tile], extent, { styleOf });
    const factor = 2 ** (extent.zoom - 12);
    const left = tile.x * TILE_SIZE * factor - extent.xMin;
    assert.ok(shape.box.x >= left - 1, `${shape.box.x} ≥ ${left}`);
    assert.ok(shape.box.width <= TILE_SIZE * factor + 2, `largeur ${shape.box.width}`);
  });

  it('leaves out what has no style, and what falls outside the image', () => {
    const inside = tileOf([[0, 0], [4095, 0], [4095, 4095], [0, 0]]);
    assert.deepEqual(vectorTileShapes([tileOf([[0, 0], [100, 0], [100, 100], [0, 0]], { ALEA: 'Inconnu' })], extent, { styleOf }), []);
    const elsewhere = { ...inside, x: inside.x + 40, y: inside.y + 40 };
    assert.deepEqual(vectorTileShapes([elsewhere], extent, { styleOf }), []);
  });
});

describe('categoriesInTiles', () => {
  const ring = [[0, 0], [10, 0], [10, 10], [0, 0]];

  it('lists the levels really present, so that the legend names only those', () => {
    const layer = { categoryProperty: 'ALEA', styles: { Fort: { fill: '#c0392b' }, Moyen: { fill: '#e8913c' } } };
    const tiles = [tileWith(0, 0, 12, ring, { ALEA: 'Fort' }), tileWith(1, 0, 12, ring, { ALEA: 'Moyen' })];
    assert.deepEqual([...categoriesInTiles(layer, tiles).keys()].sort(), ['Fort', 'Moyen']);
  });

  it('takes the label and the color from the tiles of a layer that has no style table', () => {
    const layer = { color: '#0e4777', opacity: 0.6 };
    const tiles = [tileWith(0, 0, 12, ring, { label: 'Fort', color: '#e9352e', score: 4 })];
    assert.deepEqual([...categoriesInTiles(layer, tiles)], [['Fort', '#e9352e']]);
  });

  // The tiles of a map arrive in no meaningful order, and a legend that reads « moyen, extrême, fort » looks
  // like a mistake even when every line of it is right.
  it('orders the levels by the number the features carry, rather than by the order the tiles arrive in', () => {
    const layer = { color: '#0e4777', opacity: 0.6 };
    const tiles = [
      tileWith(0, 0, 12, ring, { label: 'Très fort', color: '#e9352e', score: 4 }),
      tileWith(1, 0, 12, ring, { label: 'Moyen', color: '#fffd55', score: 2 }),
      tileWith(2, 0, 12, ring, { label: 'Fort', color: '#f7c143', score: 3 }),
    ];
    assert.deepEqual([...categoriesInTiles(layer, tiles).keys()], ['Moyen', 'Fort', 'Très fort']);
  });

  it('keeps the order the tiles give when the features carry no number to order them by', () => {
    const layer = { color: '#0e4777', opacity: 0.6 };
    const tiles = [
      tileWith(0, 0, 12, ring, { label: 'Zone B' }),
      tileWith(1, 0, 12, ring, { label: 'Zone A' }),
    ];
    assert.deepEqual([...categoriesInTiles(layer, tiles).keys()], ['Zone B', 'Zone A']);
  });
});

describe('readVectorLayer, from a template rather than an archive', () => {
  const layer = { url: 'https://exemple.fr/{z}/{x}/{y}.pbf', name: 'Zones humides' };
  const extent = extentFromBbox(COLOMBIERS_BBOX, 15, 0.03);
  // One square polygon, encoded as the service would send it.
  const tile = Uint8Array.from([
    0x1a, 0x2b, 0x0a, 0x03, 0x65, 0x61, 0x75, 0x12, 0x14, 0x12, 0x02, 0x00, 0x00, 0x18, 0x03, 0x22, 0x0c,
    0x09, 0x00, 0x00, 0x1a, 0x06, 0x00, 0xff, 0x3f, 0xff, 0x3f, 0x00, 0x0f, 0x1a, 0x05, 0x6c, 0x61, 0x62,
    0x65, 0x6c, 0x22, 0x06, 0x0a, 0x04, 0x45, 0x61, 0x75, 0x78, 0x28, 0x80, 0x20,
  ]);

  it('reads one address per tile, without a table of contents to consult first', async () => {
    const asked = [];
    const fetchBytes = async (url) => (asked.push(url), tile);
    const tiles = await readVectorLayer(layer, extent, { fetchBytes });
    assert.equal(tiles.length, asked.length);
    assert.ok(asked.length > 1);
    assert.match(asked[0], /^https:\/\/exemple\.fr\/15\/\d+\/\d+\.pbf$/);
    assert.equal(tiles[0].zoom, 15);
  });

  // Nothing in a template says how far its data goes, and a wrong guess would draw an empty layer in silence.
  it('drops a level when the layer holds nothing at the zoom asked for, and draws what it finds larger', async () => {
    const fetchBytes = async (url) => (Number(url.split('/').at(-3)) <= 13 ? tile : null);
    const tiles = await readVectorLayer(layer, extent, { fetchBytes });
    assert.ok(tiles.length > 0);
    for (const read of tiles) assert.equal(read.zoom, 13);
    // Once a level answers, the whole map is read at that level, and each tile is asked for once.
    const expected = vectorTilesInExtent(extent, 13).tiles.length;
    assert.equal(tiles.length, expected);
    assert.equal(new Set(tiles.map(({ x, y }) => `${x}/${y}`)).size, expected);
  });

  // A service we do not own may throttle us, and a map must not be lost to a stack trace over it.
  it('stops with something to act on when a service refuses tile after tile', async () => {
    const fetchBytes = async () => {
      throw Object.assign(new Error('HTTP 429'), { status: 429 });
    };
    await assert.rejects(() => readVectorLayer(layer, extent, { fetchBytes }), (error) => {
      assert.ok(error instanceof VectorLayerError);
      assert.match(error.message, /Zones humides.*limite le nombre de requêtes/s);
      return true;
    });
  });

  it('leaves a hole for one tile a service refuses, rather than losing the map', async () => {
    let asked = 0;
    const fetchBytes = async () => {
      if (++asked === 2) throw new Error('HTTP 500');
      return tile;
    };
    const tiles = await readVectorLayer(layer, extent, { fetchBytes });
    assert.ok(tiles.length > 1);
  });

  // The question « does this level hold anything » is put to a handful of tiles, never to the whole map: at
  // zoom 18 a municipality is thousands of tiles, and a service we do not own owes us none of them.
  it('asks only a sample of the map before dropping a level', async () => {
    let asked = 0;
    const fetchBytes = async () => (asked++, null);
    assert.deepEqual(await readVectorLayer(layer, extent, { fetchBytes }), []);
    assert.ok(asked < vectorTilesInExtent(extent, extent.zoom).tiles.length, `${asked} requêtes`);
  });
});
