// Layers served by a WMS: a service that draws an image for the area asked for, rather than ready-made tiles.
// Asking it tile by tile would mean hundreds of requests for one map, so whole blocks of the image are asked
// for instead — two requests cover a municipality — which is faster and gentler on a public service.

import { TILE_SIZE } from './tiles.js';

// Bounds of the Web Mercator world, in metres: the projection squares the globe between these values.
const WORLD_LIMIT = 20037508.342789244;
// The Géorisques service refuses images larger than this, and other WMS have similar limits.
const MAX_SIDE = 4096;

/**
 * The requests covering the extent: each one carries where its image goes in the map, and how large it is
 * asked for. Above `dataMaxZoom`, the image is asked for at that zoom and drawn larger: the zoning of a plan
 * is drawn at the scale of a map, and asking for more pixels would only ask more of the service. Below
 * `minZoom`, it is asked for at that zoom and drawn smaller: such a service refuses to draw anything at too
 * small a scale, and a reduced view would come back empty.
 */
export function wmsRequests(layer, extent, { maxSide = MAX_SIDE } = {}) {
  const asked = Math.max(extent.zoom, layer.minZoom ?? 0);
  const dataZoom = Math.min(asked, layer.dataMaxZoom ?? asked);
  const scale = 2 ** (extent.zoom - dataZoom);
  const step = maxSide * scale;
  const requests = [];

  for (let top = 0; top < extent.height; top += step) {
    for (let left = 0; left < extent.width; left += step) {
      const width = Math.min(step, extent.width - left);
      const height = Math.min(step, extent.height - top);
      requests.push({
        x: left,
        y: top,
        width,
        height,
        pixelWidth: Math.max(1, Math.round(width / scale)),
        pixelHeight: Math.max(1, Math.round(height / scale)),
        url: getMapUrl(layer, extent, { left, top, width, height, scale }),
      });
    }
  }
  return requests;
}

/**
 * Address of the legend the service draws for its layer: its classes with their colors, as it styles them.
 * Copying those colors into our own catalog would go wrong the day the service restyles its map.
 */
export function wmsLegendUrl(layer) {
  const parameters = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetLegendGraphic',
    SLD_VERSION: '1.1.0',
    LAYER: layer.wmsLayers,
    FORMAT: 'image/png',
    ...(layer.wmsStyle ? { STYLE: layer.wmsStyle } : {}),
  });
  return `${layer.url}${layer.url.includes('?') ? '&' : '?'}${parameters}`;
}

/** A GetMap request for a part of the image, in Web Mercator, on a transparent background. */
function getMapUrl(layer, extent, { left, top, width, height, scale }) {
  const metresPerPixel = (2 * WORLD_LIMIT) / (TILE_SIZE * 2 ** extent.zoom);
  const toMetresX = (pixel) => -WORLD_LIMIT + (extent.xMin + pixel) * metresPerPixel;
  const toMetresY = (pixel) => WORLD_LIMIT - (extent.yMin + pixel) * metresPerPixel;

  const parameters = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: layer.wmsLayers,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: [toMetresX(left), toMetresY(top + height), toMetresX(left + width), toMetresY(top)].join(','),
    WIDTH: String(Math.max(1, Math.round(width / scale))),
    HEIGHT: String(Math.max(1, Math.round(height / scale))),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
  });
  return `${layer.url}${layer.url.includes('?') ? '&' : '?'}${parameters}`;
}
