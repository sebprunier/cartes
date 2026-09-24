import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estimateFileSize, formatBytes, imageMemory } from '../src/core/estimates.js';

describe('imageMemory', () => {
  it('counts three bytes per pixel', () => {
    assert.equal(imageMemory({ width: 10207, height: 7807 }), 239_058_147);
  });
});

describe('estimateFileSize', () => {
  const basemap = {
    fileSizeRatios: {
      color: { png: 1, pngPalette: 0.45, jpg: 0.5, tif: 2 },
      grayscale: { png: 0.8, pngPalette: 0.45, jpg: 0.4, tif: 1 },
    },
  };
  const sampleSizes = [1000, 3000];

  it('multiplies the average size of the sampled tiles by the tile count and the ratio', () => {
    assert.equal(estimateFileSize({ basemap, format: 'jpg', tileCount: 100, sampleSizes }), 100_000);
    assert.equal(estimateFileSize({ basemap, format: 'tif', grayscale: true, tileCount: 100, sampleSizes }), 200_000);
  });

  it('adds the weight of the layers laid over the basemap', () => {
    const layer = {
      minZoom: 16,
      fileSizeRatios: { color: { png: 0.5, jpg: 0.3, tif: 1 }, grayscale: { png: 0.5, jpg: 0.3, tif: 1 } },
    };
    const withoutLayer = estimateFileSize({ basemap, format: 'png', tileCount: 100, sampleSizes });
    const withLayer = estimateFileSize({
      basemap,
      format: 'png',
      zoom: 16,
      tileCount: 100,
      sampleSizes,
      layers: [{ layer, sampleSizes: [2000] }],
    });
    assert.equal(withLayer - withoutLayer, 100 * 2000 * 0.5);
  });

  it('counts a layer for less below the zoom where it shows everything', () => {
    const layer = { minZoom: 16, fileSizeRatios: { color: { png: 0.5 }, grayscale: { png: 0.5 } } };
    const request = { basemap, format: 'png', tileCount: 100, sampleSizes, layers: [{ layer, sampleSizes: [2000] }] };
    const below = estimateFileSize({ ...request, zoom: 15 });
    const above = estimateFileSize({ ...request, zoom: 16 });
    assert.ok(below < above, `${below} < ${above}`);
  });

  it('counts nothing for a layer above the last zoom level its service publishes', () => {
    const layer = { maxZoom: 18, fileSizeRatios: { color: { png: 0.5 }, grayscale: { png: 0.5 } } };
    const request = { basemap, format: 'png', tileCount: 100, sampleSizes, layers: [{ layer, sampleSizes: [2000] }] };
    const without = estimateFileSize({ ...request, layers: [], zoom: 19 });
    assert.equal(estimateFileSize({ ...request, zoom: 19 }), without);
    assert.ok(estimateFileSize({ ...request, zoom: 18 }) > without);
  });

  it('ignores a layer whose sample could not be downloaded', () => {
    const layer = { fileSizeRatios: { color: { png: 0.5 }, grayscale: { png: 0.5 } } };
    assert.equal(
      estimateFileSize({ basemap, format: 'png', tileCount: 100, sampleSizes, layers: [{ layer, sampleSizes: [] }] }),
      estimateFileSize({ basemap, format: 'png', tileCount: 100, sampleSizes }),
    );
  });

  it('uses the palette ratio when the PNG is written with a color palette', () => {
    assert.equal(estimateFileSize({ basemap, format: 'png', tileCount: 100, sampleSizes }), 200_000);
    assert.equal(estimateFileSize({ basemap, format: 'png', palette: true, tileCount: 100, sampleSizes }), 90_000);
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
