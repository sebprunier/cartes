import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { estimateFileSize, formatBytes, imageMemory } from '../src/estimates.js';

describe('imageMemory', () => {
  it('counts three bytes per pixel', () => {
    assert.equal(imageMemory({ width: 10207, height: 7807 }), 239_058_147);
  });
});

describe('estimateFileSize', () => {
  const basemap = { fileSizeRatios: { color: { png: 1, jpg: 0.5, tif: 2 }, grayscale: { png: 0.8, jpg: 0.4, tif: 1 } } };
  let tempDir;
  let sampledTiles;

  before(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'cartes-test-'));
    sampledTiles = [{ path: null }];
    for (const [name, size] of [['a', 1000], ['b', 3000]]) {
      const tilePath = path.join(tempDir, `${name}.tile`);
      await writeFile(tilePath, Buffer.alloc(size));
      sampledTiles.push({ path: tilePath });
    }
  });

  after(() => rm(tempDir, { recursive: true, force: true }));

  it('multiplies the average size of the available sampled tiles by the tile count and the ratio', async () => {
    assert.equal(await estimateFileSize({ basemap, format: 'jpg', tileCount: 100, sampledTiles }), 100_000);
    assert.equal(await estimateFileSize({ basemap, format: 'tif', grayscale: true, tileCount: 100, sampledTiles }), 200_000);
  });

  it('returns undefined when no sampled tile is available', async () => {
    assert.equal(await estimateFileSize({ basemap, format: 'png', tileCount: 100, sampledTiles: [{ path: null }] }), undefined);
  });
});

describe('formatBytes', () => {
  it('writes sizes in Ko, Mo or Go', () => {
    assert.equal(formatBytes(400), '1 Ko');
    assert.equal(formatBytes(937_000), '937 Ko');
    assert.equal(formatBytes(3_700_000), '3.7 Mo');
    assert.equal(formatBytes(239_058_147), '239 Mo');
    assert.equal(formatBytes(3_800_000_000), '3.8 Go');
  });
});
