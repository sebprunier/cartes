// Generates the map away from the page, so that the interface stays responsive.

import { BASEMAPS } from './core/basemaps.js';
import { estimateFileSize } from './core/estimates.js';
import { withUpdateDates } from './core/metadata.js';
import { layersSource } from './core/layers.js';
import { chooseMapLayers } from './core/maplayers.js';
import { BOUNDARY_SOURCE } from './core/municipalities.js';
import { attributionText } from './core/overlays.js';
import { downloadTiles, extentFromBbox, fetchTile, sampleTiles, tilesInExtent } from './core/tiles.js';
import {
  canRender,
  createCanvas,
  drawAttribution,
  drawBoundary,
  drawLayers,
  drawLegend,
  drawTile,
  toBlob,
} from './render.js';

// Number of tiles downloaded for each zoom level to estimate the size of the generated file.
const SAMPLE_GRID_SIZE = 6;
const CONCURRENCY = 6;

// In a browser, a tile is held as its bytes: the browser HTTP cache avoids downloading it again.
const loadTile = (url) => fetchTile(url);

onmessage = async ({ data: message }) => {
  try {
    const result = message.task === 'estimate' ? await estimate(message) : await generate(message);
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
  for (const layer of chooseMapLayers(mapLayers)) layers.push({ layer, sampleSizes: await sizesOf(layer) });
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
  const sources = await withUpdateDates([basemap, ...chosen, ...(outline ? [BOUNDARY_SOURCE] : [])]);
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

  for (const layer of chosen) {
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
  drawLayers(context, layers, extent);
  if (legend) drawLegend(context, layers, extent);
  drawAttribution(context, attributionText({ sources }), extent);

  return {
    blob: await toBlob(canvas, format),
    width: extent.width,
    height: extent.height,
    tiles: drawn,
    missing,
    updateDatesMissing: sources.some((source) => source.metadataId && !source.updateDate),
  };
}
