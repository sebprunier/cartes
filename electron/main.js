// Main process: window, and generation of the maps with the same code as the command line.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';

import { BASEMAPS, canUsePalette } from '../src/core/basemaps.js';
import { estimateFileSize } from '../src/core/estimates.js';
import { withUpdateDates } from '../src/core/metadata.js';
import { layersSource } from '../src/core/layers.js';
import { BOUNDARY_SOURCE } from '../src/core/municipalities.js';
import { attributionText } from '../src/core/overlays.js';
import { downloadTiles, extentFromBbox, sampleTiles, tilesInExtent } from '../src/core/tiles.js';
import { cachedTileLoader, tileSizes } from '../src/node/cache.js';
import {
  assembleTiles,
  attributionLabel,
  boundaryOutline,
  drawOverlays,
  layerOverlay,
  legendOverlay,
  saveImage,
} from '../src/node/render.js';

const SAMPLE_GRID_SIZE = 6;
const CONCURRENCY = 6;
const MARGIN_DEFAULT = 0.03;

const cacheDir = () => path.join(app.getPath('userData'), 'tuiles');
let generation;

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());

function createWindow() {
  const window = new BrowserWindow({
    width: 1000,
    height: 900,
    title: 'cartes',
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.mjs'),
      contextIsolation: true,
      sandbox: false, // Required for an ES module preload script.
    },
  });
  // Les liens de l'interface s'ouvrent dans le navigateur, et jamais dans la fenêtre de l'application.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  window.loadFile(path.join(import.meta.dirname, '..', 'dist-electron', 'renderer', 'index.html'));
}

// Tile of the preview, drawn by the interface: downloaded once, then read from the cache of the maps.
ipcMain.handle('tile', async (event, url, { basemapId, zoom, x, y }) => {
  const load = cachedTileLoader({ cacheDir: cacheDir(), basemapId, zoom });
  const tilePath = await load(url, { x, y });
  return tilePath ? await readFile(tilePath) : null;
});

ipcMain.handle('estimate', async (event, request) => {
  const { basemap, extent } = plan(request);
  const tiles = await downloadTiles(basemap, extent.zoom, sampleTiles(extent, SAMPLE_GRID_SIZE), {
    loadTile: cachedTileLoader({ cacheDir: cacheDir(), basemapId: basemap.id, zoom: extent.zoom }),
    concurrency: CONCURRENCY,
  });
  const sampleSizes = await tileSizes(tiles);
  return {
    size: estimateFileSize({
      basemap,
      format: request.format,
      grayscale: request.grayscale,
      palette: canUsePalette(basemap, request.format),
      tileCount: extent.tileCount,
      sampleSizes,
    }),
  };
});

ipcMain.handle('generate', async (event, request) => {
  const { basemap, extent } = plan(request);
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Enregistrer la carte',
    defaultPath: path.join(app.getPath('downloads'), request.fileName),
    filters: [{ name: 'Image', extensions: [request.format] }],
  });
  if (canceled || !filePath) return { canceled: true };

  generation = new AbortController();
  try {
    const tiles = await downloadTiles(basemap, extent.zoom, [...tilesInExtent(extent)], {
      loadTile: cachedTileLoader({ cacheDir: cacheDir(), basemapId: basemap.id, zoom: extent.zoom }),
      concurrency: CONCURRENCY,
      signal: generation.signal,
      onProgress: (done, total) => event.sender.send('progress', { done, total }),
    });

    const { pixels, missing } = await assembleTiles(extent, tiles, { grayscale: request.grayscale });
    const layers = request.layers ?? [];
    const sources = await withUpdateDates(request.outline ? [basemap, BOUNDARY_SOURCE] : [basemap]);
    const added = layersSource(layers);
    if (added) sources.push(added);

    const overlays = request.outline ? [boundaryOutline(request.boundary, extent)] : [];
    for (const layer of layers) overlays.push(layerOverlay(layer, extent));
    if (request.legend !== false) overlays.push(await legendOverlay(layers, extent));
    overlays.push(await attributionLabel(attributionText({ sources }), extent));
    await drawOverlays(pixels, extent, overlays);
    await saveImage(pixels, extent, filePath, {
      dpi: request.dpi ?? 150,
      palette: canUsePalette(basemap, request.format),
    });

    return {
      path: filePath,
      width: extent.width,
      height: extent.height,
      missing,
      updateDatesMissing: sources.some((source) => source.metadataId && !source.updateDate),
    };
  } finally {
    generation = undefined;
  }
});

ipcMain.handle('cancel', () => generation?.abort());

/** Basemap and pixel extent of a request coming from the interface. */
function plan({ basemapId, bbox, zoom, margin = MARGIN_DEFAULT }) {
  return { basemap: BASEMAPS[basemapId], extent: extentFromBbox(bbox, zoom, margin) };
}
