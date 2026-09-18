import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readVectorTile } from '../src/core/mvt.js';

// --- A minimal protobuf writer, to build a tile the way a real one is written ---
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
const field = (number, wire) => varint((number << 3) | wire);
const message = (number, content) => [...field(number, 2), ...varint(content.length), ...content];
const string = (number, value) => message(number, [...new TextEncoder().encode(value)]);
const number = (fieldNumber, value) => [...field(fieldNumber, 0), ...varint(value)];
const zigzag = (value) => (value < 0 ? -value * 2 - 1 : value * 2);
const command = (id, count) => varint((count << 3) | id);

/** A tile with one layer, one polygon carrying one property. */
function tile({ name = 'rga', extent = 4096, alea = 'Fort', ring = [[10, 10], [20, 10], [20, 20]] } = {}) {
  const geometry = [
    ...command(1, 1),
    ...varint(zigzag(ring[0][0])),
    ...varint(zigzag(ring[0][1])),
    ...command(2, ring.length - 1),
    ...ring.slice(1).flatMap((point, index) => [
      ...varint(zigzag(point[0] - ring[index][0])),
      ...varint(zigzag(point[1] - ring[index][1])),
    ]),
    ...command(7, 1),
  ];
  const feature = [...message(2, [0, 0]), ...number(3, 3), ...message(4, geometry)];
  const layer = [
    ...number(15, 2),
    ...string(1, name),
    ...message(2, feature),
    ...string(3, 'ALEA'),
    ...message(4, string(1, alea)),
    ...number(5, extent),
  ];
  return new Uint8Array(message(3, layer));
}

describe('readVectorTile', () => {
  it('reads the layers, their features and their properties', () => {
    const [layer] = readVectorTile(tile());
    assert.equal(layer.name, 'rga');
    assert.equal(layer.extent, 4096);
    assert.equal(layer.features.length, 1);
    assert.equal(layer.features[0].shape, 'polygon');
    assert.deepEqual(layer.features[0].properties, { ALEA: 'Fort' });
  });

  it('follows the drawing commands, whose points are written as differences', () => {
    const [layer] = readVectorTile(tile({ ring: [[10, 10], [20, 10], [20, 20]] }));
    // The closing command brings the ring back to its first point.
    assert.deepEqual(layer.features[0].rings, [[[10, 10], [20, 10], [20, 20], [10, 10]]]);
  });

  it('reads a geometry that goes beyond the tile, where its margin holds a shape cut by the edge', () => {
    const [layer] = readVectorTile(tile({ ring: [[-30, -30], [4200, -30], [4200, 4200]] }));
    const points = layer.features[0].rings[0];
    assert.deepEqual(points[0], [-30, -30]);
    assert.deepEqual(points[2], [4200, 4200]);
  });

  it('gives an empty result for bytes that hold no layer', () => {
    assert.deepEqual(readVectorTile(new Uint8Array(0)), []);
  });
});
