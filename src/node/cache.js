// Disk cache of the downloaded tiles: under Node, a tile is identified by its path in this cache.

import { createHash } from 'node:crypto';
import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isCustomLayer } from '../core/maplayers.js';
import { fetchTile } from '../core/tiles.js';

/**
 * The folder of a source in the cache: its id, and its vintage when it has one. A layer added by its address
 * takes its id from the name it was given: two such layers of the same name, at two addresses, would share
 * their tiles — on an instance of the API, a client could have its own drawn on the maps of the others. The
 * address is part of the folder.
 */
export function cacheFolder(source) {
  const folder = source.vintage ? `${source.id}-${source.vintage}` : source.id;
  if (!isCustomLayer(source)) return folder;
  return `${folder}-${createHash('sha256').update(source.url).digest('hex').slice(0, 16)}`;
}

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
