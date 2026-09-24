import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpError } from '../src/core/http.js';
import { extentFromBbox } from '../src/core/tiles.js';
import { fetchWmsImages, wmsRequests } from '../src/core/wms.js';

const CHATELLERAULT_BBOX = [0.5, 46.78, 0.59, 46.85];
const layer = { url: 'https://example.org/wxs', wmsLayers: 'PPRN_ZONE_INOND', dataMaxZoom: 16 };
const parameters = (url) => Object.fromEntries(new URL(url).searchParams);

describe('wmsRequests', () => {
  it('asks for one image when the map fits in it', () => {
    const extent = extentFromBbox(CHATELLERAULT_BBOX, 15, 0.03);
    const [request, ...others] = wmsRequests(layer, extent);
    assert.equal(others.length, 0);
    assert.deepEqual([request.x, request.y], [0, 0]);
    assert.deepEqual([request.width, request.height], [extent.width, extent.height]);
    assert.deepEqual([request.pixelWidth, request.pixelHeight], [extent.width, extent.height]);
  });

  it('cuts the map into blocks the service accepts, which cover it exactly', () => {
    const extent = extentFromBbox(CHATELLERAULT_BBOX, 16, 0.03);
    const requests = wmsRequests(layer, extent, { maxSide: 1024 });
    for (const request of requests) assert.ok(request.pixelWidth <= 1024 && request.pixelHeight <= 1024);
    const covered = requests.reduce((total, { width, height }) => total + width * height, 0);
    assert.equal(covered, extent.width * extent.height);
  });

  it('stops asking for more pixels than the data holds, and draws them larger', () => {
    const extent = extentFromBbox(CHATELLERAULT_BBOX, 18, 0.03);
    const requests = wmsRequests(layer, extent);
    // Four times the zoom of the data means four times fewer pixels asked for on each side.
    for (const request of requests) {
      assert.equal(request.pixelWidth, Math.round(request.width / 4));
      assert.equal(request.pixelHeight, Math.round(request.height / 4));
    }
  });

  it('writes a GetMap request in Web Mercator, on a transparent background', () => {
    const extent = extentFromBbox(CHATELLERAULT_BBOX, 15, 0.03);
    const asked = parameters(wmsRequests(layer, extent)[0].url);
    assert.equal(asked.REQUEST, 'GetMap');
    assert.equal(asked.VERSION, '1.3.0');
    assert.equal(asked.LAYERS, 'PPRN_ZONE_INOND');
    assert.equal(asked.CRS, 'EPSG:3857');
    assert.equal(asked.TRANSPARENT, 'TRUE');
    assert.equal(asked.FORMAT, 'image/png');

    const [minX, minY, maxX, maxY] = asked.BBOX.split(',').map(Number);
    assert.ok(minX < maxX && minY < maxY, asked.BBOX);
    // Châtellerault sits just east of the Greenwich meridian, and well north of the equator.
    assert.ok(minX > 0 && minX < 100_000, `${minX}`);
    assert.ok(minY > 5_800_000 && maxY < 6_000_000, asked.BBOX);
  });
});

describe('fetchWmsImages', () => {
  const layer = { name: 'PPR mouvements de terrain', provider: 'Géorisques' };
  const blocks = [{ url: 'https://exemple.fr/wms?a' }, { url: 'https://exemple.fr/wms?b' }];

  it('downloads the image of each request, in order, and counts them', async () => {
    const counted = [];
    const images = await fetchWmsImages(layer, blocks, {
      load: async (url) => new TextEncoder().encode(url),
      onImage: (done, total) => counted.push([done, total]),
    });
    assert.deepEqual(images.map((bytes) => new TextDecoder().decode(bytes)), blocks.map(({ url }) => url));
    assert.deepEqual(counted, [
      [1, 2],
      [2, 2],
    ]);
  });

  it('names the layer and its service when the service answers an error page, rather than an address', async () => {
    const load = async (url) => {
      throw new Error(`La réponse n'est pas une image : ${url}`);
    };
    await assert.rejects(fetchWmsImages(layer, blocks, { load }), (error) => {
      assert.equal(
        error.message,
        'Géorisques ne répond pas pour la couche « PPR mouvements de terrain » (il renvoie une page d’erreur au ' +
          'lieu d’une image). C’est une panne du service, en général passagère : relancez la génération plus tard, ' +
          'ou retirez cette couche. État des services : https://sebprunier.github.io/cartes/etat-des-services.html',
      );
      return true;
    });
  });

  it('gives the status of a service that refuses', async () => {
    const load = async (url) => {
      throw new HttpError(url, 503);
    };
    await assert.rejects(fetchWmsImages(layer, blocks, { load }), /^Error: Géorisques ne répond pas .* \(erreur 503\)\./);
  });
});

