// Estimates of the memory used and of the file size of generated maps.

import { CHANNELS } from './image.js';

/** Size in bytes of the uncompressed image, which is held in memory while the map is generated. */
export function imageMemory(extent) {
  return extent.width * extent.height * CHANNELS;
}

/**
 * Estimated size in bytes of the file generated from `tileCount` tiles, from the sizes of a sample of these
 * tiles, and from the file size ratio of the basemap for the output format, in color or in grayscale.
 * Returns undefined when the sample is empty.
 */
export function estimateFileSize({ basemap, format, grayscale, tileCount, sampleSizes }) {
  if (sampleSizes.length === 0) return undefined;
  const averageTileSize = sampleSizes.reduce((total, size) => total + size, 0) / sampleSizes.length;
  return averageTileSize * tileCount * basemap.fileSizeRatios[grayscale ? 'grayscale' : 'color'][format];
}

/** Size in bytes written in French units: Ko, Mo or Go. */
export function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} Go`;
  if (bytes >= 1e7) return `${Math.round(bytes / 1e6)} Mo`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}
