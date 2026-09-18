import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extentFromBbox } from '../src/core/tiles.js';
import { wmsRequests } from '../src/core/wms.js';

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
