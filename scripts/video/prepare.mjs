#!/usr/bin/env node
// Prepares the images and the figures of the video with the functions of cartes itself: the maps of Colombiers,
// its layers one by one, its data geocoded from a list of addresses, and the numbers the tool gives. Nothing on
// screen is drawn by hand. The tiles are read from the cache of the repository, and only what is missing is asked
// for. Writes the images into public/ and the figures into src/generated/figures.json.

import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import QRCode from 'qrcode';
import sharp from 'sharp';

import { BASEMAPS } from '../../src/core/basemaps.js';
import { formatBytes, imageMemory } from '../../src/core/estimates.js';
import { geocodeCsv } from '../../src/core/geocoding.js';
import { CHANNELS } from '../../src/core/image.js';
import { layersSource, readLayer } from '../../src/core/layers.js';
import * as maplayers from '../../src/core/maplayers.js';
import { withUpdateDates } from '../../src/core/metadata.js';
import { BOUNDARY_SOURCE, boundaryBbox, fetchBoundary, searchMunicipalities } from '../../src/core/municipalities.js';
import { OUTLINE_COLOR, attributionText, boundaryPath } from '../../src/core/overlays.js';
import { paperFormat, printSizeMm } from '../../src/core/print.js';
import * as tiles from '../../src/core/tiles.js';
import { extentBbox, readUrbanPlan, urbanPlanDrawing } from '../../src/core/urbanism.js';
import { readVectorLayer, vectorTileShapes } from '../../src/core/vectortiles.js';
import { fetchWmsImages, wmsRequests } from '../../src/core/wms.js';
import { cachedTileLoader } from '../../src/node/cache.js';
import { generateMap } from '../../src/node/generate.js';
import * as render from '../../src/node/render.js';

const ROOT = import.meta.dirname;
const REPOSITORY = path.resolve(ROOT, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const FIGURES = path.join(ROOT, 'src', 'generated', 'figures.json');
const CACHE = path.join(REPOSITORY, '.cache', 'tiles');

const INSEE = '86081';
const MUNICIPALITY = 'Colombiers';
const MARGIN = 0.03;
const DPI = 150;
const ZOOM = 16;
const BASEMAP = BASEMAPS['plan-ign'];
// The town hall of Colombiers, where the opening dives to, as in the illustrations of the documentation.
const TOWN_HALL = [0.426713, 46.772149];
const ADDRESSES = path.join(REPOSITORY, 'exemples', 'colombiers-apport-volontaire-adresses.csv');
const DATA_TITLE = "Points d'apport volontaire";
const DOCUMENTATION = 'https://sebprunier.github.io/cartes/';
// Every layer of the catalog is tried on the extract of the layers scene; the video keeps those that show something.
const LAYERS = Object.values(maplayers.MAP_LAYERS).map(({ id }) => id);
// The same command the terminal of the video types, run for real.
const COMMAND = ['generer', MUNICIPALITY, '-d', '86', '-z', String(ZOOM)];

const figures = { generatedOn: new Date().toISOString().slice(0, 10) };
const work = await mkdtemp(path.join(tmpdir(), 'cartes-video-'));
await mkdir(path.join(PUBLIC, 'cartes', 'couches'), { recursive: true });
await mkdir(path.dirname(FIGURES), { recursive: true });

try {
  const boundary = await fetchBoundary(INSEE);
  const bbox = boundaryBbox(boundary);
  const extent = tiles.extentFromBbox(bbox, ZOOM, MARGIN);

  await municipalities();
  await commune(boundary, extent);
  await centre(bbox, extent);
  estimates(bbox);
  const data = await geocoding(extent);
  await finalMap(boundary, extent, data);
  await layers(boundary, extent);
  await commandLine();
  await brand();

  await writeFile(FIGURES, `${JSON.stringify(figures, null, 2)}\n`);
  console.log(FIGURES);
} finally {
  await rm(work, { recursive: true, force: true });
}

/** Tiles of `source` covering `extent`, from the cache of cartes, downloaded when missing. */
function tilesOf(source, extent, wanted = { zoom: extent.zoom, tiles: [...tiles.tilesInExtent(extent)] }) {
  const cacheId = source.vintage ? `${source.id}-${source.vintage}` : source.id;
  return tiles.downloadTiles(source, wanted.zoom, wanted.tiles, {
    loadTile: cachedTileLoader({ cacheDir: CACHE, basemapId: cacheId, zoom: wanted.zoom }),
    concurrency: 6,
  });
}

/** The basemap alone over `extent`, as raw RGB pixels. */
async function basemapPixels(extent) {
  const { pixels, missing } = await render.assembleTiles(extent, await tilesOf(BASEMAP, extent));
  if (missing > 0) console.warn(`  ${missing} tuile(s) manquante(s) pour ${extent.width} × ${extent.height} px`);
  return pixels;
}

function rawImage(pixels, extent) {
  return sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width: extent.width, height: extent.height, channels: CHANNELS },
    limitInputPixels: false,
  });
}

/** Writes `image` as a JPEG into public/, at full size and at the smaller `scales`: their paths, from public/. */
async function writeJpeg(image, name, scales = []) {
  const buffer = await image.png().toBuffer();
  const { width } = await sharp(buffer).metadata();
  const written = [];
  for (const scale of [1, ...scales]) {
    const file = scale === 1 ? `${name}.jpg` : `${name}-${scale}.jpg`;
    let resized = sharp(buffer, { limitInputPixels: false });
    if (scale !== 1) resized = resized.resize(Math.round(width / scale), null, { kernel: 'lanczos3' });
    await resized.jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(path.join(PUBLIC, file));
    console.log(path.join(PUBLIC, file));
    written.push(file);
  }
  return written;
}

/** Position of a point of the map, in pixels of `extent`. */
function pixelOf([lon, lat], extent) {
  const [x, y] = tiles.lonLatToPixel(lon, lat, extent.zoom);
  return [round(x - extent.xMin), round(y - extent.yMin)];
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

/** The municipalities the search field lists for « Colombiers », as the page words them. */
async function municipalities() {
  const found = await searchMunicipalities(MUNICIPALITY);
  figures.search = {
    query: MUNICIPALITY,
    results: found.map((m) => ({
      inseeCode: m.inseeCode,
      label: `${m.inseeCode} ${m.name} (${m.postcode}) — ${m.context}${m.population ? `, ${m.population} hab.` : ''}`,
      population: m.population,
    })),
  };
}

/**
 * The whole municipality at the zoom of the video, basemap alone, with the grid of its tiles and its boundary:
 * the opening assembles it tile by tile, then dives towards the town hall.
 */
async function commune(boundary, extent) {
  const pixels = await basemapPixels(extent);
  const files = await writeJpeg(rawImage(pixels, extent), 'cartes/commune-z16', [2, 4]);
  figures.commune = {
    name: boundary.name,
    zoom: extent.zoom,
    width: extent.width,
    height: extent.height,
    xMin: extent.xMin,
    yMin: extent.yMin,
    files,
    tileCount: extent.tileCount,
    tiles: {
      columns: extent.tiles.xMax - extent.tiles.xMin + 1,
      rows: extent.tiles.yMax - extent.tiles.yMin + 1,
      // Where the first tile starts, in pixels of the image: the tiles overhang the extent on every side.
      left: extent.tiles.xMin * tiles.TILE_SIZE - extent.xMin,
      top: extent.tiles.yMin * tiles.TILE_SIZE - extent.yMin,
      size: tiles.TILE_SIZE,
    },
    boundary: boundaryPath(boundary, extent).path,
    outlineColor: OUTLINE_COLOR,
    townHall: pixelOf(TOWN_HALL, extent),
    metersPerPixel: round(tiles.groundResolution(TOWN_HALL[1], extent.zoom), 2),
  };
}

/** The centre of the village one zoom further, where the names of the streets can be read. */
async function centre(bbox, extent) {
  const width = 4096;
  const height = 2304;
  const larger = tiles.extentFromBbox(bbox, extent.zoom + 1, MARGIN);
  const [x, y] = tiles.lonLatToPixel(...TOWN_HALL, larger.zoom);
  const window = tiles.extentWindow(larger, width, height, {
    x: (x - larger.xMin) / larger.width,
    y: (y - larger.yMin) / larger.height,
  });
  const pixels = await basemapPixels(window);
  const [file] = await writeJpeg(rawImage(pixels, window), 'cartes/centre-z17');
  figures.centre = {
    zoom: window.zoom,
    width: window.width,
    height: window.height,
    xMin: window.xMin,
    yMin: window.yMin,
    file,
    townHall: pixelOf(TOWN_HALL, window),
    metersPerPixel: round(tiles.groundResolution(TOWN_HALL[1], window.zoom), 2),
  };
}

/** The table of dimensions of the page, zoom by zoom, for Colombiers at 150 dpi. */
function estimates(bbox) {
  const latitude = (bbox[1] + bbox[3]) / 2;
  figures.estimates = [13, 14, 15, 16, 17, 18, 19].map((zoom) => {
    const extent = tiles.extentFromBbox(bbox, zoom, MARGIN);
    const [widthMm, heightMm] = printSizeMm(extent.width, extent.height, DPI);
    return {
      zoom,
      metersPerPixel: tiles.groundResolution(latitude, zoom).toFixed(2),
      width: extent.width,
      height: extent.height,
      tiles: extent.tileCount,
      widthMm: Math.round(widthMm),
      heightMm: Math.round(heightMm),
      paper: paperFormat(widthMm, heightMm),
      memory: formatBytes(imageMemory(extent)),
    };
  });
  figures.dpi = DPI;
}

/**
 * The list of addresses of the examples, geocoded as the tool does it: each row with its status, and the points
 * placed on the map of the municipality with the color of their category.
 */
async function geocoding(extent) {
  const text = await readFile(ADDRESSES, 'utf8');
  const { csv, summary, rows } = await geocodeCsv(text, { inseeCode: INSEE, municipalityName: MUNICIPALITY });
  const data = readLayer(csv, { fileName: 'points.csv', name: DATA_TITLE });
  const [header, ...lines] = text.trim().split('\n').map((line) => line.split(';'));
  const column = (name) => header.indexOf(name);
  figures.data = {
    title: DATA_TITLE,
    file: path.basename(ADDRESSES),
    summary,
    rows: rows.map((row, index) => ({
      name: lines[index][column('nom')],
      address: lines[index][column('adresse')],
      category: lines[index][column('categorie')],
      status: row.status,
      score: row.score === undefined ? null : round(row.score, 2),
    })),
    categories: data.categories,
    points: data.features.map((feature) => ({
      name: feature.label ?? feature.properties.nom,
      category: feature.category,
      color: feature.color,
      position: pixelOf(feature.position, extent),
    })),
    geocodedOn: data.geocodedOn,
  };
  return data;
}

/** The map as the tool makes it, with the points, the boundary, the legend and the sources, and its attribution. */
async function finalMap(boundary, extent, data) {
  const outputPath = path.join(work, 'carte.png');
  await generateMap({
    basemap: BASEMAP,
    extent,
    boundary,
    layers: [data],
    outline: true,
    dpi: DPI,
    format: 'png',
    outputPath,
    cacheDir: CACHE,
    concurrency: 6,
  });
  const files = await writeJpeg(sharp(outputPath, { limitInputPixels: false }), 'cartes/carte-z16', [2, 4]);
  const sources = await withUpdateDates([BASEMAP, BOUNDARY_SOURCE]);
  sources.push(layersSource([data]));
  figures.map = {
    files,
    attribution: attributionText({ sources }),
    sources: sources.map(({ attribution, updateDate }) => ({ attribution, updateDate: updateDate ?? null })),
  };
}

/**
 * Every layer of the catalog, drawn alone over an extract of the municipality around its village: on white, then
 * on black, which gives each pixel its color and its transparency. The layers with nothing there are left out.
 */
async function layers(boundary, extent) {
  const [x, y] = pixelOf(TOWN_HALL, extent);
  const window = tiles.extentWindow(extent, 2400, 1500, { x: x / extent.width, y: (y - 150) / extent.height });
  const [file] = await writeJpeg(rawImage(await basemapPixels(window), window), 'cartes/couches/fond');
  const [lonMin, latMin, lonMax, latMax] = extentBbox(window);
  const { layers: resolved, warnings } = await maplayers.resolveMapLayers(
    maplayers.chooseMapLayers(LAYERS.map((id) => ({ id }))).filter((layer) => maplayers.drawnAtZoom(layer, window.zoom)),
    [(lonMin + lonMax) / 2, (latMin + latMax) / 2],
  );
  for (const warning of warnings) console.warn(`  ${warning}`);

  const drawn = [];
  for (const layer of resolved) {
    try {
      const draw = await drawingOf(layer, window, boundary);
      const { rgba, share } = await alone(draw, window);
      console.log(`  ${layer.id} : ${(share * 100).toFixed(1)} % de pixels dessinés`);
      if (share === 0) continue;
      const name = `cartes/couches/${layer.id}.png`;
      await sharp(rgba, { raw: { width: window.width, height: window.height, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toFile(path.join(PUBLIC, name));
      drawn.push({
        id: layer.id,
        name: layer.name,
        provider: layer.provider,
        theme: layer.theme,
        attribution: layer.attribution,
        file: name,
        share: round(share, 3),
      });
    } catch (error) {
      console.warn(`  ${layer.id} : ${error.message}`);
    }
  }
  figures.layers = {
    zoom: window.zoom,
    width: window.width,
    height: window.height,
    base: file,
    boundary: boundaryPath(boundary, window).path,
    townHall: pixelOf(TOWN_HALL, window),
    themes: maplayers.MAP_LAYER_THEMES,
    drawn,
  };
}

/** A function drawing `layer` over raw pixels of `extent`, its data read once, as the generation of a map does it. */
async function drawingOf(layer, extent, boundary) {
  if (maplayers.isUrbanismLayer(layer)) {
    const plan = await readUrbanPlan(boundary.inseeCode, extentBbox(extent), { content: layer.content });
    const { paths, labels, warning } = urbanPlanDrawing(layer, plan, extent, boundary.name);
    if (warning) throw new Error(warning);
    return (pixels) => render.drawOverlays(pixels, extent, [...render.vectorOverlays(paths), ...render.labelOverlays(labels)]);
  }
  if (maplayers.isVectorLayer(layer)) {
    const vectorTiles = await readVectorLayer(layer, extent);
    const shapes = vectorTileShapes(vectorTiles, extent, { styleOf: maplayers.vectorStyleOf(layer) });
    return (pixels) => render.drawOverlays(pixels, extent, render.vectorOverlays(shapes));
  }
  if (maplayers.isWmsLayer(layer)) {
    const blocks = wmsRequests(layer, extent);
    const images = await fetchWmsImages(layer, blocks);
    blocks.forEach((block, index) => (block.content = images[index]));
    return (pixels) => render.drawWmsLayer(pixels, extent, blocks, { opacity: layer.opacity });
  }
  const wanted = tiles.layerTiles(layer, extent);
  const downloaded = await tilesOf(layer, extent, wanted);
  return (pixels) => render.drawMapLayer(pixels, extent, downloaded, { opacity: layer.opacity, scale: wanted.scale });
}

/**
 * What `draw` adds to an image, alone, with its transparency: drawn over white and over black, a pixel of color c
 * and opacity a gives a·c + (1 − a)·255 and a·c, from which a and c come back.
 */
async function alone(draw, extent) {
  const size = extent.width * extent.height * CHANNELS;
  const white = new Uint8Array(size).fill(255);
  const black = new Uint8Array(size);
  await draw(white);
  await draw(black);
  const rgba = Buffer.alloc(extent.width * extent.height * 4);
  let visible = 0;
  for (let from = 0, to = 0; from < size; from += CHANNELS, to += 4) {
    const lightness = white[from] - black[from] + white[from + 1] - black[from + 1] + white[from + 2] - black[from + 2];
    const alpha = 1 - lightness / (3 * 255);
    if (alpha < 1 / 255) continue;
    for (let channel = 0; channel < 3; channel++) {
      rgba[to + channel] = Math.min(255, Math.round(black[from + channel] / alpha));
    }
    rgba[to + 3] = Math.round(alpha * 255);
    visible++;
  }
  return { rgba, share: visible / (extent.width * extent.height) };
}

/**
 * The real output of the command line the terminal of the video types, with an empty cache: its duration is
 * the one of a first map, tiles downloaded, and not the second of a map whose tiles are all on disk.
 */
async function commandLine() {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [path.join(REPOSITORY, 'src', 'node', 'cli.js'), ...COMMAND, '--cache', path.join(work, 'cache')],
    { cwd: work, env: { ...process.env, NO_COLOR: '1' } },
  );
  figures.cli = {
    command: `cartes ${COMMAND.join(' ')}`,
    output: `${stdout}${stderr}`.split('\n').map((line) => line.replaceAll(work, '.').trimEnd()).filter(Boolean),
  };
}

/** The logo, the fonts and the QR code of the documentation. */
async function brand() {
  await copyFile(path.join(REPOSITORY, 'docs', 'images', 'logo.png'), path.join(PUBLIC, 'logo.png'));
  await mkdir(path.join(PUBLIC, 'fonts'), { recursive: true });
  for (const family of ['inter', 'jetbrains-mono']) {
    const fonts = path.join(ROOT, 'node_modules', '@fontsource-variable', family, 'files');
    for (const subset of ['latin', 'latin-ext']) {
      const file = `${family}-${subset}-wght-normal.woff2`;
      await copyFile(path.join(fonts, file), path.join(PUBLIC, 'fonts', file));
    }
  }
  await writeFile(
    path.join(PUBLIC, 'qr-documentation.svg'),
    await QRCode.toString(DOCUMENTATION, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#17232f' } }),
  );
  figures.documentation = DOCUMENTATION;
}
