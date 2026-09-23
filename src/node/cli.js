#!/usr/bin/env node
// Command line interface.

import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { basename } from 'node:path';

import { BASEMAPS } from '../core/basemaps.js';
import { MAP_LAYERS, MapLayerError, chooseMapLayers } from '../core/maplayers.js';
import { formatBytes, imageMemory } from '../core/estimates.js';
import { MunicipalityNotFound, describeMunicipality, searchMunicipalities } from '../core/municipalities.js';
import { LayerError, readLayer } from '../core/layers.js';
import { paperFormat, printSizeMm } from '../core/print.js';
import { extentFromBbox, groundResolution } from '../core/tiles.js';
import { HELP, UsageError, parseCommandLine, parseInteger, resolveOutputPath } from './command-line.js';
import { SAMPLE_GRID_SIZE, estimateMapFileSize, generateMap, mapFileName, planMap } from './generate.js';
import { createApiServer } from './server.js';

const { version: VERSION } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// True while the progress line has not been terminated by a line break.
let progressLineOpen = false;

async function main() {
  const { command, argument, options } = parseCommandLine();

  if (options.version) {
    console.log(VERSION);
  } else if (options.help || !command) {
    console.log(HELP);
  } else if (command === 'search' && argument) {
    await search(argument, options);
  } else if (command === 'basemaps') {
    listBasemaps();
  } else if (command === 'maplayers') {
    listMapLayers();
  } else if (command === 'generate' && argument) {
    await generate(argument, options);
  } else if (command === 'serve') {
    await serve(options);
  } else {
    throw new UsageError(`Commande invalide.\n\n${HELP}`);
  }
}

/**
 * Serves the HTTP API. Its settings come from the environment, where a hosting platform sets them: nothing
 * is limited unless asked for.
 */
async function serve(options) {
  const env = process.env;
  const port = parseInteger(options.port ?? env.PORT ?? '8080', '--port', 0, 65535);
  const apiKey = env.CARTES_CLE_API || undefined;
  const maxZoom = env.CARTES_ZOOM_MAX ? parseInteger(env.CARTES_ZOOM_MAX, 'CARTES_ZOOM_MAX', 0) : Infinity;
  const maxGenerations = parseInteger(env.CARTES_GENERATIONS ?? '1', 'CARTES_GENERATIONS', 1);
  const retentionMinutes = parseInteger(env.CARTES_CONSERVATION ?? '60', 'CARTES_CONSERVATION', 1);
  const outputDir = env.CARTES_SORTIES || path.join(tmpdir(), 'cartes');
  const concurrency = parseInteger(options.concurrency, '--paralleles', 1);

  const server = createApiServer({
    cacheDir: options.cache,
    outputDir,
    version: VERSION,
    apiKey,
    maxZoom,
    maxGenerations,
    retentionMs: retentionMinutes * 60 * 1000,
    concurrency,
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, resolve));

  console.log(`API de cartes ${VERSION} à l'écoute sur le port ${server.address().port}.`);
  console.log(`  Clé d'API     : ${apiKey ? 'exigée' : 'aucune, l’API répond à tous'}`);
  console.log(`  Zoom maximal  : ${maxZoom === Infinity ? 'celui de chaque fond de carte' : maxZoom}`);
  console.log(`  Générations   : ${maxGenerations} à la fois, cartes conservées ${retentionMinutes} min`);
  console.log(`  Cartes        : ${outputDir}`);
  console.log(`  Cache         : ${options.cache}`);
  // A platform stops an application with SIGTERM: the maps in progress are dropped, not left half written.
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  });
}

async function search(name, options) {
  const municipalities = await searchMunicipalities(name, options.department);
  if (municipalities.length === 0) throw new MunicipalityNotFound(`Aucune commune trouvée pour « ${name} ».`);
  for (const municipality of municipalities) console.log(describeMunicipality(municipality));
}

function listBasemaps() {
  for (const basemap of Object.values(BASEMAPS)) {
    console.log(
      `${basemap.id.padEnd(16)} ${basemap.name} (zoom max ${basemap.maxZoom}, format ${basemap.outputFormat})` +
        ` — ${basemap.attribution}`,
    );
  }
}

function listMapLayers() {
  for (const layer of Object.values(MAP_LAYERS)) {
    console.log(
      `${layer.id.padEnd(16)} ${layer.name} — ${layer.attribution}\n${' '.repeat(16)} ${layer.description}`,
    );
  }
}

async function generate(input, options) {
  const basemap = BASEMAPS[options.basemap];
  if (!basemap) {
    throw new UsageError(`Fond inconnu : ${options.basemap}. Fonds disponibles : ${Object.keys(BASEMAPS).join(', ')}`);
  }
  const zoom = parseInteger(options.zoom, '--zoom', 0, basemap.maxZoom);
  const dpi = parseInteger(options.dpi, '--dpi', 1);
  const maxTiles = parseInteger(options['max-tiles'], '--max-tuiles', 1);
  const concurrency = parseInteger(options.concurrency, '--paralleles', 1);
  const margin = Number(options.margin);
  if (!(margin >= 0)) throw new UsageError('--marge doit être un nombre positif.');

  const layers = options.data.map((file, index) => {
    try {
      return readLayer(readFileSync(file, 'utf8'), {
        fileName: basename(file),
        name: options['data-title'][index],
        index,
        categoryProperty: options['data-category'],
        colorProperty: options['data-color'],
      });
    } catch (error) {
      if (error instanceof LayerError) throw new UsageError(`${file} : ${error.message}`);
      if (error.code === 'ENOENT') throw new UsageError(`Fichier de données introuvable : ${file}`);
      throw error;
    }
  });

  let mapLayers;
  try {
    mapLayers = chooseMapLayers([
      ...options.maplayers.map((id, index) => ({ id, opacity: options['maplayers-opacity'][index] })),
      ...options['custom-layer'].map((url, index) => ({
        url,
        name: options['custom-layer-name'][index],
        attribution: options['custom-layer-source'][index],
        opacity: options['custom-layer-opacity'][index],
      })),
    ]);
  } catch (error) {
    throw error instanceof MapLayerError ? new UsageError(error.message) : error;
  }

  let plan;
  try {
    plan = await planMap({ municipality: input, department: options.department, zoom, margin, mapLayers, layers });
  } catch (error) {
    throw error instanceof MapLayerError ? new UsageError(error.message) : error;
  }
  const { boundary, bbox, extent, warnings } = plan;
  const { grayscale } = options;
  const { path: outputPath, format } = resolveOutputPath(
    options,
    basemap.outputFormat,
    `sorties/${mapFileName({ boundary, basemap, mapLayers, zoom, grayscale })}`,
  );

  console.log(`Commune       : ${boundary.name} (${boundary.inseeCode})`);
  console.log(`Fond de carte : ${basemap.name} — ${basemap.attribution}`);
  for (const layer of mapLayers) {
    console.log(`Couche        : ${layer.name} (opacité ${layer.opacity}) — ${layer.attribution}`);
  }
  console.log();
  for (const warning of warnings) console.log(`Attention : ${warning}\n`);
  const fileSizeOptions = options.estimate
    ? { format, grayscale, cacheDir: options.cache, concurrency, mapLayers }
    : undefined;
  await printEstimates({ bbox, margin, basemap, selectedZoom: zoom, dpi, fileSizeOptions });
  console.log();
  if (options.estimate) return;

  if (extent.tileCount > maxTiles) {
    throw new UsageError(
      `${extent.tileCount} tuiles à télécharger, au-delà du garde-fou de ${maxTiles}. ` +
        'Baissez le zoom ou augmentez --max-tuiles.',
    );
  }

  const start = performance.now();
  const { missing, updateDatesMissing } = await generateMap(
    {
      basemap,
      extent,
      boundary,
      layers,
      mapLayers,
      outline: !options['no-outline'],
      legend: !options['no-legend'],
      grayscale,
      dpi,
      format,
      outputPath,
      cacheDir: options.cache,
      concurrency,
    },
    { onStep: console.log, onProgress: ({ done, total }) => printProgress(done, total) },
  );
  if (missing > 0) {
    console.log(
      `  Attention : ${missing} tuile(s) indisponible(s), laissée(s) en blanc. ` +
        'Relancez la commande pour réessayer (les tuiles déjà téléchargées sont en cache).',
    );
  }
  if (updateDatesMissing) {
    console.log(
      "  Attention : date de mise à jour des données indisponible dans le catalogue de la Géoplateforme. " +
        "La licence des données IGN demande de la mentionner : relancez la commande plus tard.",
    );
  }
  console.log(`Terminé en ${Math.round((performance.now() - start) / 1000)} s.`);
}

/**
 * Prints, for each zoom level, the image size, the print size and the memory used. With file size options,
 * also downloads a sample of tiles to estimate the size of the generated file.
 */
async function printEstimates({ bbox, margin, basemap, selectedZoom, dpi, fileSizeOptions }) {
  const latitude = (bbox[1] + bbox[3]) / 2;
  const header = `   zoom   m/pixel           image (px)    tuiles   impression à ${dpi} dpi             mémoire`;
  console.log(fileSizeOptions ? `${header}   fichier ${fileSizeOptions.format}` : header);
  for (let zoom = Math.max(0, Math.min(selectedZoom, basemap.maxZoom - 6)); zoom <= basemap.maxZoom; zoom++) {
    const extent = extentFromBbox(bbox, zoom, margin);
    const [widthMm, heightMm] = printSizeMm(extent.width, extent.height, dpi);
    let row =
      ` ${zoom === selectedZoom ? '→' : ' '} ${String(zoom).padStart(4)}   ${groundResolution(latitude, zoom).toFixed(2).padStart(7)}` +
      `   ${String(extent.width).padStart(8)} × ${String(extent.height).padEnd(8)} ${String(extent.tileCount).padStart(7)}` +
      `   ${widthMm.toFixed(0).padStart(5)} × ${heightMm.toFixed(0).padEnd(5)} mm ${`(${paperFormat(widthMm, heightMm)})`.padEnd(7)}` +
      `${formatBytes(imageMemory(extent)).padStart(10)}`;
    if (fileSizeOptions) row += `${(await estimatedFileSize(basemap, extent, fileSizeOptions)).padStart(12)}`;
    console.log(row);
  }
  if (fileSizeOptions) {
    console.log(
      `\nMémoire : image non compressée, à prévoir en RAM pendant la génération.` +
        `\nFichier : poids estimé à ±30 % environ, à partir de ${SAMPLE_GRID_SIZE ** 2} tuiles téléchargées par niveau de zoom.`,
    );
  }
}

async function estimatedFileSize(basemap, extent, { format, grayscale, cacheDir, concurrency, mapLayers }) {
  try {
    const size = await estimateMapFileSize({ basemap, extent, mapLayers, format, grayscale, cacheDir, concurrency });
    return size === undefined ? '?' : `≈ ${formatBytes(size)}`;
  } catch {
    // Sample unavailable (network, service error): the estimate is only informative.
    return '?';
  }
}

function printProgress(done, total) {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\r  ${done}/${total} tuiles (${Math.floor((done * 100) / total)} %)`);
  progressLineOpen = done < total;
  if (!progressLineOpen) process.stdout.write('\n');
}

main().catch((error) => {
  if (progressLineOpen) process.stdout.write('\n');
  if (error instanceof MunicipalityNotFound || error instanceof UsageError) {
    console.error(error.message);
  } else {
    console.error(`Erreur : ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ''}`);
  }
  process.exitCode = 1;
});
