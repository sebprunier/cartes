import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CapabilitiesError,
  capabilitiesUrl,
  completeWmsDefinitions,
  parseCapabilities,
  readCapabilities,
  serviceAddress,
} from '../src/core/capabilities.js';
import { MAP_LAYERS, MapLayerError, checkMapLayer, customMapLayer, isWmsLayer } from '../src/core/maplayers.js';

// The capabilities of a service as Géorisques and the Géoplateforme write them, cut down: a group of layers
// without a name, whose projections and source its layers inherit, and a layer in Lambert 93 only.
const CAPABILITIES = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service><Name>WMS</Name><Title>Services &amp; données GéoRisques</Title></Service>
  <Capability>
    <Layer>
      <Title>Risques</Title>
      <CRS>EPSG:2154</CRS>
      <CRS>EPSG:3857</CRS>
      <Attribution><Title>BRGM</Title></Attribution>
      <Style><Name>default</Name><Title>Style du groupe</Title></Style>
      <Layer queryable="1">
        <Name>CAVITE_LOCALISEE</Name>
        <Title>Cavités souterraines</Title>
        <Style><Name>inspire_common:DEFAULT</Name><Title>Défaut</Title></Style>
        <MinScaleDenominator>2000</MinScaleDenominator>
      </Layer>
      <Layer>
        <Name>PPRN_ZONE_INOND</Name>
        <Title><![CDATA[Zonage des PPR inondation]]></Title>
        <MaxScaleDenominator>100000</MaxScaleDenominator>
      </Layer>
    </Layer>
    <Layer>
      <Name>LAMBERT_SEUL</Name>
      <Title>Seulement en Lambert 93</Title>
      <CRS>EPSG:2154</CRS>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe('serviceAddress', () => {
  it('keeps the service, and drops what asked it for something', () => {
    assert.equal(
      serviceAddress('https://exemple.fr/wms?SERVICE=WMS&request=GetCapabilities&VERSION=1.3.0&map=risques.map'),
      'https://exemple.fr/wms?map=risques.map',
    );
    assert.equal(serviceAddress(' https://exemple.fr/wms? '), 'https://exemple.fr/wms');
    assert.equal(capabilitiesUrl('https://exemple.fr/wms'), 'https://exemple.fr/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0');
    assert.throws(() => serviceAddress('ftp://exemple.fr/wms'), CapabilitiesError);
    assert.throws(() => serviceAddress('exemple.fr/wms'), CapabilitiesError);
  });
});

describe('parseCapabilities', () => {
  it('lists the named layers in Web Mercator, with what they inherit from their group', () => {
    const { title, layers, withoutWebMercator } = parseCapabilities(CAPABILITIES);
    assert.equal(title, 'Services & données GéoRisques');
    assert.deepEqual(layers, [
      // 2,000 is the scale of zoom 18: the service draws nothing beyond it.
      { name: 'CAVITE_LOCALISEE', title: 'Cavités souterraines', attribution: 'BRGM', dataMaxZoom: 18, minZoom: undefined },
      // 100,000 is between zoom 12 and 13: below 13, it draws nothing.
      { name: 'PPRN_ZONE_INOND', title: 'Zonage des PPR inondation', attribution: 'BRGM', dataMaxZoom: undefined, minZoom: 13 },
    ]);
    assert.equal(withoutWebMercator, 1);
  });
});

describe('readCapabilities', () => {
  it('asks the service for its capabilities, and refuses what is not a WMS', async () => {
    const asked = [];
    const read = await readCapabilities('https://exemple.fr/wms', {
      fetchText: async (url) => {
        asked.push(url);
        return CAPABILITIES;
      },
    });
    assert.equal(read.layers.length, 2);
    assert.deepEqual(asked, ['https://exemple.fr/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0']);
    await assert.rejects(
      readCapabilities('https://exemple.fr/', { fetchText: async () => '<html><body>Accueil</body></html>' }),
      /ne répond pas comme un service WMS/,
    );
    await assert.rejects(
      readCapabilities('https://exemple.fr/wms', {
        fetchText: async () => {
          throw new Error('HTTP 404');
        },
      }),
      (error) => error instanceof CapabilitiesError && error.message === 'Le service n’a pas répondu (HTTP 404). Vérifiez l’adresse.',
    );
  });
});

describe('completeWmsDefinitions', () => {
  const read = async () => parseCapabilities(CAPABILITIES);

  it('takes the scales of a layer from the capabilities of its service, read once', async () => {
    let reads = 0;
    const counted = async () => {
      reads++;
      return read();
    };
    const [tiles, cavites, zonage] = await completeWmsDefinitions(
      [
        { url: 'https://exemple.fr/{z}/{x}/{y}.png', name: 'Tuiles' },
        { url: 'https://exemple.fr/wms?SERVICE=WMS', wmsLayers: 'CAVITE_LOCALISEE', name: 'Cavités' },
        { url: 'https://exemple.fr/wms', wmsLayers: 'PPRN_ZONE_INOND', name: 'Zonage' },
      ],
      { read: counted },
    );
    assert.equal(tiles.url, 'https://exemple.fr/{z}/{x}/{y}.png');
    assert.deepEqual([cavites.url, cavites.dataMaxZoom, cavites.minZoom], ['https://exemple.fr/wms', 18, undefined]);
    assert.equal(zonage.minZoom, 13);
    assert.equal(reads, 1);
  });

  it('refuses a layer the service does not know, naming those that come closest', async () => {
    await assert.rejects(
      completeWmsDefinitions([{ url: 'https://exemple.fr/wms', wmsLayers: 'CAVITE', name: 'Cavités' }], { read }),
      (error) =>
        error instanceof CapabilitiesError &&
        error.message ===
          'Le service exemple.fr n’a pas de couche « CAVITE » qu’il sache dessiner pour une carte. Couches proches : CAVITE_LOCALISEE.',
    );
    await assert.rejects(
      completeWmsDefinitions([{ url: 'https://exemple.fr/wms', wmsLayers: 'LAMBERT_SEUL', name: 'L' }], { read }),
      /n’a pas de couche « LAMBERT_SEUL »/,
    );
  });
});

describe('customMapLayer, for a WMS', () => {
  const definition = {
    url: 'https://exemple.fr/wms',
    wmsLayers: 'PPRN_ZONE_INOND',
    name: 'Zonage des PPR',
    attribution: '© BRGM',
    minZoom: 13,
  };

  it('builds a layer that the service draws, with what its capabilities said', () => {
    const layer = customMapLayer(definition);
    assert.ok(isWmsLayer(layer));
    assert.equal(layer.provider, 'exemple.fr');
    assert.equal(layer.minZoom, 13);
    assert.match(layer.zoomNote, /En dessous du zoom 13/);
    // Built again from what the page remembers, it is the same layer.
    assert.deepEqual(customMapLayer({ ...layer }), layer);
    assert.throws(() => customMapLayer({ ...definition, attribution: '' }), /Source manquante/);
    assert.throws(() => customMapLayer({ ...definition, url: 'exemple.fr/wms' }), /Adresse de service invalide/);
  });

  it('is tried on one image over the place, and says why the service refuses it', async () => {
    const layer = customMapLayer(definition);
    const place = { lon: 0.4267, lat: 46.7721, zoom: 14 };
    const image = async () => new Response(new Uint8Array([137, 80]), { headers: { 'content-type': 'image/png' } });
    assert.deepEqual(await checkMapLayer(layer, place, { fetchResponse: image }), { empty: false, missing: false });

    const refusal = async () =>
      new Response(
        '<ServiceExceptionReport><ServiceException code="LayerNotDefined">msWMSLoadGetMapParams(): Invalid layer(s) given in the LAYERS parameter.</ServiceException></ServiceExceptionReport>',
        { headers: { 'content-type': 'text/xml' } },
      );
    await assert.rejects(
      checkMapLayer(layer, place, { fetchResponse: refusal }),
      (error) =>
        error instanceof MapLayerError &&
        error.message ===
          'Le service refuse la couche « Zonage des PPR » : msWMSLoadGetMapParams(): Invalid layer(s) given in the LAYERS parameter.',
    );
  });

  it('keeps the WMS layers of the catalog out of it', () => {
    assert.equal(MAP_LAYERS['ppr-inondation'].custom, undefined);
  });
});
