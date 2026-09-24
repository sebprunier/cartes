#!/usr/bin/env node
// Builds the illustrations of the documentation from real maps of Colombiers, drawn by the functions of the tool
// itself: run again after a change of the rendering, they show what the tool does now. Needs the network, or the
// tiles in the cache (.cache/tiles). Writes into docs/images/.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

import { BASEMAPS } from '../src/core/basemaps.js';
import { CHANNELS } from '../src/core/image.js';
import { layersSource, readLayer } from '../src/core/layers.js';
import { chooseMapLayers, mapLayerLegendEntries, vectorStyleOf } from '../src/core/maplayers.js';
import { withUpdateDates } from '../src/core/metadata.js';
import { BOUNDARY_SOURCE, boundaryBbox, fetchBoundary } from '../src/core/municipalities.js';
import { attributionText, boundaryPath } from '../src/core/overlays.js';
import { TILE_SIZE, downloadTiles, extentFromBbox, lonLatToPixel, tilesInExtent } from '../src/core/tiles.js';
import { categoriesInTiles, readVectorLayer, vectorTileShapes } from '../src/core/vectortiles.js';
import { cachedTileLoader } from '../src/node/cache.js';
import { generateMap } from '../src/node/generate.js';
import {
  assembleTiles,
  attributionLabel,
  boundaryOutline,
  drawOverlays,
  layerOverlays,
  legendOverlay,
  vectorOverlays,
} from '../src/node/render.js';

const OUTPUT = 'docs/images';
const CACHE = '.cache/tiles';
const MARGIN = 0.03;
const BASEMAP = BASEMAPS['plan-ign'];
const DATA_FILE = 'exemples/colombiers-apport-volontaire.geojson';
const DATA_TITLE = "Points d'apport volontaire";
// The town hall of Colombiers, at the centre of the extracts.
const TOWN_HALL = [0.426713, 46.772149];
const INK = '#17232f';
const BRAND = '#0e4777';
const ACCENT = '#15814f';
const FONT = 'Helvetica, Arial, sans-serif';

const boundary = await fetchBoundary('86081');
const bbox = boundaryBbox(boundary);
const data = readLayer(await readFile(DATA_FILE, 'utf8'), { fileName: path.basename(DATA_FILE), name: DATA_TITLE });
const work = await mkdtemp(path.join(tmpdir(), 'cartes-illustrations-'));

try {
  await tilesFigure(13);
  await layersFigure(14);
  await examples();
  await zoomComparison();
} finally {
  await rm(work, { recursive: true, force: true });
}

/** Tiles of the basemap covering the extent at `zoom`, downloaded or read from the cache. */
async function tilesOf(extent) {
  return downloadTiles(BASEMAP, extent.zoom, [...tilesInExtent(extent)], {
    loadTile: cachedTileLoader({ cacheDir: CACHE, basemapId: BASEMAP.id, zoom: extent.zoom }),
    concurrency: 6,
  });
}

/** A PNG with 256 colors, as small as the documentation needs it. */
function write(image, name) {
  const file = path.join(OUTPUT, name);
  console.log(`${file}`);
  return image.png({ palette: true, quality: 95, effort: 10 }).toFile(file);
}

/** Text of an SVG, escaped. */
function text(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * The whole tiles downloaded for the map at `zoom`, with their grid; the extent they are cut to, and outside it,
 * what is downloaded but dropped; the boundary of the municipality. Beside it, the image once cut.
 */
async function tilesFigure(zoom) {
  const extent = extentFromBbox(bbox, zoom, MARGIN);
  const tiles = await tilesOf(extent);
  const xs = tiles.map((tile) => tile.x);
  const ys = tiles.map((tile) => tile.y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const columns = Math.max(...xs) - x0 + 1;
  const rows = Math.max(...ys) - y0 + 1;
  const width = columns * TILE_SIZE;
  const height = rows * TILE_SIZE;

  const mosaic = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(
      tiles
        .filter((tile) => tile.content)
        .map((tile) => ({ input: tile.content, left: (tile.x - x0) * TILE_SIZE, top: (tile.y - y0) * TILE_SIZE })),
    )
    .png()
    .toBuffer();

  const left = extent.xMin - x0 * TILE_SIZE;
  const top = extent.yMin - y0 * TILE_SIZE;
  const { path: outline } = boundaryPath(boundary, extent);
  const grid = [
    ...Array.from({ length: columns - 1 }, (_, i) => `M${(i + 1) * TILE_SIZE},0V${height}`),
    ...Array.from({ length: rows - 1 }, (_, i) => `M0,${(i + 1) * TILE_SIZE}H${width}`),
  ].join('');
  const labels = tiles
    .map(
      (tile) =>
        `<text x="${(tile.x - x0) * TILE_SIZE + 8}" y="${(tile.y - y0) * TILE_SIZE + 20}" font-family="${FONT}" ` +
        `font-size="13" font-weight="600" fill="${BRAND}" stroke="#fff" stroke-width="3" paint-order="stroke">` +
        `${zoom}/${tile.x}/${tile.y}</text>`,
    )
    .join('');
  const overlay =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    // What is downloaded but falls outside the extent is dimmed: it is cut away.
    `<path fill="#ffffff" fill-opacity="0.6" fill-rule="evenodd" d="M0,0H${width}V${height}H0Z M${left},${top}h${extent.width}v${extent.height}h-${extent.width}Z"/>` +
    `<path d="${grid}" stroke="${BRAND}" stroke-width="1.5" stroke-dasharray="6 4" fill="none"/>` +
    `<rect x="${left}" y="${top}" width="${extent.width}" height="${extent.height}" fill="none" stroke="${ACCENT}" stroke-width="3"/>` +
    `<g transform="translate(${left},${top})"><path d="${outline}" fill="none" stroke="#b3261e" stroke-width="3" stroke-linejoin="round"/></g>` +
    labels +
    '</svg>';
  await write(sharp(mosaic).composite([{ input: Buffer.from(overlay) }]), 'comment-tuiles.png');

  await assemblyFigure(extent, tiles, { x0, y0, columns, rows, mosaic });
}

/**
 * The assembly, in three steps: the tiles one by one, as they arrive; put edge to edge, with what falls outside
 * the extent hatched; cut to the extent, as the tool does it.
 */
async function assemblyFigure(extent, tiles, { x0, y0, columns, rows, mosaic }) {
  const tile = 144;
  const scale = tile / TILE_SIZE;
  const gap = 16;
  const title = 46;
  const arrow = 64;
  const scaled = (value) => Math.round(value * scale);

  // Step 1: the tiles apart.
  const apartWidth = columns * tile + (columns - 1) * gap;
  const apartHeight = rows * tile + (rows - 1) * gap;
  // Step 2: the tiles edge to edge, beside the first.
  const joinedLeft = apartWidth + arrow;
  const joinedWidth = columns * tile;
  const joinedHeight = rows * tile;
  const left = scaled(extent.xMin - x0 * TILE_SIZE);
  const top = scaled(extent.yMin - y0 * TILE_SIZE);
  const cutWidth = scaled(extent.width);
  const cutHeight = scaled(extent.height);
  // Step 3: the image cut, under the second, where the extent was.
  const cutTop = title + apartHeight + arrow + title;
  const width = joinedLeft + joinedWidth;
  const height = cutTop + cutHeight + 2;

  const pieces = await Promise.all(
    tiles
      .filter((each) => each.content)
      .map(async (each) => ({
        input: await sharp(each.content).resize(tile, tile).png().toBuffer(),
        left: (each.x - x0) * (tile + gap),
        top: title + (each.y - y0) * (tile + gap),
      })),
  );
  const joined = await sharp(mosaic).resize(joinedWidth, joinedHeight).png().toBuffer();
  const { pixels } = await assembleTiles(extent, tiles);
  const cut = await sharp(pixels, { raw: { width: extent.width, height: extent.height, channels: CHANNELS } })
    .resize(cutWidth, cutHeight)
    .png()
    .toBuffer();

  const label = (x, y, value, { size = 25, weight = 600, fill = INK, anchor = 'start' } = {}) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}">${text(value)}</text>`;
  const frame = (x, y, w, h, stroke = '#cfd7df', strokeWidth = 1) =>
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  const frames = pieces.map(({ left: x, top: y }) => frame(x, y, tile, tile)).join('');
  const grid = [
    ...Array.from({ length: columns - 1 }, (_, i) => `M${joinedLeft + (i + 1) * tile},${title}v${joinedHeight}`),
    ...Array.from({ length: rows - 1 }, (_, i) => `M${joinedLeft},${title + (i + 1) * tile}h${joinedWidth}`),
  ].join('');
  const [ex, ey] = [joinedLeft + left, title + top];
  const count = tiles.length;
  const pixelCount = (value) => value.toLocaleString('fr-FR').replace(/\s/g, ' ');
  const middle = title + apartHeight / 2;
  const overlay =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    '<defs>' +
    `<pattern id="cut" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#ffffff" fill-opacity="0.55"/><path d="M0,0V10" stroke="#b3261e" stroke-width="2" stroke-opacity="0.45"/></pattern>` +
    `<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="${ACCENT}"/></marker>` +
    '</defs>' +
    label(0, 32, `1. Les ${count} tuiles, telles qu’elles arrivent`) +
    frames +
    `<path d="M${apartWidth + 12},${middle}h${arrow - 24}" stroke="${ACCENT}" stroke-width="3" marker-end="url(#arrow)"/>` +
    label(joinedLeft, 32, '2. Recollées bord à bord') +
    `<path fill="url(#cut)" fill-rule="evenodd" d="M${joinedLeft},${title}h${joinedWidth}v${joinedHeight}h-${joinedWidth}Z M${ex},${ey}h${cutWidth}v${cutHeight}h-${cutWidth}Z"/>` +
    `<path d="${grid}" stroke="${BRAND}" stroke-width="1.5" stroke-dasharray="6 4" fill="none"/>` +
    frame(ex, ey, cutWidth, cutHeight, ACCENT, 3) +
    `<path d="M${ex + cutWidth / 2},${title + joinedHeight + 12}v${cutTop - title - joinedHeight - 62}" stroke="${ACCENT}" stroke-width="3" marker-end="url(#arrow)"/>` +
    label(ex, cutTop - 14, '3. Rognées sur l’emprise') +
    frame(ex, cutTop, cutWidth, cutHeight) +
    label(0, cutTop + 22, `Recollées, les tuiles font ${pixelCount(columns * TILE_SIZE)} × ${pixelCount(rows * TILE_SIZE)} pixels.`, { size: 23, weight: 400 }) +
    label(0, cutTop + 58, 'Les bandes hachurées sont rognées : il reste', { size: 23, weight: 400 }) +
    label(0, cutTop + 94, `${pixelCount(extent.width)} × ${pixelCount(extent.height)} pixels, les dimensions exactes`, { size: 23, weight: 400 }) +
    label(0, cutTop + 130, 'de l’emprise, en vert.', { size: 23, weight: 400 }) +
    '</svg>';

  await write(
    sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite([
      ...pieces,
      { input: joined, left: joinedLeft, top: title },
      { input: cut, left: ex, top: cutTop },
      { input: Buffer.from(overlay) },
    ]),
    'comment-assemblage.png',
  );
}

/** The same map at `zoom`, layer after layer: the basemap, a layer, the boundary and the data, the legend. */
async function layersFigure(zoom) {
  const extent = extentFromBbox(bbox, zoom, MARGIN);
  const { pixels } = await assembleTiles(extent, await tilesOf(extent));
  const stages = [];
  const snapshot = () =>
    sharp(Buffer.from(pixels), { raw: { width: extent.width, height: extent.height, channels: CHANNELS } })
      .resize({ width: 620 })
      .png()
      .toBuffer();

  stages.push(await snapshot());
  const [clay] = chooseMapLayers([{ id: 'argiles' }]);
  const vectorTiles = await readVectorLayer(clay, extent);
  await drawOverlays(pixels, extent, vectorOverlays(vectorTileShapes(vectorTiles, extent, { styleOf: vectorStyleOf(clay) })));
  stages.push(await snapshot());
  await drawOverlays(pixels, extent, [boundaryOutline(boundary, extent), ...layerOverlays([data], extent)]);
  stages.push(await snapshot());
  const legendExtra = mapLayerLegendEntries(clay, categoriesInTiles(clay, vectorTiles));
  const sources = await withUpdateDates([BASEMAP, clay, BOUNDARY_SOURCE]);
  sources.push(layersSource([data]));
  await drawOverlays(pixels, extent, [
    await legendOverlay([data], extent, legendExtra),
    await attributionLabel(attributionText({ sources }), extent),
  ]);
  stages.push(await snapshot());

  const titles = [
    '1. Les tuiles du fond de carte, assemblées',
    "2. Une couche : l'aléa argiles, dessinée par l'outil",
    '3. Le contour de la commune et vos données',
    '4. La légende et la mention des sources',
  ];
  const { height: stageHeight } = await sharp(stages[0]).metadata();
  const gap = 24;
  const title = 34;
  const width = 2 * 620 + gap;
  const height = 2 * (title + stageHeight) + gap;
  const at = (index) => ({ left: (index % 2) * (620 + gap), top: Math.floor(index / 2) * (title + stageHeight + gap) });
  const frames = stages
    .map((_, index) => {
      const { left, top } = at(index);
      return (
        `<text x="${left}" y="${top + 22}" font-family="${FONT}" font-size="17" font-weight="600" fill="${INK}">${text(titles[index])}</text>` +
        `<rect x="${left + 0.5}" y="${top + title + 0.5}" width="619" height="${stageHeight - 1}" fill="none" stroke="#cfd7df"/>`
      );
    })
    .join('');
  await write(
    sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite([
      ...stages.map((input, index) => ({ input, left: at(index).left, top: at(index).top + title })),
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${frames}</svg>`) },
    ]),
    'comment-calques.png',
  );
}

/** A map of Colombiers at `zoom`, written by the tool into the working folder: its path. */
async function map(zoom, { layers = [], outline = true } = {}) {
  const extent = extentFromBbox(bbox, zoom, MARGIN);
  const outputPath = path.join(work, `colombiers-${zoom}-${layers.length}-${outline}.png`);
  await generateMap({
    basemap: BASEMAP,
    extent,
    boundary,
    layers,
    outline,
    dpi: 150,
    format: 'png',
    outputPath,
    cacheDir: CACHE,
    concurrency: 6,
  });
  return { outputPath, extent };
}

/** An extract of `width` × `height` pixels of a map, centred on the town hall. */
function aroundTownHall({ outputPath, extent }, width, height) {
  const [x, y] = lonLatToPixel(...TOWN_HALL, extent.zoom);
  return sharp(outputPath).extract({
    left: Math.round(x - extent.xMin - width / 2),
    top: Math.round(y - extent.yMin - height / 2),
    width,
    height,
  });
}

/** The map of the home page and of « Prise en main »: the whole municipality, and an extract of its centre. */
async function examples() {
  const full = await map(16, { layers: [data] });
  // The extract leaves room on its right for the last label of the centre.
  const [x, y] = lonLatToPixel(...TOWN_HALL, 16);
  await write(
    sharp(full.outputPath).extract({
      left: Math.round(x - full.extent.xMin - 500),
      top: Math.round(y - full.extent.yMin - 515),
      width: 1400,
      height: 900,
    }),
    'exemple-colombiers.png',
  );
  const file = path.join(OUTPUT, 'exemple-colombiers-entiere.jpg');
  console.log(file);
  await sharp(full.outputPath).resize(1800).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
}

/**
 * The same extract of 480 × 330 pixels around the town hall, at zooms 15, 16 and 17: the text keeps its size
 * while the area shown shrinks. Without the added data, whose labels grow with the size of the map.
 */
async function zoomComparison() {
  const width = 480;
  const height = 330;
  const gap = 24;
  const top = 44;
  const zooms = [15, 16, 17];
  const panels = [];
  for (const zoom of zooms) {
    panels.push(await aroundTownHall(await map(zoom, { outline: false }), width, height).png().toBuffer());
  }
  const total = zooms.length * width + (zooms.length - 1) * gap;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${top + height}">` +
    zooms
      .map(
        (zoom, index) =>
          `<text x="${index * (width + gap) + width / 2}" y="28" text-anchor="middle" font-family="${FONT}" ` +
          `font-size="20" font-weight="600" fill="${INK}">Zoom ${zoom}</text>` +
          `<rect x="${index * (width + gap) + 0.5}" y="${top + 0.5}" width="${width - 1}" height="${height - 1}" fill="none" stroke="#c9d2dc"/>`,
      )
      .join('') +
    '</svg>';
  await write(
    sharp({ create: { width: total, height: top + height, channels: 3, background: '#ffffff' } }).composite([
      ...panels.map((input, index) => ({ input, left: index * (width + gap), top })),
      { input: Buffer.from(svg) },
    ]),
    'zoom-15-16-17.png',
  );
}
