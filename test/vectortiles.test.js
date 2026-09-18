import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TILE_SIZE, extentFromBbox } from '../src/core/tiles.js';
import { categoriesInTiles, vectorTileShapes, vectorTilesInExtent } from '../src/core/vectortiles.js';

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
  it('lists the levels really present, so that the legend names only those', () => {
    const layer = { categoryProperty: 'ALEA' };
    const tiles = [
      tileWith(0, 0, 12, [[0, 0], [10, 0], [10, 10], [0, 0]], { ALEA: 'Fort' }),
      tileWith(1, 0, 12, [[0, 0], [10, 0], [10, 10], [0, 0]], { ALEA: 'Moyen' }),
    ];
    assert.deepEqual([...categoriesInTiles(layer, tiles)].sort(), ['Fort', 'Moyen']);
  });
});
