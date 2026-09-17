import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estimateFileSize, formatBytes, imageMemory } from '../src/core/estimates.js';

describe('imageMemory', () => {
  it('counts three bytes per pixel', () => {
    assert.equal(imageMemory({ width: 10207, height: 7807 }), 239_058_147);
  });
});

describe('estimateFileSize', () => {
  const basemap = { fileSizeRatios: { color: { png: 1, jpg: 0.5, tif: 2 }, grayscale: { png: 0.8, jpg: 0.4, tif: 1 } } };
  const sampleSizes = [1000, 3000];

  it('multiplies the average size of the sampled tiles by the tile count and the ratio', () => {
    assert.equal(estimateFileSize({ basemap, format: 'jpg', tileCount: 100, sampleSizes }), 100_000);
    assert.equal(estimateFileSize({ basemap, format: 'tif', grayscale: true, tileCount: 100, sampleSizes }), 200_000);
  });

  it('returns undefined when the sample is empty', () => {
    assert.equal(estimateFileSize({ basemap, format: 'png', tileCount: 100, sampleSizes: [] }), undefined);
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
