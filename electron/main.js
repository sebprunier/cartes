// Main process: window, and generation of the maps with the same code as the command line.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from 'electron';

import { BASEMAPS } from '../src/core/basemaps.js';
import { readCapabilities } from '../src/core/capabilities.js';
import { request } from '../src/core/http.js';
import { checkMapLayer, chooseMapLayers, customMapLayer } from '../src/core/maplayers.js';
import { extentFromBbox } from '../src/core/tiles.js';
import { LATEST_RELEASE_URL, newerRelease } from '../src/core/versions.js';
import { cachedTileLoader } from '../src/node/cache.js';
import { estimateMapFileSize, generateMap } from '../src/node/generate.js';

const CONCURRENCY = 6;
const MARGIN_DEFAULT = 0.03;

const cacheDir = () => path.join(app.getPath('userData'), 'tuiles');
let generation;

const DOCUMENTATION = 'https://sebprunier.github.io/cartes/';
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
// The capabilities of a WMS are read here too, free of the rules a service sets for other sites.
ipcMain.handle('capabilities', async (event, address) => {
  try {
    return await readCapabilities(address);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('check-layer', async (event, definition, place) => {
  try {
    return await checkMapLayer(customMapLayer(definition), place);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('estimate', async (event, request) => {
  const { basemap, extent } = plan(request);
  const size = await estimateMapFileSize({
    basemap,
    extent,
    mapLayers: chooseMapLayers(request.mapLayers ?? []),
    format: request.format,
    grayscale: request.grayscale,
    cacheDir: cacheDir(),
    concurrency: CONCURRENCY,
  });
  return { size };
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
    const result = await generateMap(
      {
        basemap,
        extent,
        boundary: request.boundary,
        layers: request.layers ?? [],
        mapLayers: chooseMapLayers(request.mapLayers ?? []),
        outline: request.outline,
        legend: request.legend !== false,
        grayscale: request.grayscale,
        dpi: request.dpi ?? 150,
        format: request.format,
        outputPath: filePath,
        cacheDir: cacheDir(),
        concurrency: CONCURRENCY,
      },
      { onProgress: (progress) => event.sender.send('progress', progress), signal: generation.signal },
    );
    return { path: filePath, ...result };
  } finally {
    generation = undefined;
  }
});

ipcMain.handle('cancel', () => generation?.abort());

// A version more recent than this one, asked of GitHub once the interface is shown: the only request the
// application makes on its own. Offline, GitHub unavailable, its limit reached (60 requests an hour for an
// address): nothing is said, finding the new version is no work of the town hall's.
ipcMain.handle('newer-version', async () => {
  // Run from its sources, the application can pretend to be older, to show what an installed one would.
  const installed = (!app.isPackaged && process.env.CARTES_VERSION) || app.getVersion();
  try {
    const response = await request(LATEST_RELEASE_URL, { Accept: 'application/vnd.github+json' }, { timeoutMs: 10_000 });
    if (!response.ok) return null;
    return newerRelease(await response.json(), installed) ?? null;
  } catch {
    return null;
  }
});

/** Basemap and pixel extent of a request coming from the interface. */
function plan({ basemapId, bbox, zoom, margin = MARGIN_DEFAULT }) {
  return { basemap: BASEMAPS[basemapId], extent: extentFromBbox(bbox, zoom, margin) };
}
