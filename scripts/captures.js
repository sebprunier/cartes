// Takes again the screenshots of the documentation that show the interface of the tool: ten of the page that
// generates the maps, driven as a user would on Colombiers (Vienne), and the window of the desktop application.
// Each is written as the others are: at twice the resolution, declared by its 144 dpi, with a palette of 256
// colors, and 14 pixels of the page around what it shows. The dialogs of macOS and the installation under
// Windows stay taken by hand: they belong to the systems, not to the tool.
//
// Run by `npm run captures`, under macOS, whose screencapture takes a window with its frame; `npm run captures --
// generer-2-reglages bureau-fenetre` takes only the ones named. Like the page, it asks the public services: the
// geocoding of eight addresses, the tiles of the preview and those of a map at zoom 16.

import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { BrowserWindow, app } from 'electron';
import sharp from 'sharp';

import { boundaryBbox, fetchBoundary } from '../src/core/municipalities.js';
import { extentFromBbox, lonLatToPixel } from '../src/core/tiles.js';

const REPOSITORY = path.join(import.meta.dirname, '..');
const OUTPUT = path.join(REPOSITORY, 'docs', 'images', 'captures');
const SITE = path.join(REPOSITORY, 'dist');
// What the screenshots show around their subject, in pixels of the page.
const MARGIN = 14;
// The page at its full width, 62rem, and taller than its tallest dialog.
const PAGE_WIDTH = 1100;
const PAGE_HEIGHT = 1300;
// The window of the application, in points: the width of the page, and a height that stops below the first
// settings.
const WINDOW_WIDTH = 1000;
const WINDOW_HEIGHT = 728;
// The town hall of Colombiers, where the extract of the preview is placed, as in the illustrations.
const TOWN_HALL = [0.426713, 46.772149];
// A file of addresses as a town hall writes them: five right, two with a mistake the service still finds, and
// the name of a place, which is not an address — the three outcomes of the geocoding, in eight lines.
const ADDRESSES =
  'nom;adresse\n' +
  'Cimetière;6 Route du Vivier 86490 Colombiers\n' +
  'La Bougrière;8 Route de la Bougrière 86490 Colombiers\n' +
  'Salle des fêtes;2 Rue de la Perroterie 86490 Colombiers\n' +
  'Place de la mairie;Place Manderen 86490 Colombiers\n' +
  'La Bouillerie;La Guédonnière 86490 Colombiers\n' +
  'Lotissement de la Grande Vallée;10 Rue de la Grnade Vallée\n' +
  'Nouveau lotissement;251 Rue Claveurier\n' +
  'Salle;Salle des fêtes\n';

// Helpers of the page, to write its steps as a user does them.
const HELPERS = `window.captures = {
  async wait(ready, what, timeout = 60000) {
    const start = Date.now();
    while (!ready()) {
      if (Date.now() - start > timeout) throw new Error('Délai dépassé : ' + what);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },
  shown: (element) => Boolean(element) && !element.hidden && element.getClientRects().length > 0,
  type(field, value) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  },
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  // The file of the list whose addresses were geocoded.
  geocoded: () =>
    [...document.querySelectorAll('#layers > li')].find((item) => item.querySelector('.geocoding-summary')),
  // The area around the elements, brought into view, in pixels of the document.
  frame(...elements) {
    // Well below the bar of the page, which stays at the top as it scrolls.
    elements[0].scrollIntoView({ block: 'start' });
    window.scrollBy(0, -200);
    const boxes = elements.map((element) => element.getBoundingClientRect());
    const left = Math.floor(Math.min(...boxes.map((box) => box.left)) - ${MARGIN});
    const top = Math.floor(Math.min(...boxes.map((box) => box.top)) - ${MARGIN});
    const right = Math.ceil(Math.max(...boxes.map((box) => box.right)) + ${MARGIN});
    const bottom = Math.ceil(Math.max(...boxes.map((box) => box.bottom)) + ${MARGIN});
    return { x: left + window.scrollX, y: top + window.scrollY, width: right - left, height: bottom - top };
  },
  // Once what the page has just shown, or scrolled to, is drawn.
  painted: () =>
    new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 600)),
};
undefined;`;

/**
 * The screenshots of the page, in the order a user meets them: each one the steps that lead to it — what is
 * done before choosing its file, the file chosen, what is done then —, and what it frames. A step marked `alone`
 * — it asks the services at length — runs only when its own screenshot is asked for; the others run whenever a
 * later screenshot needs the page where they leave it.
 */
const STEPS = [
  {
    name: 'generer-1-commune',
    act: `const field = document.getElementById('search');
      captures.type(field, 'Colombiers');
      const results = document.getElementById('results');
      await captures.wait(() => captures.shown(results) && results.children.length > 1, 'la liste des communes');
      field.blur();`,
    frame: `captures.frame(document.getElementById('search').closest('section'))`,
  },
  {
    name: 'generer-2-reglages',
    act: `[...document.getElementById('results').children].find((item) => item.textContent.startsWith('86081')).click();
      const settings = document.getElementById('settings');
      await captures.wait(() => captures.shown(settings) && settings.querySelector('tbody tr'), 'les réglages');`,
    frame: `captures.frame(document.getElementById('settings'))`,
  },
  {
    name: 'donnees-catalogue',
    act: `document.getElementById('add-map-layer').click();
      await captures.wait(() => document.getElementById('layer-chooser').open, 'le catalogue');
      // The catalog checks the service of each layer as it opens: their answers come first.
      await captures.pause(6000);`,
    frame: `captures.frame(document.getElementById('layer-chooser'))`,
    // A service down that day would be shown as such: said, for the screenshot to be taken again later.
    warning: `[...document.querySelectorAll('#layer-chooser .layer-badge.danger')].map(
      (badge) => badge.closest('.layer-choice').querySelector('.layer-choice-name').textContent,
    )`,
    after: `document.getElementById('close-layer-chooser').click();`,
  },
  {
    name: 'donnees-couche-adresse',
    act: `document.getElementById('add-map-layer').click();
      document.getElementById('open-custom-layer').click();
      await captures.wait(() => document.getElementById('custom-layer-form').open, 'le formulaire');
      const field = (id) => document.getElementById(id);
      captures.type(field('custom-layer-url'), 'https://tuiles.exemple.fr/zones-humides/{z}/{x}/{y}.png');
      captures.type(field('custom-layer-name'), 'Zones humides');
      captures.type(field('custom-layer-source'), '© Syndicat mixte du bassin du Clain');
      document.activeElement.blur();`,
    frame: `captures.frame(document.getElementById('custom-layer-form'))`,
    after: `document.getElementById('close-custom-layer').click();`,
  },
  {
    name: 'donnees-fichier',
    file: () => path.join(REPOSITORY, 'exemples', 'colombiers-apport-volontaire.geojson'),
    act: `const added = () => document.querySelectorAll('#layers > li').length === 1;
      await captures.wait(() => added() && captures.shown(document.getElementById('legend-choice')), 'le fichier');`,
    // From the title of the files to the choice of the legend, the privacy of the files between them.
    frame: `captures.frame(
      [...document.querySelectorAll('#data h3')].find((title) => title.textContent.trim() === 'Vos fichiers'),
      document.getElementById('legend-choice'),
    )`,
  },
  {
    name: 'generer-4-apercu',
    alone: true,
    act: (townHall) => `const button = document.getElementById('preview-button');
      button.click();
      const views = document.getElementById('preview-views');
      const weighed = () => document.getElementById('preview').textContent.includes('≈');
      await captures.wait(() => captures.shown(views) && !button.disabled && weighed(), "l'aperçu", 180000);
      // The extract is placed on the village by a click on its town hall in the miniature, as the page offers.
      const miniature = document.querySelector('#preview-overview canvas');
      const detail = document.querySelector('#preview-detail canvas');
      const box = miniature.getBoundingClientRect();
      miniature.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: box.left + ${townHall.x} * box.width,
        clientY: box.top + ${townHall.y} * box.height,
      }));
      const moved = () => document.querySelector('#preview-detail canvas') !== detail;
      await captures.wait(() => moved() && !button.disabled, "l'extrait déplacé", 180000);`,
    frame: `captures.frame(document.getElementById('preview'))`,
  },
  {
    name: 'donnees-geocodage-offre',
    // The file of addresses alone in the list, as a first file: the points of the examples are taken away.
    before: `[...document.querySelectorAll('#layers > li button')]
      .find((button) => button.textContent.trim() === 'Retirer')
      ?.click();`,
    file: (work) => path.join(work, 'adresses.csv'),
    act: `await captures.wait(() => captures.shown(document.getElementById('geocoding')), "l'offre");`,
    frame: `captures.frame(document.getElementById('geocoding'))`,
  },
  {
    name: 'donnees-geocodage-bilan',
    alone: true,
    act: `document.querySelector('#geocoding button').click();
      await captures.wait(() => captures.geocoded(), 'le bilan du géocodage', 120000);
      const details = captures.geocoded().querySelector('details');
      if (details) details.open = true;`,
    frame: `captures.frame(captures.geocoded())`,
  },
  {
    name: 'generer-5-carte',
    alone: true,
    // The time the page gives is that of a first map, its tiles downloaded, and not the second of a map whose
    // tiles the browser kept from the previous captures.
    emptyCache: true,
    act: `document.getElementById('generate').click();
      const [result, failed] = [document.getElementById('result'), document.getElementById('error')];
      await captures.wait(() => captures.shown(result) || captures.shown(failed), 'la carte', 600000);
      if (captures.shown(failed)) throw new Error(failed.textContent);`,
    frame: `captures.frame(document.getElementById('generation'))`,
    // The Géoplateforme sometimes fails a tile, or a date in its catalog: the map says so, and would show it.
    warning: `document.getElementById('result').textContent.includes('indisponible') ? ['une tuile ou la date des données'] : []`,
  },
  {
    name: 'probleme-limite-navigateur',
    act: `const zoom = document.getElementById('zoom');
      zoom.value = zoom.options[zoom.options.length - 1].value;
      zoom.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('generate').click();
      await captures.wait(() => captures.shown(document.getElementById('error')), 'le message de limite');`,
    frame: `captures.frame(document.getElementById('generation'))`,
  },
];
const WINDOW = 'bureau-fenetre';
const NAMES = [...STEPS.map(({ name }) => name), WINDOW];

// The windows are closed by the script, which quits once done: not when the last one closes.
app.on('window-all-closed', () => {});

const asked = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
const unknown = asked.filter((name) => !NAMES.includes(name));
if (process.platform !== 'darwin') {
  fail('Les captures se prennent sous macOS : screencapture y prend la fenêtre de l’application avec son cadre.');
} else if (unknown.length > 0) {
  fail(`Capture inconnue : ${unknown.join(', ')}. Captures possibles : ${NAMES.join(', ')}.`);
} else {
  // Not awaited: Electron is ready only once this module is loaded, and waiting for it here would never end.
  app.whenReady().then(() => captureAll(new Set(asked.length > 0 ? asked : NAMES)));
}

function fail(message) {
  console.error(message);
  app.exit(1);
}

async function captureAll(wanted) {
  const work = await mkdtemp(path.join(tmpdir(), 'cartes-captures-'));
  try {
    await writeFile(path.join(work, 'adresses.csv'), ADDRESSES);
    await capturePage(wanted, work);
    if (wanted.has(WINDOW)) await captureWindow(work);
    console.log('À prendre à la main : les dialogues de macOS (macos-*), l’installation sous Windows (windows-*).');
  } catch (error) {
    console.error(`Capture impossible : ${error.message}`);
    process.exitCode = 1;
  } finally {
    await rm(work, { recursive: true, force: true });
    app.quit();
  }
}

/** The screenshots of the page asked for, with every step that leads to them. */
async function capturePage(wanted, work) {
  const last = STEPS.findLastIndex(({ name }) => wanted.has(name));
  if (last === -1) return;
  const steps = STEPS.slice(0, last + 1).filter(({ name, alone }) => !alone || wanted.has(name));

  const server = await serve(SITE);
  const window = new BrowserWindow({
    show: false,
    width: PAGE_WIDTH,
    height: 800,
    webPreferences: { backgroundThrottling: false },
  });
  const { debugger: devtools } = window.webContents;
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/generer/`);
    devtools.attach('1.3');
    // The page at its size and at twice the resolution, whatever the window and the screen.
    await devtools.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await window.webContents.executeJavaScript(HELPERS);
    // A dialog shown alone, on the page background, rather than behind the dark veil of the page.
    await window.webContents.insertCSS(
      'dialog::backdrop { background: #f5f7f9 !important; backdrop-filter: none !important; }',
    );
    const townHall = await townHallInMiniature();

    for (const step of steps) {
      if (step.emptyCache) await window.webContents.session.clearCache();
      if (step.before) await window.webContents.executeJavaScript(step.before);
      if (step.file) await chooseFile(devtools, step.file(work));
      const act = typeof step.act === 'function' ? step.act(townHall) : step.act;
      await window.webContents.executeJavaScript(`(async () => { ${act} })()`);
      if (wanted.has(step.name)) {
        const clip = await window.webContents.executeJavaScript(step.frame);
        await window.webContents.executeJavaScript('captures.painted()');
        const screenshot = { format: 'png', clip: { ...clip, scale: 1 } };
        const { data } = await devtools.sendCommand('Page.captureScreenshot', screenshot);
        await write(Buffer.from(data, 'base64'), step.name);
        if (step.warning) {
          const down = await window.webContents.executeJavaScript(step.warning);
          if (down.length > 0) {
            console.warn(`  Indisponible ce jour : ${down.join(', ')}. Reprenez la capture une fois le service rétabli.`);
          }
        }
      }
      if (step.after) await window.webContents.executeJavaScript(step.after);
    }
  } finally {
    window.destroy();
    server.close();
  }
}

/** Where the town hall of Colombiers falls in the miniature of the preview, as a fraction of its width and height. */
async function townHallInMiniature() {
  const extent = extentFromBbox(boundaryBbox(await fetchBoundary('86081')), 13, 0.03);
  const [x, y] = lonLatToPixel(...TOWN_HALL, extent.zoom);
  return { x: (x - extent.xMin) / extent.width, y: (y - extent.yMin) / extent.height };
}

/** Gives a file to the field of the files of the page, as a user choosing it would. */
async function chooseFile(devtools, file) {
  const { root } = await devtools.sendCommand('DOM.getDocument');
  const { nodeId } = await devtools.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '#data-files' });
  await devtools.sendCommand('DOM.setFileInputFiles', { nodeId, files: [file] });
}

/**
 * The window of the application, with its frame: opened at its size, Colombiers (Vienne) chosen, captured by
 * macOS. The real pointer passes over it without acting on it, and leaves the page before the capture — hovering
 * the search field, it would show its clear button.
 */
async function captureWindow(work) {
  const opened = new Promise((resolve) =>
    app.once('browser-window-created', (_, window) => {
      window.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);
      window.center();
      window.setIgnoreMouseEvents(true);
      window.webContents.once('did-finish-load', () => resolve(window));
    }),
  );
  await import('../electron/main.js');
  const window = await opened;
  try {
    await window.webContents.executeJavaScript(HELPERS);
    await window.webContents.executeJavaScript(`(async () => {
      const banner = document.getElementById('update-banner');
      if (!banner.hidden) document.getElementById('update-later').click();
      ${STEPS[0].act}
      ${STEPS[1].act}
      window.scrollTo(0, 0);
    })()`);
    window.webContents.sendInputEvent({ type: 'mouseLeave', x: 0, y: 0 });
    await window.webContents.executeJavaScript('captures.pause(1500)');
    const raw = path.join(work, 'fenetre.png');
    await promisify(execFile)('screencapture', ['-o', '-x', `-l${window.getMediaSourceId().split(':')[1]}`, raw]);
    const { width } = await sharp(raw).metadata();
    if (width !== 2 * WINDOW_WIDTH) {
      throw new Error(`fenêtre capturée sur ${width} pixels de large : il faut un écran Retina.`);
    }
    await write(raw, WINDOW);
  } finally {
    window.destroy();
  }
}

/** Writes a screenshot as the others: declared at 144 dpi, the density of twice the resolution, in 256 colors. */
async function write(image, name) {
  const file = path.join(OUTPUT, `${name}.png`);
  await sharp(image).withMetadata({ density: 144 }).png({ palette: true, quality: 95, effort: 10 }).toFile(file);
  const { width, height } = await sharp(file).metadata();
  console.log(`${path.relative(REPOSITORY, file)} : ${width} × ${height}`);
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/** Serves the site built into `root`, on a free port: the page runs as on GitHub Pages, modules and worker included. */
function serve(root) {
  const server = http.createServer(async (request, response) => {
    let file = path.join(root, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      await stat(file);
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
