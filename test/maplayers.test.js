import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tileUrl } from '../src/core/basemaps.js';
import {
  MAP_LAYERS,
  MAP_LAYER_THEMES,
  MapLayerError,
  checkMapLayer,
  chooseMapLayers,
  customMapLayer,
  drawnAtZoom,
  forgetVintages,
  resolveMapLayers,
  isCustomLayer,
  isTileLayer,
  isUrbanismLayer,
  isVectorLayer,
  isWmsLayer,
  mapLayerLegendEntries,
  mapLayerZoomWarning,
  mapLayersByTheme,
  vectorStyleOf,
} from '../src/core/maplayers.js';

describe('MAP_LAYERS', () => {
  it('describes every layer with what a map and its sources mention need', () => {
    for (const [id, layer] of Object.entries(MAP_LAYERS)) {
      assert.equal(layer.id, id);
      for (const field of ['name', 'description', 'attribution']) {
        assert.ok(layer[field], `${id} ${field}`);
      }
      // The zoning is read by municipality from a service of its own, and dated by its documents.
      if (isUrbanismLayer(layer)) continue;
      assert.ok(layer.url, `${id} url`);
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
      // A legend declared by a layer of tiles says what its lines stand for, in their color.
      for (const entry of layer.legend ?? []) {
        assert.ok(entry.label && /^#[0-9a-f]{6}$/.test(entry.color) && ['line', 'point', 'polygon'].includes(entry.shape), id);
      }
      // A layer published by vintage lists them, and says what happens where none covers the municipality.
      if (layer.url?.includes('{vintage}')) assert.ok(layer.vintages?.length > 0 && layer.vintageNote, `${id} vintages`);
      // A layer whose service stops before the last zoom level of the maps says what then happens.
      if (layer.maxZoom < 19) assert.ok(layer.maxZoomNote, `${id} maxZoomNote`);
      // A layer that shows less below its minimum zoom says what is missing.
    }
  });

  it('sorts every layer into a theme, and names who publishes it', () => {
    const themes = MAP_LAYER_THEMES.map(({ id }) => id);
    for (const layer of Object.values(MAP_LAYERS)) {
      assert.ok(themes.includes(layer.theme), `${layer.id} theme`);
      assert.ok(layer.provider, `${layer.id} provider`);
      // The zoom a layer needs is shown apart, beside the description: it is not repeated in it.
      assert.doesNotMatch(layer.description, /zoom/i, layer.id);
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
      const ways = [isTileLayer(layer), isVectorLayer(layer), isWmsLayer(layer), isUrbanismLayer(layer)].filter(Boolean);
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

  it('says that a layer is left out above the last zoom level its service publishes', () => {
    // No layer of the catalog stops before zoom 19 any more: those that could have are drawn larger instead.
    const layer = { name: 'Relevés', maxZoom: 18, maxZoomNote: 'Au zoom 19, le service n’en publie pas.' };
    assert.equal(mapLayerZoomWarning(layer, 18), undefined);
    assert.equal(mapLayerZoomWarning(layer, 19), 'Relevés : Au zoom 19, le service n’en publie pas.');
    assert.ok(drawnAtZoom(layer, 18));
    assert.ok(!drawnAtZoom(layer, 19));
    for (const each of Object.values(MAP_LAYERS)) assert.ok(drawnAtZoom(each, 19), each.id);
  });
});

const TEMPLATE = 'https://exemple.fr/tuiles/{z}/{x}/{y}.pbf';
const CUSTOM = { url: TEMPLATE, name: 'Zones humides', attribution: '© Syndicat de bassin' };

describe('customMapLayer', () => {
  it('builds a layer the rest of the tool handles like any other', () => {
    const layer = customMapLayer(CUSTOM);
    assert.equal(layer.name, 'Zones humides');
    assert.equal(layer.attribution, '© Syndicat de bassin');
    assert.equal(layer.opacity, 0.6);
    assert.equal(layer.provider, 'exemple.fr');
    assert.ok(isCustomLayer(layer));
    assert.equal(tileUrl(layer, 14, 8210, 5780), 'https://exemple.fr/tuiles/14/8210/5780.pbf');
  });

  // The two are drawn by different code: images are laid down as they come, vector tiles are ours to draw.
  it('tells vector tiles from images by the address, so that nothing has to be declared', () => {
    assert.ok(isVectorLayer(customMapLayer(CUSTOM)));
    assert.ok(isTileLayer(customMapLayer({ ...CUSTOM, url: 'https://exemple.fr/{z}/{x}/{y}.png' })));
    assert.ok(isTileLayer(customMapLayer({ ...CUSTOM, url: 'https://exemple.fr/{z}/{x}/{y}?format=png' })));
  });

  it('gives the same address the same identifier, so that a layer added twice stays one layer', () => {
    assert.equal(customMapLayer(CUSTOM).id, customMapLayer({ ...CUSTOM, opacity: 0.2 }).id);
    assert.equal(customMapLayer({ ...CUSTOM, name: 'Zones humides' }).id, 'perso-zones-humides');
  });

  it('says which part of the address is missing, rather than failing later on a tile', () => {
    assert.throws(() => customMapLayer({ ...CUSTOM, url: 'https://exemple.fr/{z}/{x}.pbf' }), (error) => {
      assert.ok(error instanceof MapLayerError);
      assert.match(error.message, /\{y\}/);
      return true;
    });
    assert.throws(() => customMapLayer({ ...CUSTOM, url: 'pas une adresse/{z}/{x}/{y}' }), /invalide/);
  });

  it('refuses a layer with no name, and one with no source', () => {
    assert.throws(() => customMapLayer({ ...CUSTOM, name: '  ' }), /Nom de couche manquant/);
    // Citing the source is a licence obligation, not an ornament: it cannot be skipped.
    assert.throws(() => customMapLayer({ ...CUSTOM, attribution: '' }), /Source manquante/);
  });

  it('refuses a zoom that is not one', () => {
    assert.throws(() => customMapLayer({ ...CUSTOM, dataMaxZoom: 'profond' }), /zoom maximal invalide/i);
    assert.equal(customMapLayer({ ...CUSTOM, dataMaxZoom: '16' }).dataMaxZoom, 16);
    assert.equal(customMapLayer({ ...CUSTOM, dataMaxZoom: '' }).dataMaxZoom, undefined);
  });

  it('takes the colors of a layer from its tiles, which carry them, and falls back on one color', () => {
    const style = vectorStyleOf(customMapLayer(CUSTOM));
    assert.deepEqual(style({ label: 'Fort', color: '#e9352e' }), { fill: '#e9352e', fillOpacity: 0.6 });
    assert.equal(style({ label: 'Fort' }).fill, customMapLayer(CUSTOM).color);
  });

  it('names its legend after what its tiles hold, and after the layer when they name nothing', () => {
    const layer = customMapLayer(CUSTOM);
    assert.deepEqual(mapLayerLegendEntries(layer, new Map([['Fort', '#e9352e']])), [
      { label: 'Fort', color: '#e9352e', shape: 'polygon' },
    ]);
    assert.deepEqual(mapLayerLegendEntries(layer, new Map()), [
      { label: 'Zones humides', color: layer.color, shape: 'polygon' },
    ]);
  });
});

describe('chooseMapLayers, with a layer of its own', () => {
  it('keeps the layers of the catalog first, then those added', () => {
    const chosen = chooseMapLayers([CUSTOM, 'cadastre']);
    assert.deepEqual(chosen.map(({ id }) => id), ['cadastre', 'perso-zones-humides']);
  });

  it('does not take an address for an unknown identifier', () => {
    assert.throws(() => chooseMapLayers(['parcelles', CUSTOM]), /Couche inconnue : parcelles/);
  });
});

describe('checkMapLayer', () => {
  const layer = customMapLayer(CUSTOM);
  const place = { lon: 0.4076, lat: 46.7397, zoom: 16 };

  it('stops at the first tile that answers, rather than downloading to find out', async () => {
    const answers = [];
    const fetchBytes = async (url) => (answers.push(url), new Uint8Array([1]));
    assert.deepEqual(await checkMapLayer(layer, place, { fetchBytes }), { empty: false, missing: false });
    assert.equal(answers.length, 1);
  });

  // A service answers an empty tile past its own detail, and a layer is legitimately empty over part of a
  // territory: neither means the address is wrong.
  it('walks down a few levels before concluding anything', async () => {
    const fetchBytes = async (url) => (Number(url.split('/').at(-3)) <= 13 ? new Uint8Array([1]) : null);
    assert.deepEqual(await checkMapLayer(layer, place, { fetchBytes }), { empty: false, missing: false });
  });

  // A service that knows the tile and leaves it empty is a layer that stops short; one that knows none of the
  // addresses tried is, almost always, an address that was mistyped. Only the second is worth doubting.
  it('tells a layer that has nothing here from an address the service does not know', async () => {
    assert.deepEqual(await checkMapLayer(layer, place, { fetchBytes: async () => new Uint8Array() }), {
      empty: true,
      missing: false,
    });
    assert.deepEqual(await checkMapLayer(layer, place, { fetchBytes: async () => null }), {
      empty: true,
      missing: true,
    });
  });

  it('turns a service that refuses into something the user can act on', async () => {
    const fetchBytes = async () => {
      throw new Error('HTTP 403 pour https://exemple.fr/tuiles/16/0/0.pbf');
    };
    await assert.rejects(() => checkMapLayer(layer, place, { fetchBytes }), (error) => {
      assert.ok(error instanceof MapLayerError);
      assert.match(error.message, /Zones humides.*403/s);
      return true;
    });
  });
});

describe('mapLayersByTheme', () => {
  it('groups the layers in the order of the themes, keeping their own order and leaving empty themes out', () => {
    const layers = [
      { id: 'a', theme: 'risques' },
      { id: 'b', theme: 'urbanisme' },
      { id: 'c', theme: 'risques' },
    ];
    assert.deepEqual(
      mapLayersByTheme(layers).map(({ theme, layers: inTheme }) => [theme.id, inTheme.map(({ id }) => id)]),
      [
        ['urbanisme', ['b']],
        ['risques', ['a', 'c']],
      ],
    );
  });
});

describe('resolveMapLayers', () => {
  const layer = { ...MAP_LAYERS.artificialisation };
  const COLOMBIERS = [0.4267, 46.7721];

  it('gives a layer published by vintage the most recent one the place has, named in the attribution', async () => {
    forgetVintages();
    const asked = [];
    // The Vienne has 2017-2020 and 2021-2023, not yet 2024-2026: its tile answers 404, which gives null.
    const fetchBytes = async (url) => {
      asked.push(url.match(/OCSGE\.ARTIF\.([\d-]+)/)[1]);
      return url.includes('2024-2026') ? null : new Uint8Array([1]);
    };
    const { layers, warnings } = await resolveMapLayers([MAP_LAYERS.cadastre, layer], COLOMBIERS, { fetchBytes });
    assert.deepEqual(asked, ['2024-2026', '2021-2023']);
    assert.equal(layers[0], MAP_LAYERS.cadastre);
    assert.equal(layers[1].vintage, '2021-2023');
    assert.match(layers[1].url, /LAYER=OCSGE\.ARTIF\.2021-2023&/);
    assert.equal(layers[1].attribution, '© IGN – OCS GE 2021-2023');
    assert.deepEqual(warnings, []);

    // The place was tried once: the estimate of every zoom level asks again, and gets it at once.
    await resolveMapLayers([layer], COLOMBIERS, { fetchBytes });
    assert.equal(asked.length, 2);
  });

  it('leaves out a layer that no vintage covers there, and says so', async () => {
    forgetVintages();
    const { layers, warnings } = await resolveMapLayers([layer], COLOMBIERS, { fetchBytes: async () => null });
    assert.deepEqual(layers, []);
    assert.deepEqual(warnings, [`Artificialisation des sols : ${layer.vintageNote}`]);
  });
});

