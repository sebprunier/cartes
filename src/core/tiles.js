// Computes the tiles covering an extent and downloads them. Where a tile is stored is left to the platform:
// a disk cache under Node, the bytes themselves in a browser.

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
  return extentFromPixels(
    zoom,
    Math.floor(x0 - marginX),
    Math.floor(y0 - marginY),
    Math.ceil(x1 + marginX),
    Math.ceil(y1 + marginY),
  );
}

/**
 * Extent of a window of the given size inside a larger extent, never bigger than it and always within it.
 * `center` places it, as a fraction of the extent. It shows a part of a map at its real size, without
 * downloading the whole map.
 */
export function extentWindow(extent, width, height, center = { x: 0.5, y: 0.5 }) {
  const windowWidth = Math.min(width, extent.width);
  const windowHeight = Math.min(height, extent.height);
  const xMin = extent.xMin + clamp(Math.round(center.x * extent.width - windowWidth / 2), extent.width - windowWidth);
  const yMin =
    extent.yMin + clamp(Math.round(center.y * extent.height - windowHeight / 2), extent.height - windowHeight);
  return extentFromPixels(extent.zoom, xMin, yMin, xMin + windowWidth, yMin + windowHeight);
}

function clamp(value, max) {
  return Math.max(0, Math.min(value, max));
}

/** Extent covering a rectangle of the pixel plane of a zoom level, with the tiles it needs. */
function extentFromPixels(zoom, xMin, yMin, xMax, yMax) {
  const extent = { zoom, xMin, yMin, xMax, yMax, width: xMax - xMin, height: yMax - yMin };
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
 * Tiles spread over the extent: the tile at the center of each cell of a grid of `gridSize` × `gridSize` cells,
 * or all the tiles when there are fewer of them in a direction.
 */
export function sampleTiles(extent, gridSize) {
  const { xMin, yMin, xMax, yMax } = extent.tiles;
  const columns = Math.min(gridSize, xMax - xMin + 1);
  const rows = Math.min(gridSize, yMax - yMin + 1);
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push({
        x: xMin + Math.floor(((column + 0.5) * (xMax - xMin + 1)) / columns),
        y: yMin + Math.floor(((row + 0.5) * (yMax - yMin + 1)) / rows),
      });
    }
  }
  return tiles;
}

/**
 * Loads {x, y} tiles at the given zoom level and returns them with their content and error, if any.
 * `loadTile(url, tile)` returns what identifies the loaded tile — its path in a cache, or its bytes — and null
 * for a missing tile (404, outside the basemap coverage). A tile that keeps failing has a null content and an
 * error, without stopping the others; too many failures in a row abort the whole download.
 * An aborted signal stops the download between two tiles.
 */
export async function downloadTiles(basemap, zoom, tileIndices, { loadTile, concurrency, onProgress, signal }) {
  const tiles = tileIndices.map(({ x, y }) => ({ x, y }));
  let next = 0;
  let done = 0;
  let consecutiveFailures = 0;
  let lastError;

  async function worker() {
    while (next < tiles.length && consecutiveFailures < MAX_CONSECUTIVE_FAILURES && !signal?.aborted) {
      const tile = tiles[next++];
      try {
        tile.content = await loadTile(tileUrl(basemap, zoom, tile.x, tile.y), tile);
        consecutiveFailures = 0;
      } catch (error) {
        tile.content = null;
        tile.error = lastError = error;
        consecutiveFailures++;
      }
      onProgress?.(++done, tiles.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  if (signal?.aborted) throw new Error('Génération annulée.');
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    throw new Error(
      `Téléchargement interrompu après ${MAX_CONSECUTIVE_FAILURES} tuiles en échec d'affilée. ` +
        'Réessayez plus tard : les tuiles déjà téléchargées sont conservées.',
      { cause: lastError },
    );
  }
  return tiles;
}

/**
 * Downloads a tile and returns its bytes, or null when the tile is missing. Transient errors are retried:
 * the Géoplateforme returns transient 404s, and 400, 429 or 5xx errors under load.
 */
export async function fetchTile(url, retryDelayMs = 1000) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await request(url);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(2 ** (attempt - 1) * retryDelayMs);
      continue;
    }

    if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
      return new Uint8Array(await response.arrayBuffer());
    }

    await response.body?.cancel();
    // Tile outside the basemap coverage, but transient 404s happen: retry once before giving up.
    if (response.status === 404 && attempt >= 2) return null;
    if (attempt === MAX_ATTEMPTS) {
      throw response.ok ? new Error(`La réponse n'est pas une image : ${url}`) : new HttpError(url, response.status);
    }
    await sleep(2 ** (attempt - 1) * retryDelayMs);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
