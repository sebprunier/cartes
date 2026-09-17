// Disk cache of the downloaded tiles: under Node, a tile is identified by its path in this cache.

import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fetchTile } from '../core/tiles.js';

/**
 * Returns a `loadTile` that downloads a tile unless it is already in the cache, and gives back its path.
 * A missing tile (404) has no path, and is not cached.
 */
export function cachedTileLoader({ cacheDir, basemapId, zoom, retryDelayMs }) {
  return async (url, tile) => {
    const tilePath = path.join(cacheDir, basemapId, String(zoom), String(tile.x), `${tile.y}.tile`);
    if (await exists(tilePath)) return tilePath;

    const bytes = await fetchTile(url, retryDelayMs);
    if (!bytes) return null;
    await mkdir(path.dirname(tilePath), { recursive: true });
    const tempPath = `${tilePath}.tmp`;
    await writeFile(tempPath, bytes);
    await rename(tempPath, tilePath);
    return tilePath;
  };
}

/** Sizes in bytes of the tiles present in the cache. */
export async function tileSizes(tiles) {
  const sizes = await Promise.all(tiles.filter((tile) => tile.content).map(async (tile) => (await stat(tile.content)).size));
  return sizes;
}

/** Removes a cached tile, for instance when its file turns out to be corrupted. */
export function removeTile(tilePath) {
  return rm(tilePath, { force: true });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
