// Main process: window, and generation of the maps with the same code as the command line.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from 'electron';

import { BASEMAPS, canUsePalette } from '../src/core/basemaps.js';
import {
  checkMapLayer,
  chooseMapLayers,
  customMapLayer,
  isTileLayer,
  isVectorLayer,
  isWmsLayer,
  mapLayerLegendEntries,
  vectorStyleOf,
} from '../src/core/maplayers.js';
import { wmsLegendUrl, wmsRequests } from '../src/core/wms.js';
import { categoriesInTiles, readVectorLayer, vectorTileShapes } from '../src/core/vectortiles.js';
import { estimateFileSize } from '../src/core/estimates.js';
import { withUpdateDates } from '../src/core/metadata.js';
import { layersSource } from '../src/core/layers.js';
import { BOUNDARY_SOURCE } from '../src/core/municipalities.js';
import { attributionText } from '../src/core/overlays.js';
import { downloadTiles, extentFromBbox, fetchTile, sampleTiles, tilesInExtent } from '../src/core/tiles.js';
import { cachedTileLoader, tileSizes } from '../src/node/cache.js';
import {
  assembleTiles,
  attributionLabel,
  boundaryOutline,
  drawMapLayer,
  drawWmsLayer,
  legendImageEntry,
  vectorOverlays,
  drawOverlays,
  layerOverlays,
  legendOverlay,
  saveImage,
} from '../src/node/render.js';

const SAMPLE_GRID_SIZE = 6;
const CONCURRENCY = 6;
const MARGIN_DEFAULT = 0.03;

const cacheDir = () => path.join(app.getPath('userData'), 'tuiles');
let generation;

const DOCUMENTATION = 'https://sebprunier.github.io/cartes/documentation/';
const SOURCE_CODE = 'https://github.com/sebprunier/cartes';

app.whenReady().then(() => {
  // macOS fills its own panel from the bundle; Windows and Linux show only what is given here.
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: 'Publié sous licence MIT. Cartes © IGN et © BRGM, sous licence ouverte Etalab.',
    website: SOURCE_CODE,
  });
  Menu.setApplicationMenu(applicationMenu());
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

/**
 * The menu of the application, in French like the rest of it. The default menu of Electron is in English and
 * offers nothing of the tool: here the documentation is one click away, which is where someone stuck looks
 * first. The editing entries are kept — the interface has fields to copy and paste into.
 */
function applicationMenu() {
  const about = {
    label: `À propos de ${app.getName()}`,
    click: () => app.showAboutPanel(),
  };
  const help = {
    role: 'help',
    label: 'Aide',
    submenu: [
      { label: 'Documentation en ligne', click: () => shell.openExternal(DOCUMENTATION) },
      { label: 'Code source et signalement de bugs', click: () => shell.openExternal(SOURCE_CODE) },
      ...(process.platform === 'darwin' ? [] : [{ type: 'separator' }, about]),
    ],
  };

  // On macOS the first menu carries the name of the application, and the about panel belongs in it.
  const appMenu = {
    label: app.getName(),
    submenu: [
      about,
      { type: 'separator' },
      { role: 'services', label: 'Services' },
      { type: 'separator' },
      { role: 'hide', label: `Masquer ${app.getName()}` },
      { role: 'hideOthers', label: 'Masquer les autres' },
      { role: 'unhide', label: 'Tout afficher' },
      { type: 'separator' },
      { role: 'quit', label: `Quitter ${app.getName()}` },
    ],
  };
  const fileMenu = {
    label: 'Fichier',
    submenu: [{ role: process.platform === 'darwin' ? 'close' : 'quit', label: 'Quitter' }],
  };
  const editMenu = {
    label: 'Édition',
    submenu: [
      { role: 'undo', label: 'Annuler' },
      { role: 'redo', label: 'Rétablir' },
      { type: 'separator' },
      { role: 'cut', label: 'Couper' },
      { role: 'copy', label: 'Copier' },
      { role: 'paste', label: 'Coller' },
      { role: 'selectAll', label: 'Tout sélectionner' },
    ],
  };
  const viewMenu = {
    label: 'Affichage',
    submenu: [
      { role: 'resetZoom', label: 'Taille normale' },
      { role: 'zoomIn', label: 'Agrandir' },
      { role: 'zoomOut', label: 'Réduire' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Plein écran' },
    ],
  };

  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    help,
  ]);
}

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
  // The window shows the interface and nothing else. Without this, a file dropped beside the drop zone, or a
  // link that got through, would replace it: there is no back button here to undo that, and the settings of
  // the map in progress would be lost.
  window.webContents.on('will-navigate', (event, url) => {
    if (url === window.webContents.getURL()) return;
    event.preventDefault();
    if (url.startsWith('https:')) shell.openExternal(url);
  });
  window.loadFile(path.join(import.meta.dirname, '..', 'dist-electron', 'renderer', 'index.html'));
}

// Tile of the preview, drawn by the interface: downloaded once, then read from the cache of the maps.
ipcMain.handle('tile', async (event, url, { basemapId, zoom, x, y }) => {
  const load = cachedTileLoader({ cacheDir: cacheDir(), basemapId, zoom });
  const tilePath = await load(url, { x, y });
  return tilePath ? await readFile(tilePath) : null;
});

// A layer added by its address is tried on one tile here, not in the interface: a page is bound by the rules
// a service sets for other sites, and the application is not. The error crosses as a message, a class not
// surviving the trip between the two processes.
ipcMain.handle('check-layer', async (event, definition, place) => {
  try {
    return await checkMapLayer(customMapLayer(definition), place);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('estimate', async (event, request) => {
  const { basemap, extent } = plan(request);
  const sample = sampleTiles(extent, SAMPLE_GRID_SIZE);
  const sizesOf = async (source) => {
    const tiles = await downloadTiles(source, extent.zoom, sample, {
      loadTile: cachedTileLoader({ cacheDir: cacheDir(), basemapId: source.id, zoom: extent.zoom }),
      concurrency: CONCURRENCY,
    });
    return tileSizes(tiles);
  };

  const sampleSizes = await sizesOf(basemap);
  const layers = [];
  // A layer we draw ourselves has no tiles to sample, and adds nothing to the file.
  for (const layer of chooseMapLayers(request.mapLayers ?? []).filter(isTileLayer)) {
    layers.push({ layer, sampleSizes: await sizesOf(layer) });
  }
  return {
    size: estimateFileSize({
      basemap,
      format: request.format,
      grayscale: request.grayscale,
      palette: canUsePalette(basemap, request.format),
      zoom: extent.zoom,
      tileCount: extent.tileCount,
      sampleSizes,
      layers,
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
      onProgress: (done, total) => event.sender.send('progress', { sourceId: basemap.id, done, total }),
    });

    const { pixels, missing } = await assembleTiles(extent, tiles, { grayscale: request.grayscale });

    const mapLayers = chooseMapLayers(request.mapLayers ?? []);
    const vectorShapes = [];
    const legendExtra = [];
    for (const layer of mapLayers) {
      if (isVectorLayer(layer)) {
        const vectorTiles = await readVectorLayer(layer, extent);
        vectorShapes.push(...vectorTileShapes(vectorTiles, extent, { styleOf: vectorStyleOf(layer) }));
        legendExtra.push(...mapLayerLegendEntries(layer, categoriesInTiles(layer, vectorTiles)));
        event.sender.send('progress', { sourceId: layer.id, done: 1, total: 1 });
        continue;
      }

      if (isWmsLayer(layer)) {
        const blocks = wmsRequests(layer, extent);
        for (const [index, block] of blocks.entries()) {
          block.content = await fetchTile(block.url);
          event.sender.send('progress', { sourceId: layer.id, done: index + 1, total: blocks.length });
        }
        await drawWmsLayer(pixels, extent, blocks, { opacity: layer.opacity });
        const legend = await fetchTile(wmsLegendUrl(layer)).catch(() => null);
        if (legend) legendExtra.push(await legendImageEntry(legend));
        continue;
      }

      const layerTiles = await downloadTiles(layer, extent.zoom, [...tilesInExtent(extent)], {
        loadTile: cachedTileLoader({ cacheDir: cacheDir(), basemapId: layer.id, zoom: extent.zoom }),
        concurrency: CONCURRENCY,
        signal: generation.signal,
        onProgress: (done, total) => event.sender.send('progress', { sourceId: layer.id, done, total }),
      });
      await drawMapLayer(pixels, extent, layerTiles, { opacity: layer.opacity });
    }

    const layers = request.layers ?? [];
    const sources = await withUpdateDates([
      basemap,
      ...mapLayers,
      ...(request.outline ? [BOUNDARY_SOURCE] : []),
    ]);
    const added = layersSource(layers);
    if (added) sources.push(added);

    const overlays = vectorOverlays(vectorShapes);
    if (request.outline) overlays.push(boundaryOutline(request.boundary, extent));
    overlays.push(...layerOverlays(layers, extent));
    if (request.legend !== false) overlays.push(await legendOverlay(layers, extent, legendExtra));
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
