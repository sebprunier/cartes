// Generates the map away from the page, so that the interface stays responsive.

import { BASEMAPS } from './core/basemaps.js';
import { estimateFileSize } from './core/estimates.js';
import { withUpdateDates } from './core/metadata.js';
import { layersSource } from './core/layers.js';
import {
  checkMapLayer,
  chooseMapLayers,
  drawnAtZoom,
  resolveMapLayers,
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
import { downloadTiles, extentFromBbox, fetchTile, layerTiles, sampleTiles, tilesInExtent } from './core/tiles.js';
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

/** The centre [lon, lat] of a bbox, where the vintage of a layer is looked for. */
function centerOf([lonMin, latMin, lonMax, latMax]) {
  return [(lonMin + lonMax) / 2, (latMin + latMax) / 2];
}

/** Estimated file size for one zoom level, from a sample of tiles. */
async function estimate({ basemapId, bbox, zoom, margin, format, grayscale, mapLayers = [] }) {
  const basemap = BASEMAPS[basemapId];
  const extent = extentFromBbox(bbox, zoom, margin);
  const sample = sampleTiles(extent, SAMPLE_GRID_SIZE);
  const sizesOf = async (source) => {
    // A tile drawn larger weighs about as much as each tile of the map it covers, as measured under Node.
    const { zoom: tileZoom, tiles: wanted } = layerTiles(source, extent, sample);
    const tiles = await downloadTiles(source, tileZoom, wanted, { loadTile, concurrency: CONCURRENCY });
    return tiles.filter((tile) => tile.content).map((tile) => tile.content.byteLength);
  };

  const sampleSizes = await sizesOf(basemap);
  const layers = [];
  // A layer we draw ourselves has no tiles to sample, and adds nothing to the file.
  const { layers: resolved } = await resolveMapLayers(
    chooseMapLayers(mapLayers).filter((each) => isTileLayer(each) && drawnAtZoom(each, zoom)),
    centerOf(bbox),
  );
  for (const layer of resolved) {
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

  // A layer whose service publishes nothing at this zoom is left out, and not credited. One published by vintage
  // gets the most recent one the municipality has, or is left out, and says so.
  const warnings = [];
  const resolved = await resolveMapLayers(
    chooseMapLayers(mapLayers).filter((layer) => drawnAtZoom(layer, zoom)),
    centerOf(bbox),
  );
  const chosen = resolved.layers;
  warnings.push(...resolved.warnings);
  // The zoning and the images of a WMS are read before the tiles: a service that does not answer fails the map
  // at once.
  const urbanPlans = new Map();
  // The labels of the zoning are placed first, those of the prescriptions around them.
  const placedLabels = [];
  for (const layer of chosen.filter(isUrbanismLayer)) {
    const plan = await readUrbanPlan(boundary.inseeCode, extentBbox(extent), { content: layer.content });
    const drawing = urbanPlanDrawing(layer, plan, extent, boundary.name, { avoid: placedLabels });
    placedLabels.push(...drawing.labels.map(({ box }) => box));
    if (drawing.warning && !warnings.includes(drawing.warning)) warnings.push(drawing.warning);
    urbanPlans.set(layer.id, drawing);
    postMessage({ progress: { sourceId: layer.id, done: 1, total: 1 } });
  }
  const wmsImages = new Map();
  for (const layer of chosen.filter(isWmsLayer)) {
    const blocks = wmsRequests(layer, extent);
    const images = await fetchWmsImages(layer, blocks, {
      onImage: (done, total) => postMessage({ progress: { sourceId: layer.id, done, total } }),
    });
    wmsImages.set(layer.id, blocks.map((block, index) => ({ block, content: images[index] })));
  }
  // The dates of the data are asked for now, and waited for only to write the attribution: the catalog can take
  // longer than all the tiles.
  const datedSources = withUpdateDates(
    [
      basemap,
      ...chosen.flatMap((layer) => (isUrbanismLayer(layer) ? (urbanPlans.get(layer.id).source ?? []) : [layer])),
      ...(outline ? [BOUNDARY_SOURCE] : []),
    ],
    // Their progress has a line of its own: the catalog can be slower than every tile of the map.
    { onProgress: (progress) => postMessage({ progress: { sourceId: 'dates', ...progress } }) },
  );
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

    let drawn = false;
    // Above the last zoom its service publishes, a layer is downloaded at that zoom, and drawn larger.
    const wanted = layerTiles(layer, extent, tiles);
    await downloadTiles(layer, wanted.zoom, wanted.tiles, {
      loadTile: async (url, tile) => {
        const content = await fetchTile(url);
        if (content) {
          const options = { opacity: layer.opacity, detect: Boolean(layer.legend) && !drawn, scale: wanted.scale };
          // Drawn first, then counted: `drawn ||= await drawTile(…)` stopped drawing once a tile had shown
          // something, the right side of ||= being skipped when the left one is true.
          const visible = await drawTile(context, extent, { ...tile, content }, options);
          if (visible) drawn = true;
        }
        return content ? true : null;
      },
      concurrency: CONCURRENCY,
      onProgress: (done, total) => postMessage({ progress: { sourceId: layer.id, done, total } }),
    });
    // A layer of tiles can declare its legend; it is shown only when the layer drew something on this map.
    if (drawn) legendExtra.push(...layer.legend);
  }

  if (outline) drawBoundary(context, boundary, extent);
  drawLabels(context, zoneLabels);
  drawLayers(context, layers, extent);
  if (legend) drawLegend(context, layers, extent, legendExtra);
  const sources = await datedSources;
  const added = layersSource(layers);
  if (added) sources.push(added);
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
