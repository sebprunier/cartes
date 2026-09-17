// Estimates of the memory used and of the file size of generated maps.

import { stat } from 'node:fs/promises';

import { CHANNELS } from './map.js';

/** Size in bytes of the uncompressed image, which is held in memory while the map is generated. */
export function imageMemory(extent) {
  return extent.width * extent.height * CHANNELS;
}

/**
 * Estimated size in bytes of the file generated from `tileCount` tiles, from a sample of these tiles already
 * downloaded, and from the file size ratio of the basemap for the output format, in color or in grayscale.
 * Returns undefined when no sampled tile is available.
 */
export async function estimateFileSize({ basemap, format, grayscale, tileCount, sampledTiles }) {
  const sizes = await Promise.all(
    sampledTiles.filter((tile) => tile.path).map(async (tile) => (await stat(tile.path)).size),
  );
  if (sizes.length === 0) return undefined;
  const averageTileSize = sizes.reduce((total, size) => total + size, 0) / sizes.length;
  return averageTileSize * tileCount * basemap.fileSizeRatios[grayscale ? 'grayscale' : 'color'][format];
}

/** Size in bytes written in French units: Ko, Mo or Go. */
export function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} Go`;
  if (bytes >= 1e7) return `${Math.round(bytes / 1e6)} Mo`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}
