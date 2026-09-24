#!/usr/bin/env node
// Prepares and serves the page that measures the canvas of a browser (#5): how large an image it can draw, how
// it fails beyond, and how much its encoders weigh against sharp. Nothing is asked of any service: the maps are
// assembled from the tiles of Colombiers at zoom 15 and 16, read from the cache — generate them once first:
//   node src/node/cli.js generer 86081 -z 16   (and -z 15)
// Then open the address printed in each browser, and copy what the page writes.

import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BASEMAPS } from '../src/core/basemaps.js';
import { extentFromBbox, tilesInExtent } from '../src/core/tiles.js';
import { assembleTiles, saveImage } from '../src/node/render.js';

const OUTPUT = 'dist-mesure';
const CACHE = '.cache/tiles/plan-ign';
// Colombiers, as ADMIN EXPRESS draws it: its bbox is written here, not asked of the WFS again.
const BBOX = [0.38344088, 46.75332418, 0.48673916, 46.80743244];
const PORT = Number(process.argv[2]) || 8810;

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(path.join(OUTPUT, 'tuiles'), { recursive: true });
for (const file of ['index.html', 'mesure.js']) {
  await copyFile(path.join('scripts', 'mesure-navigateurs', file), path.join(OUTPUT, file));
}

const manifest = { basemapRatios: BASEMAPS['plan-ign'].fileSizeRatios, maps: [] };
for (const zoom of [15, 16]) {
  const extent = extentFromBbox(BBOX, zoom, 0.03);
  const tiles = [...tilesInExtent(extent)];
  let tileBytes = 0;
  for (const { x, y } of tiles) {
    const cached = path.join(CACHE, String(zoom), String(x), `${y}.tile`);
    if (!existsSync(cached)) {
      throw new Error(`Tuile absente du cache : ${cached}. Générez d'abord node src/node/cli.js generer 86081 -z ${zoom}.`);
    }
    await copyFile(cached, path.join(OUTPUT, 'tuiles', `${zoom}-${x}-${y}.png`));
    tileBytes += (await stat(cached)).size;
  }
  // The weight sharp gives the same images, to compare the browsers with.
  const sharp = {};
  for (const grayscale of [false, true]) {
    const { pixels } = await assembleTiles(extent, tiles.map(({ x, y }) => ({ x, y, content: path.join(CACHE, String(zoom), String(x), `${y}.tile`) })), { grayscale });
    for (const format of ['png', 'jpg']) {
      const file = path.join(tmpdir(), `cartes-mesure.${format}`);
      await saveImage(pixels, extent, file, { dpi: 150 });
      sharp[`${grayscale ? 'gris' : 'couleur'}-${format}`] = (await stat(file)).size;
    }
  }
  manifest.maps.push({ zoom, xMin: extent.xMin, yMin: extent.yMin, width: extent.width, height: extent.height, tiles, tileBytes, sharp });
}
await writeFile(path.join(OUTPUT, 'carte.json'), JSON.stringify(manifest));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
http
  .createServer(async (request, response) => {
    const requested = new URL(request.url, 'http://localhost').pathname;
    const file = path.join(OUTPUT, requested === '/' ? 'index.html' : requested);
    if (!path.resolve(file).startsWith(path.resolve(OUTPUT)) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  })
  .listen(PORT, () => console.log(`Page de mesure servie sur http://localhost:${PORT}/ — ouvrez-la dans chaque navigateur.`));
