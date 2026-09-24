// Estimates of the memory used and of the file size of generated maps.

import { CHANNELS } from './image.js';

/** Size in bytes of the uncompressed image, which is held in memory while the map is generated. */
export function imageMemory(extent) {
  return extent.width * extent.height * CHANNELS;
}

/**
 * Estimated size in bytes of the file generated from `tileCount` tiles, from the sizes of a sample of these
 * tiles, and from the file size ratio of the basemap for the output format, in color or in grayscale.
 * `layers` are the layers laid over the basemap, each with its own sample: a layer drawn over the whole map
 * weighs as much as the basemap itself, and ignoring it made the estimate meaningless. `palette` tells that
 * the PNG will be written with a color palette, which the platforms do not all support; `browser`, that a
 * browser encodes the image, not sharp. Returns undefined when the sample of the basemap is empty.
 */
export function estimateFileSize({
  basemap,
  format,
  grayscale,
  palette = false,
  browser = false,
  zoom,
  tileCount,
  sampleSizes,
  layers = [],
}) {
  if (sampleSizes.length === 0) return undefined;
  const weight = (source, sizes) => {
    const ratios = source.fileSizeRatios[grayscale ? 'grayscale' : 'color'];
    const average = sizes.reduce((total, size) => total + size, 0) / sizes.length;
    const encoder = browser ? BROWSER_ENCODERS[grayscale ? 'grayscale' : 'color'][format] : 1;
    return average * tileCount * ((palette && ratios.pngPalette) || ratios[format]) * encoder * drawnShare(source, zoom);
  };
  return layers.reduce(
    (total, { layer, sampleSizes: layerSizes }) =>
      total + (layerSizes.length > 0 ? weight(layer, layerSizes) : 0),
    weight(basemap, sampleSizes),
  );
}

// The ratios of the catalogs were measured with sharp. A browser encodes otherwise: the weight of its file,
// divided by that of sharp, for the same image — Colombiers, Plan IGN, at zoom 15 and 16, the same factor at both
// within 0.01 (#5). An average of Chrome 153, Firefox 156 and Safari 18.6; each is within 17 % of it. In color:
// PNG ×1.37 to ×1.57, JPEG ×1.00 to ×1.35. In grayscale, of Chrome and Firefox only: Safari ignored the filter
// that turned its canvas gray, and encoded the map in color.
const BROWSER_ENCODERS = {
  color: { png: 1.48, jpg: 1.21 },
  grayscale: { png: 1.18, jpg: 1.05 },
};

// Below the zoom level where a layer shows everything, it draws much less — the cadastre only its sections —
// and weighs about a third of what its tiles suggest. Measured on Colombiers between zoom 15 and zoom 16.
const BELOW_MIN_ZOOM_SHARE = 0.35;

function drawnShare(source, zoom) {
  // Above the last level its service publishes, a layer is left out of the map.
  if (zoom !== undefined && zoom > source.maxZoom) return 0;
  return zoom !== undefined && source.minZoom !== undefined && zoom < source.minZoom ? BELOW_MIN_ZOOM_SHARE : 1;
}

/** Size in bytes written in French units: Ko, Mo or Go. */
export function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} Go`;
  if (bytes >= 1e7) return `${Math.round(bytes / 1e6)} Mo`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}
