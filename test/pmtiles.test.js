import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PmtilesError, readDirectoryBytes, readHeader, tileId } from '../src/core/pmtiles.js';

/** The 127 bytes of a header, filled with what the reader looks at. */
function header({ version = 3, magic = 'PMTiles', tileType = 1, minZoom = 4, maxZoom = 12 } = {}) {
  const bytes = new Uint8Array(127);
  bytes.set(new TextEncoder().encode(magic).subarray(0, 7), 0);
  bytes[7] = version;
  const view = new DataView(bytes.buffer);
  view.setBigUint64(8, 127n, true); // root directory offset
  view.setBigUint64(16, 50n, true); // root directory length
  bytes[97] = 2; // internal compression: gzip
  bytes[98] = 2; // tile compression: gzip
  bytes[99] = tileType;
  bytes[100] = minZoom;
  bytes[101] = maxZoom;
  return bytes;
}

const varint = (value) => {
  const bytes = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
};

describe('readHeader', () => {
  it('reads where the directories and the tiles are', () => {
    const read = readHeader(header());
    assert.equal(read.rootOffset, 127);
    assert.equal(read.rootLength, 50);
    assert.deepEqual([read.minZoom, read.maxZoom], [4, 12]);
  });

  it('refuses a file that is not a PMTiles archive, or one it cannot read', () => {
    assert.throws(() => readHeader(header({ magic: 'GeoJSON' })), /n’est pas une archive PMTiles/);
    assert.throws(() => readHeader(header({ version: 2 })), /version 2/);
    assert.throws(() => readHeader(header({ tileType: 2 })), /tuiles vectorielles/);
  });
});

describe('readDirectoryBytes', () => {
  it('reads the entries, whose identifiers and offsets follow each other', () => {
    const bytes = new Uint8Array([
      ...varint(3), // three entries
      ...varint(5), ...varint(2), ...varint(10), // identifiers 5, 7 and 17, written as differences
      ...varint(1), ...varint(1), ...varint(0), // run lengths: the last one points to a leaf directory
      ...varint(100), ...varint(200), ...varint(300), // lengths
      ...varint(1), ...varint(0), ...varint(901), // offsets: 0 means « right after the previous one »
    ]);
    assert.deepEqual(readDirectoryBytes(bytes), [
      { tileId: 5, runLength: 1, length: 100, offset: 0 },
      { tileId: 7, runLength: 1, length: 200, offset: 100 },
      { tileId: 17, runLength: 0, length: 300, offset: 900 },
    ]);
  });
});

describe('tileId', () => {
  it('numbers the tiles along the Hilbert curve, zoom level after zoom level', () => {
    assert.equal(tileId(0, 0, 0), 0);
    assert.deepEqual([tileId(1, 0, 0), tileId(1, 0, 1), tileId(1, 1, 1), tileId(1, 1, 0)], [1, 2, 3, 4]);
    assert.equal(tileId(2, 0, 0), 5); // The first tile of a zoom follows the last of the one before.
  });

  it('keeps neighbouring tiles close together, which is the point of the curve', () => {
    const middle = tileId(12, 2052, 1444);
    for (const [x, y] of [[2053, 1444], [2052, 1445], [2051, 1444]]) {
      assert.ok(Math.abs(tileId(12, x, y) - middle) < 64, `${x},${y}`);
    }
  });
});
