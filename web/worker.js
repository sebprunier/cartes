// Generates the map away from the page, so that the interface stays responsive.

import { BASEMAPS } from './core/basemaps.js';
import { estimateFileSize } from './core/estimates.js';
import { withUpdateDates } from './core/metadata.js';
import { layersSource } from './core/layers.js';
import {
  checkMapLayer,
  chooseMapLayers,
  isTileLayer,
  isUrbanismLayer,
  isVectorLayer,
  isWmsLayer,
  mapLayerLegendEntries,
  vectorStyleOf,
} from './core/maplayers.js';
import { extentBbox, readUrbanPlan, urbanPlanDrawing } from './core/urbanism.js';
import { fetchWmsImages, wmsLegendUrl, wmsRequests } from './core/wms.js';
import { categoriesInTiles, readVectorLayer, vectorTileShapes } from './core/vectortiles.js';
import { BOUNDARY_SOURCE } from './core/municipalities.js';
import { attributionText } from './core/overlays.js';
import { downloadTiles, extentFromBbox, fetchTile, sampleTiles, tilesInExtent } from './core/tiles.js';
import {
  canRender,
  createCanvas,
  drawAttribution,
  drawBoundary,
  drawLabels,
  drawLayers,
  drawPaths,
  drawLegend,
  drawTile,
  drawWmsBlock,
  legendImageEntry,
  toBlob,
} from './render.js';

// Number of tiles downloaded for each zoom level to estimate the size of the generated file.
const SAMPLE_GRID_SIZE = 6;
const CONCURRENCY = 6;

// In a browser, a tile is held as its bytes: the browser HTTP cache avoids downloading it again.
const loadTile = (url) => fetchTile(url);

const TASKS = {
  estimate,
  generate,
  // The address of a layer is tried here rather than in the page: the fetch belongs where the tiles are read.
  'check-layer': ({ layer, place }) => checkMapLayer(layer, place),
};

onmessage = async ({ data: message }) => {
  try {
    const result = await TASKS[message.task](message);
    postMessage({ done: true, ...result });
  } catch (error) {
    postMessage({ error: error.message });
  }
};

/** Estimated file size for one zoom level, from a sample of tiles. */
async function estimate({ basemapId, bbox, zoom, margin, format, grayscale, mapLayers = [] }) {
  const basemap = BASEMAPS[basemapId];
  const extent = extentFromBbox(bbox, zoom, margin);
  const sample = sampleTiles(extent, SAMPLE_GRID_SIZE);
  const sizesOf = async (source) => {
    const tiles = await downloadTiles(source, zoom, sample, { loadTile, concurrency: CONCURRENCY });
    return tiles.filter((tile) => tile.content).map((tile) => tile.content.byteLength);
  };

  const sampleSizes = await sizesOf(basemap);
  const layers = [];
  // A layer we draw ourselves has no tiles to sample, and adds nothing to the file.
  for (const layer of chooseMapLayers(mapLayers).filter(isTileLayer)) {
    layers.push({ layer, sampleSizes: await sizesOf(layer) });
  }
  return {
    zoom,
    size: estimateFileSize({ basemap, format, grayscale, zoom, tileCount: extent.tileCount, sampleSizes, layers }),
  };
}

/** Downloads the tiles, draws the map and returns the image as a blob. */
async function generate({
  basemapId,
  boundary,
  bbox,
  zoom,
  margin,
  format,
  grayscale,
  outline,
  mapLayers = [],
  layers = [],
  legend = true,
}) {
  const basemap = BASEMAPS[basemapId];
  const extent = extentFromBbox(bbox, zoom, margin);
  if (!canRender(extent.width, extent.height)) {
    throw new Error(
      `Ce navigateur ne peut pas produire une image de ${extent.width} × ${extent.height} px (zoom ${zoom}). ` +
        'Choisissez un niveau de zoom plus faible, ou passez par la ligne de commande ou par l’application ' +
        'de bureau, qui n’ont pas cette limite.',
    );
  }

  const chosen = chooseMapLayers(mapLayers);
  // The zoning and the images of a WMS are read before the tiles: a service that does not answer fails the map
  // at once.
  const warnings = [];
  const urbanPlans = new Map();
  for (const layer of chosen.filter(isUrbanismLayer)) {
    const plan = await readUrbanPlan(boundary.inseeCode, extentBbox(extent));
    const drawing = urbanPlanDrawing(layer, plan, extent, boundary.name);
    if (drawing.warning) warnings.push(drawing.warning);
    urbanPlans.set(layer.id, drawing);
  }
  const wmsImages = new Map();
  for (const layer of chosen.filter(isWmsLayer)) {
    const blocks = wmsRequests(layer, extent);
    const images = await fetchWmsImages(layer, blocks, {
      onImage: (done, total) => postMessage({ progress: { sourceId: layer.id, done, total } }),
    });
    wmsImages.set(layer.id, blocks.map((block, index) => ({ block, content: images[index] })));
  }
  const sources = await withUpdateDates([
    basemap,
    ...chosen.flatMap((layer) => (isUrbanismLayer(layer) ? (urbanPlans.get(layer.id).source ?? []) : [layer])),
    ...(outline ? [BOUNDARY_SOURCE] : []),
  ]);
  const added = layersSource(layers);
  if (added) sources.push(added);
  const { canvas, context } = createCanvas(extent.width, extent.height);
  let drawn = 0;
  let missing = 0;
  const tiles = [...tilesInExtent(extent)];

  await downloadTiles(basemap, zoom, tiles, {
    loadTile: async (url, tile) => {
      const content = await fetchTile(url);
      if (content) await drawTile(context, extent, { ...tile, content }, { grayscale });
      else missing++;
      // The bytes are drawn right away, and not kept: the whole image already lives in the canvas.
      return content ? true : null;
    },
    concurrency: CONCURRENCY,
    onProgress: (done, total) => postMessage({ progress: { sourceId: basemap.id, done: (drawn = done), total } }),
  });

  const legendExtra = [];
  const zoneLabels = [];
  for (const layer of chosen) {
    if (isUrbanismLayer(layer)) {
      const { paths, labels, legend: entries } = urbanPlans.get(layer.id);
      drawPaths(context, paths);
      zoneLabels.push(...labels);
      legendExtra.push(...entries);
      postMessage({ progress: { sourceId: layer.id, done: 1, total: 1 } });
      continue;
    }

    if (isVectorLayer(layer)) {
      const vectorTiles = await readVectorLayer(layer, extent);
      drawPaths(context, vectorTileShapes(vectorTiles, extent, { styleOf: vectorStyleOf(layer) }));
      legendExtra.push(...mapLayerLegendEntries(layer, categoriesInTiles(layer, vectorTiles)));
      postMessage({ progress: { sourceId: layer.id, done: 1, total: 1 } });
      continue;
    }

    if (isWmsLayer(layer)) {
      for (const { block, content } of wmsImages.get(layer.id)) {
        if (content) await drawWmsBlock(context, block, content, { opacity: layer.opacity });
      }
      // The service styles its own zoning: its legend is the only one that tells the truth about it.
      const legend = await fetchTile(wmsLegendUrl(layer)).catch(() => null);
      if (legend) legendExtra.push(await legendImageEntry(legend));
      continue;
    }

    await downloadTiles(layer, zoom, tiles, {
      loadTile: async (url, tile) => {
        const content = await fetchTile(url);
        if (content) await drawTile(context, extent, { ...tile, content }, { opacity: layer.opacity });
        return content ? true : null;
      },
      concurrency: CONCURRENCY,
      onProgress: (done, total) => postMessage({ progress: { sourceId: layer.id, done, total } }),
    });
  }

  if (outline) drawBoundary(context, boundary, extent);
  drawLabels(context, zoneLabels);
  drawLayers(context, layers, extent);
  if (legend) drawLegend(context, layers, extent, legendExtra);
  drawAttribution(context, attributionText({ sources }), extent);

  return {
    blob: await toBlob(canvas, format),
    width: extent.width,
    height: extent.height,
    tiles: drawn,
    missing,
    updateDatesMissing: sources.some((source) => source.metadataId && !source.updateDate),
    warnings,
  };
}
