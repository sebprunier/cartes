import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BASEMAPS, tileUrl, withCurrentAttribution } from '../src/basemaps.js';

describe('tileUrl', () => {
  it('fills the zoom level and tile indices', () => {
    assert.equal(
      tileUrl(BASEMAPS['esri-plan'], 17, 65687, 46224),
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/17/46224/65687',
    );
    assert.match(tileUrl(BASEMAPS['plan-ign'], 17, 65687, 46224), /TILEMATRIX=17&TILEROW=46224&TILECOL=65687$/);
  });
});

describe('BASEMAPS', () => {
  it('produces JPEG for photographs and PNG for maps by default', () => {
    assert.deepEqual(
      Object.fromEntries(Object.values(BASEMAPS).map((basemap) => [basemap.id, basemap.outputFormat])),
      { 'plan-ign': 'png', 'ortho-ign': 'jpg', 'esri-plan': 'png', 'esri-satellite': 'jpg' },
    );
  });
});

describe('withCurrentAttribution', () => {
  it('keeps the attribution of basemaps without attribution service, without calling it', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
    assert.equal(await withCurrentAttribution(BASEMAPS['plan-ign']), BASEMAPS['plan-ign']);
    assert.equal(fetch.mock.callCount(), 0);
  });

  it('reads the data sources from the service metadata', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ copyrightText: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community' }),
    );
    const basemap = await withCurrentAttribution(BASEMAPS['esri-satellite']);
    assert.equal(basemap.attribution, 'Esri, Vantor, Earthstar Geographics, and the GIS User Community');
    assert.equal(basemap.poweredBy, 'Powered by Esri');
    assert.equal(
      String(fetch.mock.calls[0].arguments[0]),
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=json',
    );
  });

  it('keeps the catalog attribution when the metadata is unavailable', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('error', { status: 500 }));
    assert.equal(await withCurrentAttribution(BASEMAPS['esri-plan']), BASEMAPS['esri-plan']);
  });
});
