// Computes the tiles covering an extent and downloads them (with a disk cache).

import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tileUrl } from './basemaps.js';
import { HttpError, request } from './http.js';

export const TILE_SIZE = 256;
const EARTH_RADIUS = 6378137; // meters, sphere of the Web Mercator projection
const MAX_ATTEMPTS = 4;
const MAX_CONSECUTIVE_FAILURES = 10;

/** Pixel coordinates in the Web Mercator "world" image at the given zoom level. */
export function lonLatToPixel(lon, lat, zoom) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const x = ((lon + 180) / 360) * worldSize;
  const y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * worldSize;
  return [x, y];
}

/** Real ground size (in meters) of a pixel at the given latitude. */
export function groundResolution(lat, zoom) {
  return (2 * Math.PI * EARTH_RADIUS * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom);
}

/**
 * Pixel window (max bounds excluded) in the world image of a zoom level, covering the bbox
 * [lonMin, latMin, lonMax, latMax]. The margin is a fraction of the width/height added on each side.
 */
export function extentFromBbox([lonMin, latMin, lonMax, latMax], zoom, margin = 0) {
  const [x0, y0] = lonLatToPixel(lonMin, latMax, zoom);
  const [x1, y1] = lonLatToPixel(lonMax, latMin, zoom);
  const marginX = (x1 - x0) * margin;
  const marginY = (y1 - y0) * margin;
  const extent = {
    zoom,
    xMin: Math.floor(x0 - marginX),
    yMin: Math.floor(y0 - marginY),
    xMax: Math.ceil(x1 + marginX),
    yMax: Math.ceil(y1 + marginY),
  };
  extent.width = extent.xMax - extent.xMin;
  extent.height = extent.yMax - extent.yMin;
  extent.tiles = {
    xMin: Math.floor(extent.xMin / TILE_SIZE),
    yMin: Math.floor(extent.yMin / TILE_SIZE),
    xMax: Math.floor((extent.xMax - 1) / TILE_SIZE),
    yMax: Math.floor((extent.yMax - 1) / TILE_SIZE),
  };
  extent.tileCount = (extent.tiles.xMax - extent.tiles.xMin + 1) * (extent.tiles.yMax - extent.tiles.yMin + 1);
  return extent;
}

/** {x, y} indices of the tiles covering the extent. */
export function* tilesInExtent(extent) {
  const { xMin, yMin, xMax, yMax } = extent.tiles;
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) yield { x, y };
  }
}

/**
 * Downloads the tiles of the extent and returns the list of {x, y, path, error} tiles.
 * A missing tile (404, outside the basemap coverage) has a null path; a tile that still fails after
 * retries has a null path and an error, without stopping the others.
 * The download is aborted when too many tiles fail in a row (network down, service outage).
 */
export async function downloadTiles(basemap, extent, cacheDir, concurrency, onProgress) {
  const tiles = [...tilesInExtent(extent)];
  let next = 0;
  let done = 0;
  let consecutiveFailures = 0;
  let lastError;

  async function worker() {
    while (next < tiles.length && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      const tile = tiles[next++];
      const tilePath = path.join(cacheDir, basemap.id, String(extent.zoom), String(tile.x), `${tile.y}.tile`);
      try {
        tile.path = await downloadTile(tileUrl(basemap, extent.zoom, tile.x, tile.y), tilePath);
        consecutiveFailures = 0;
      } catch (error) {
        tile.path = null;
        tile.error = lastError = error;
        consecutiveFailures++;
      }
      onProgress?.(++done, tiles.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    throw new Error(
      `Téléchargement interrompu après ${MAX_CONSECUTIVE_FAILURES} tuiles en échec d'affilée. ` +
        'Relancez la commande plus tard : les tuiles déjà téléchargées sont en cache.',
      { cause: lastError },
    );
  }
  return tiles;
}

async function downloadTile(url, tilePath) {
  if (await exists(tilePath)) return tilePath;

  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await request(url);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(2 ** (attempt - 1) * 1000);
      continue;
    }

    if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
      await mkdir(path.dirname(tilePath), { recursive: true });
      const tempPath = `${tilePath}.tmp`;
      await writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
      await rename(tempPath, tilePath);
      return tilePath;
    }

    await response.body?.cancel();
    // Tile outside the basemap coverage, but the Géoplateforme also returns transient 404s:
    // retry once before considering the tile missing.
    if (response.status === 404 && attempt >= 2) return null;
    // Other errors are often transient too (400, 429, 5xx…): retry.
    if (attempt === MAX_ATTEMPTS) {
      throw response.ok ? new Error(`La réponse n'est pas une image : ${url}`) : new HttpError(url, response.status);
    }
    await sleep(2 ** (attempt - 1) * 1000);
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
