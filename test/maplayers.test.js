import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tileUrl } from '../src/core/basemaps.js';
import {
  MAP_LAYERS,
  MapLayerError,
  chooseMapLayers,
  isTileLayer,
  isVectorLayer,
  isWmsLayer,
  mapLayerLegendEntries,
  mapLayerZoomWarning,
} from '../src/core/maplayers.js';

describe('MAP_LAYERS', () => {
  it('describes every layer with what a map and its sources mention need', () => {
    for (const [id, layer] of Object.entries(MAP_LAYERS)) {
      assert.equal(layer.id, id);
      for (const field of ['name', 'description', 'url', 'attribution']) {
        assert.ok(layer[field], `${id} ${field}`);
      }
      // The open licence asks for the freshness of the data: a date read from a catalog, written here, or
      // failing that the day the service was read.
      assert.ok(layer.metadataId || layer.updateDate || layer.datedByConsultation, `${id} date`);
      // A zoom level below which a layer shows less is optional, but never silent.
      if (layer.minZoom !== undefined) {
        assert.ok(layer.minZoom <= layer.maxZoom, id);
        assert.ok(layer.zoomNote, `${id} zoomNote`);
      }
      // A layer laid down as tiles carries measured weight ratios; the others are not sampled at all.
      if (!isTileLayer(layer)) {
        assert.equal(layer.fileSizeRatios, undefined, id);
      } else {
        for (const mode of ['color', 'grayscale']) {
          for (const format of ['png', 'jpg', 'tif']) {
            assert.ok(layer.fileSizeRatios[mode][format] > 0, `${id} ${mode} ${format}`);
          }
        }
      }
      assert.ok(layer.opacity > 0 && layer.opacity <= 1, id);
      // A layer that shows less below its minimum zoom says what is missing.
    }
  });

  it('gives every vector layer the styles and labels its legend needs', () => {
    for (const layer of Object.values(MAP_LAYERS).filter(isVectorLayer)) {
      assert.ok(layer.categoryProperty, layer.id);
      assert.ok(Object.keys(layer.styles).length > 0, layer.id);
      for (const [name, style] of Object.entries(layer.styles)) {
        assert.ok(style.fill, `${layer.id} ${name} fill`);
        assert.ok(style.label, `${layer.id} ${name} label`);
      }
      assert.deepEqual(
        mapLayerLegendEntries(layer, new Set(['Fort'])).map(({ label }) => label),
        [layer.styles.Fort.label],
      );
    }
  });

  it('sorts every layer into one way of getting its drawing', () => {
    for (const layer of Object.values(MAP_LAYERS)) {
      const ways = [isTileLayer(layer), isVectorLayer(layer), isWmsLayer(layer)].filter(Boolean);
      assert.equal(ways.length, 1, layer.id);
      if (isWmsLayer(layer)) assert.ok(layer.wmsLayers, layer.id);
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

describe('layer opacity', () => {
  it('keeps the opacity of the catalog when none is asked for', () => {
    const [layer] = chooseMapLayers(['cadastre']);
    assert.equal(layer.opacity, MAP_LAYERS.cadastre.opacity);
  });

  it('takes the opacity asked for, written with a dot or a comma', () => {
    assert.equal(chooseMapLayers([{ id: 'cadastre', opacity: 0.35 }])[0].opacity, 0.35);
    assert.equal(chooseMapLayers([{ id: 'cadastre', opacity: '0,8' }])[0].opacity, 0.8);
    // The catalog itself is left alone.
    assert.equal(MAP_LAYERS.cadastre.opacity, 0.6);
  });

  it('refuses an opacity outside of what it means', () => {
    for (const opacity of [0, -1, 1.5, 'beaucoup', '']) {
      assert.throws(() => chooseMapLayers([{ id: 'cadastre', opacity }]), /Opacité invalide/, String(opacity));
    }
  });
});

describe('mapLayerZoomWarning', () => {
  it('says what a layer does not show below its zoom level', () => {
    const { cadastre } = MAP_LAYERS;
    assert.match(mapLayerZoomWarning(cadastre, cadastre.minZoom - 1), /sections/);
    assert.equal(mapLayerZoomWarning(cadastre, cadastre.minZoom), undefined);
  });
});
