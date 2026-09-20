#!/usr/bin/env node
// Command line interface.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { BASEMAPS, canUsePalette } from '../core/basemaps.js';
import {
  MAP_LAYERS,
  MapLayerError,
  checkMapLayer,
  chooseMapLayers,
  isCustomLayer,
  isTileLayer,
  isVectorLayer,
  isWmsLayer,
  mapLayerLegendEntries,
  mapLayerZoomWarning,
  vectorStyleOf,
} from '../core/maplayers.js';
import { categoriesInTiles, readVectorLayer, vectorTileShapes } from '../core/vectortiles.js';
import { wmsLegendUrl, wmsRequests } from '../core/wms.js';
import { estimateFileSize, formatBytes, imageMemory } from '../core/estimates.js';
import { withUpdateDates } from '../core/metadata.js';
import {
  BOUNDARY_SOURCE,
  MunicipalityNotFound,
  boundaryBbox,
  describeMunicipality,
  fetchBoundary,
  normalizeName,
  resolveMunicipality,
  searchMunicipalities,
} from '../core/municipalities.js';
import { LayerError, layerWarning, layersSource, readLayer } from '../core/layers.js';
import { attributionText } from '../core/overlays.js';
import { paperFormat, printSizeMm } from '../core/print.js';
import {
  downloadTiles,
  extentFromBbox,
  fetchTile,
  groundResolution,
  sampleTiles,
  tilesInExtent,
} from '../core/tiles.js';
import { cachedTileLoader, tileSizes } from './cache.js';
import { HELP, UsageError, parseCommandLine, parseInteger, resolveOutputPath } from './command-line.js';
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
} from './render.js';

// Size of the grid of tiles downloaded for each zoom level to estimate the size of the generated file:
// 6 × 6 tiles keep the sampling error under 10 % on the maps measured, where 16 tiles in a row reached 25 %.
const SAMPLE_GRID_SIZE = 6;

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
  } else {
    throw new UsageError(`Commande invalide.\n\n${HELP}`);
  }
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

  const inseeCode = await resolveMunicipality(input, options.department);
  const boundary = await fetchBoundary(inseeCode);
  const bbox = boundaryBbox(boundary);
  const extent = extentFromBbox(bbox, zoom, margin);
  const { grayscale } = options;
  const { path: outputPath, format } = resolveOutputPath(
    options,
    basemap.outputFormat,
    `sorties/${boundary.inseeCode}-${normalizeName(boundary.name).replaceAll(' ', '-')}-${basemap.id}` +
      `${mapLayers.map((layer) => `-${layer.id}`).join('')}-z${zoom}${grayscale ? '-gris' : ''}`,
  );

  console.log(`Commune       : ${boundary.name} (${boundary.inseeCode})`);
  console.log(`Fond de carte : ${basemap.name} — ${basemap.attribution}`);
  for (const layer of mapLayers) {
    console.log(`Couche        : ${layer.name} (opacité ${layer.opacity}) — ${layer.attribution}`);
  }
  console.log();
  // A layer given by its address is tried on one tile before hundreds are asked for: a mistyped address says
  // so here, not after a long download.
  for (const layer of mapLayers.filter(isCustomLayer)) {
    const [lon, lat] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    let checked;
    try {
      checked = await checkMapLayer(layer, { lon, lat, zoom });
    } catch (error) {
      throw error instanceof MapLayerError ? new UsageError(error.message) : error;
    }
    if (checked.empty) {
      console.log(`Attention : « ${layer.name} » répond, mais n’a aucune donnée sur cette commune.\n`);
    }
  }
  for (const layer of mapLayers) {
    const warning = mapLayerZoomWarning(layer, zoom);
    if (warning) console.log(`Attention : ${warning}\n`);
  }
  for (const layer of layers) {
    const warning = layerWarning(layer);
    if (warning) console.log(`Attention : ${layer.name} — ${warning}\n`);
  }
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
  console.log(`Téléchargement de ${extent.tileCount} tuiles pour « ${basemap.name} » (zoom ${zoom})…`);
  const tiles = await downloadTiles(basemap, zoom, [...tilesInExtent(extent)], {
    loadTile: cachedTileLoader({ cacheDir: options.cache, basemapId: basemap.id, zoom }),
    concurrency,
    onProgress: printProgress,
  });
  const failedTiles = tiles.filter((tile) => tile.error);
  if (failedTiles.length > 0) {
    console.log(
      `  ${failedTiles.length} tuile(s) en échec malgré plusieurs tentatives, par exemple : ${failedTiles[0].error.message}`,
    );
  }

  console.log(`Assemblage d'une image de ${extent.width} × ${extent.height} px…`);
  const { pixels, missing } = await assembleTiles(extent, tiles, { grayscale });
  if (missing > 0) {
    console.log(
      `  Attention : ${missing} tuile(s) indisponible(s), laissée(s) en blanc. ` +
        'Relancez la commande pour réessayer (les tuiles déjà téléchargées sont en cache).',
    );
  }

  const vectorShapes = [];
  const legendExtra = [];
  for (const layer of mapLayers) {
    if (isVectorLayer(layer)) {
      console.log(`Lecture des tuiles vectorielles de « ${layer.name} »…`);
      const tiles = await readVectorLayer(layer, extent);
      const shapes = vectorTileShapes(tiles, extent, { styleOf: vectorStyleOf(layer) });
      const readAt = tiles[0]?.zoom;
      const coarser = readAt !== undefined && readAt < zoom ? `, lues au zoom ${readAt} et dessinées en plus grand` : '';
      console.log(`  ${shapes.length} forme(s) dessinée(s) depuis ${tiles.length} tuile(s)${coarser}.`);
      vectorShapes.push(...shapes);
      legendExtra.push(...mapLayerLegendEntries(layer, categoriesInTiles(layer, tiles)));
      continue;
    }

    if (isWmsLayer(layer)) {
      const blocks = wmsRequests(layer, extent);
      console.log(`Téléchargement de ${blocks.length} image(s) pour « ${layer.name} »…`);
      for (const [index, block] of blocks.entries()) {
        block.content = await fetchTile(block.url);
        printProgress(index + 1, blocks.length);
      }
      const missingBlocks = await drawWmsLayer(pixels, extent, blocks, { opacity: layer.opacity });
      if (missingBlocks > 0) console.log(`  ${missingBlocks} image(s) indisponible(s) : le fond reste visible.`);
      // The service styles its own zoning: its legend is the only one that tells the truth about it.
      const legend = await fetchTile(wmsLegendUrl(layer)).catch(() => null);
      if (legend) legendExtra.push(await legendImageEntry(legend));
      continue;
    }

    console.log(`Téléchargement de ${extent.tileCount} tuiles pour « ${layer.name} »…`);
    const layerTiles = await downloadTiles(layer, zoom, [...tilesInExtent(extent)], {
      loadTile: cachedTileLoader({ cacheDir: options.cache, basemapId: layer.id, zoom }),
      concurrency,
      onProgress: printProgress,
    });
    const missingLayerTiles = await drawMapLayer(pixels, extent, layerTiles, { opacity: layer.opacity });
    if (missingLayerTiles > 0) {
      console.log(`  ${missingLayerTiles} tuile(s) de la couche indisponible(s) : le fond reste visible.`);
    }
  }

  const outline = !options['no-outline'];
  const overlays = vectorOverlays(vectorShapes);
  if (outline) overlays.push(boundaryOutline(boundary, extent));
  overlays.push(...layerOverlays(layers, extent));
  if (!options['no-legend']) overlays.push(await legendOverlay(layers, extent, legendExtra));

  const sources = await withUpdateDates([basemap, ...mapLayers, ...(outline ? [BOUNDARY_SOURCE] : [])]);
  const added = layersSource(layers);
  if (added) sources.push(added);
  if (sources.some((source) => source.metadataId && !source.updateDate)) {
    console.log(
      "  Attention : date de mise à jour des données indisponible dans le catalogue de la Géoplateforme. " +
        "La licence des données IGN demande de la mentionner : relancez la commande plus tard.",
    );
  }
  overlays.push(await attributionLabel(attributionText({ sources }), extent));
  console.log(outline ? 'Tracé du contour et ajout de la mention des sources…' : 'Ajout de la mention des sources…');
  await drawOverlays(pixels, extent, overlays);
  console.log(`Enregistrement dans ${outputPath}…`);
  await saveImage(pixels, extent, outputPath, { dpi, palette: canUsePalette(basemap, format) });
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

async function estimatedFileSize(basemap, extent, { format, grayscale, cacheDir, concurrency, mapLayers = [] }) {
  try {
    const sample = sampleTiles(extent, SAMPLE_GRID_SIZE);
    const sizesOf = async (source) => {
      const sampled = await downloadTiles(source, extent.zoom, sample, {
        loadTile: cachedTileLoader({ cacheDir, basemapId: source.id, zoom: extent.zoom }),
        concurrency,
      });
      return tileSizes(sampled);
    };
    const sampleSizes = await sizesOf(basemap);
    const layers = [];
    for (const layer of mapLayers.filter(isTileLayer)) {
      layers.push({ layer, sampleSizes: await sizesOf(layer) });
    }
    const size = estimateFileSize({
      basemap,
      format,
      grayscale,
      palette: canUsePalette(basemap, format),
      zoom: extent.zoom,
      tileCount: extent.tileCount,
      sampleSizes,
      layers,
    });
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
