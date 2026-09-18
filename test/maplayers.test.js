import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tileUrl } from '../src/core/basemaps.js';
import { MAP_LAYERS, MapLayerError, chooseMapLayers, mapLayerZoomWarning } from '../src/core/maplayers.js';

describe('MAP_LAYERS', () => {
  it('describes every layer with what a map and its sources mention need', () => {
    for (const [id, layer] of Object.entries(MAP_LAYERS)) {
      assert.equal(layer.id, id);
      for (const field of ['name', 'description', 'url', 'attribution', 'metadataId']) {
        assert.ok(layer[field], `${id} ${field}`);
      }
      assert.ok(layer.minZoom <= layer.maxZoom, id);
      assert.ok(layer.opacity > 0 && layer.opacity <= 1, id);
      // A layer that shows less below its minimum zoom says what is missing.
      assert.ok(layer.zoomNote, id);
    }
  });

  it('builds the address of a tile as a basemap does', () => {
    const url = tileUrl(MAP_LAYERS.cadastre, 16, 32845, 23111);
    assert.match(url, /TILEMATRIX=16&TILEROW=23111&TILECOL=32845$/);
    assert.ok(!url.includes('{'));
  });
});

describe('chooseMapLayers', () => {
  it('returns the layers asked for, in the order of the catalog', () => {
    assert.deepEqual(chooseMapLayers([]), []);
    assert.deepEqual(
      chooseMapLayers(['cadastre']).map(({ id }) => id),
      ['cadastre'],
    );
  });

  it('names the unknown layers and lists the available ones', () => {
    assert.throws(() => chooseMapLayers(['parcelles']), (error) => {
      assert.ok(error instanceof MapLayerError);
      assert.match(error.message, /Couche inconnue : parcelles/);
      assert.match(error.message, /cadastre/);
      return true;
    });
  });
});

describe('mapLayerZoomWarning', () => {
  it('says what a layer does not show below its zoom level', () => {
    const { cadastre } = MAP_LAYERS;
    assert.match(mapLayerZoomWarning(cadastre, cadastre.minZoom - 1), /sections/);
    assert.equal(mapLayerZoomWarning(cadastre, cadastre.minZoom), undefined);
  });
});
