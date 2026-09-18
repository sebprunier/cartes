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
 * the PNG will be written with a color palette, which the platforms do not all support.
 * Returns undefined when the sample of the basemap is empty.
 */
export function estimateFileSize({
  basemap,
  format,
  grayscale,
  palette = false,
  zoom,
  tileCount,
  sampleSizes,
  layers = [],
}) {
  if (sampleSizes.length === 0) return undefined;
  const weight = (source, sizes) => {
    const ratios = source.fileSizeRatios[grayscale ? 'grayscale' : 'color'];
    const average = sizes.reduce((total, size) => total + size, 0) / sizes.length;
    return average * tileCount * ((palette && ratios.pngPalette) || ratios[format]) * drawnShare(source, zoom);
  };
  return layers.reduce(
    (total, { layer, sampleSizes: layerSizes }) =>
      total + (layerSizes.length > 0 ? weight(layer, layerSizes) : 0),
    weight(basemap, sampleSizes),
  );
}

// Below the zoom level where a layer shows everything, it draws much less — the cadastre only its sections —
// and weighs about a third of what its tiles suggest. Measured on Colombiers between zoom 15 and zoom 16.
const BELOW_MIN_ZOOM_SHARE = 0.35;

function drawnShare(source, zoom) {
  return zoom !== undefined && source.minZoom !== undefined && zoom < source.minZoom ? BELOW_MIN_ZOOM_SHARE : 1;
}

/** Size in bytes written in French units: Ko, Mo or Go. */
export function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} Go`;
  if (bytes >= 1e7) return `${Math.round(bytes / 1e6)} Mo`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}
