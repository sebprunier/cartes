import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BASEMAPS, canUsePalette, tileUrl } from '../src/core/basemaps.js';

describe('tileUrl', () => {
  it('fills the zoom level and tile indices', () => {
    assert.match(tileUrl(BASEMAPS['plan-ign'], 17, 65687, 46224), /TILEMATRIX=17&TILEROW=46224&TILECOL=65687$/);
    assert.match(tileUrl(BASEMAPS['ortho-ign'], 17, 65687, 46224), /LAYER=ORTHOIMAGERY\.ORTHOPHOTOS&.*TILECOL=65687$/);
  });
});

describe('BASEMAPS', () => {
  it('produces JPEG for photographs and PNG for maps by default', () => {
    assert.deepEqual(
      Object.fromEntries(Object.values(BASEMAPS).map((basemap) => [basemap.id, basemap.outputFormat])),
      { 'plan-ign': 'png', 'ortho-ign': 'jpg' },
    );
  });
});

describe('canUsePalette', () => {
  it('allows a palette for a map written in PNG, and never for a photograph', () => {
    assert.equal(canUsePalette(BASEMAPS['plan-ign'], 'png'), true);
    assert.equal(canUsePalette(BASEMAPS['plan-ign'], 'jpg'), false);
    assert.equal(canUsePalette(BASEMAPS['ortho-ign'], 'png'), false);
  });

  it('comes with a measured ratio wherever it is allowed', () => {
    for (const basemap of Object.values(BASEMAPS)) {
      if (!canUsePalette(basemap, 'png')) continue;
      for (const mode of ['color', 'grayscale']) {
        assert.ok(basemap.fileSizeRatios[mode].pngPalette > 0, `${basemap.id} ${mode}`);
      }
    }
  });
});

describe('metadata ids', () => {
  it('identify the dataset of every basemap in the Géoplateforme catalog', () => {
    for (const basemap of Object.values(BASEMAPS)) assert.match(basemap.metadataId, /^IGNF_/, basemap.id);
  });
});

describe('file size ratios', () => {
  it('are defined for every basemap, in color and grayscale, and every output format', () => {
    for (const basemap of Object.values(BASEMAPS)) {
      for (const mode of ['color', 'grayscale']) {
        for (const format of ['png', 'jpg', 'tif']) {
          assert.ok(basemap.fileSizeRatios[mode][format] > 0, `${basemap.id} ${mode} ${format}`);
        }
      }
    }
  });
});
