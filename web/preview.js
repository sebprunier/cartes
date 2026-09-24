// Preview of the map before generating it. It is drawn with the same code as the map itself, so that what the
// preview shows is what the file will contain: the whole municipality reduced to a miniature, and a window of
// its center at real size, which tells whether the labels will still be readable once printed.

import { BASEMAPS } from './core/basemaps.js';
import { layersSource } from './core/layers.js';
import {
  chooseMapLayers,
  drawnAtZoom,
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
import { withUpdateDates } from './core/metadata.js';
import { BOUNDARY_SOURCE } from './core/municipalities.js';
import { attributionText } from './core/overlays.js';
import { downloadTiles, extentFromBbox, extentWindow, fetchTile, tilesInExtent } from './core/tiles.js';
import { engine } from './engine.js';
import {
  createCanvas,
  drawAttribution,
  drawBoundary,
  drawLayers,
  drawLabels,
  drawLegend,
  drawPaths,
  drawTile,
  drawWmsBlock,
  legendImageEntry,
} from './render.js';

// Sizes in pixels of the two views, chosen to stay readable on a page without downloading many tiles.
const OVERVIEW_SIDE = 700;
const DETAIL_WIDTH = 700;
const DETAIL_HEIGHT = 420;
const CONCURRENCY = 6;

// The zoning and the prescriptions of the municipality previewed, read once: the miniature and every move of the
// detail draw them again.
const urbanPlansRead = new Map();

function urbanPlanOf(layer, boundary, extent) {
  const key = `${boundary.inseeCode} ${layer.content ?? 'zones'}`;
  if (!urbanPlansRead.has(key)) {
    // One municipality at a time: the plans of the previous one are of no use any more.
    for (const other of urbanPlansRead.keys()) if (!other.startsWith(`${boundary.inseeCode} `)) urbanPlansRead.delete(other);
    const plan = readUrbanPlan(boundary.inseeCode, extentBbox(extent), { content: layer.content });
    // A failed read is not kept: the next preview tries again.
    plan.catch(() => urbanPlansRead.delete(key));
    urbanPlansRead.set(key, plan);
  }
  return urbanPlansRead.get(key);
}

/**
 * Draws the two views of a map request: the miniature of the whole municipality, and the detail at the point
 * given as a fraction of the map, its center by default.
 */
export async function renderPreview(request, center) {
  const { basemapId, boundary, bbox, margin, grayscale, outline, mapLayers = [], layers, legend } = request;
  const basemap = BASEMAPS[basemapId];
  const chosen = chooseMapLayers(mapLayers);
  const extent = extentFromBbox(bbox, overviewZoom(bbox, margin), margin);
  const urbanSources = [];
  for (const layer of chosen.filter(isUrbanismLayer)) {
    const plan = await urbanPlanOf(layer, boundary, extent);
    urbanSources.push({ layer, source: urbanPlanDrawing(layer, plan, extent, boundary.name).source });
  }
  // The dates of the data are asked for while the tiles download, and waited for only to write the attribution:
  // the catalog can take longer than the whole preview.
  const attribution = withUpdateDates([
    basemap,
    ...chosen.flatMap((layer) =>
      isUrbanismLayer(layer) ? (urbanSources.find((each) => each.layer === layer).source ?? []) : [layer],
    ),
    ...(outline ? [BOUNDARY_SOURCE] : []),
  ]).then((sources) => {
    const added = layersSource(layers);
    return attributionText({ sources: added ? [...sources, added] : sources });
  });

  const [overview, detail] = await Promise.all([
    paint({
      basemap,
      mapLayers: chosen,
      area: extent,
      sizedFor: extent,
      grayscale,
      boundary: outline ? boundary : undefined,
      municipality: boundary,
      layers,
      legend,
      attribution,
    }),
    renderDetail(request, center),
  ]);
  return { overview, ...detail, overviewZoom: extent.zoom };
}

/**
 * Draws the detail alone, at the real size of the map. Returns its canvas, and whether it already shows the
 * whole map, in which case there is nothing else to look at.
 */
export async function renderDetail(request, center) {
  const { basemapId, boundary, bbox, zoom, margin, grayscale, outline, mapLayers = [], layers } = request;
  const basemap = BASEMAPS[basemapId];
  const mapExtent = extentFromBbox(bbox, zoom, margin);
  const area = extentWindow(mapExtent, DETAIL_WIDTH, DETAIL_HEIGHT, center);
  const detail = await paint({
    basemap,
    mapLayers: chooseMapLayers(mapLayers),
    area,
    sizedFor: mapExtent,
    grayscale,
    boundary: outline ? boundary : undefined,
    municipality: boundary,
    layers,
  });
  return { detail, wholeMap: area.width === mapExtent.width && area.height === mapExtent.height };
}

/** Largest zoom level whose image fits in the miniature: a handful of tiles, and the shape of the municipality. */
function overviewZoom(bbox, margin) {
  for (let zoom = 19; zoom > 0; zoom--) {
    const extent = extentFromBbox(bbox, zoom, margin);
    if (Math.max(extent.width, extent.height) <= OVERVIEW_SIDE) return zoom;
  }
  return 1;
}

/**
 * Draws the tiles of `area`, then the overlays as they would be drawn on the whole map of `sizedFor`, shifted
 * so that the window falls in the canvas: symbols and labels then keep the size they will have on the map.
 */
async function paint({
  basemap,
  mapLayers = [],
  area,
  sizedFor,
  grayscale,
  boundary,
  municipality,
  layers,
  legend,
  attribution,
}) {
  const { canvas, context } = createCanvas(area.width, area.height);
  const tiles = [...tilesInExtent(area)];
  // As on the map: a layer whose service publishes nothing at this zoom is left out.
  mapLayers = mapLayers.filter((layer) => drawnAtZoom(layer, sizedFor.zoom));
  // Layers drawn from vector tiles are read once from their archive, not downloaded tile by tile.
  const legendExtra = [];
  const vectors = [];
  const zonings = [];
  const placedLabels = [];
  for (const layer of mapLayers.filter(isUrbanismLayer)) {
    const plan = await urbanPlanOf(layer, municipality, sizedFor);
    const drawing = urbanPlanDrawing(layer, plan, sizedFor, municipality.name, { avoid: placedLabels });
    placedLabels.push(...drawing.labels.map(({ box }) => box));
    zonings.push(drawing);
    legendExtra.push(...drawing.legend);
  }
  for (const layer of mapLayers.filter(isVectorLayer)) {
    const tiles = await readVectorLayer(layer, sizedFor);
    vectors.push({ layer, tiles });
    legendExtra.push(...mapLayerLegendEntries(layer, categoriesInTiles(layer, tiles)));
  }

  // The basemap first, then the image layers laid over it, in the order of the catalog.
  for (const source of [basemap, ...mapLayers.filter(isTileLayer)]) {
    await downloadTiles(source, area.zoom, tiles, {
      loadTile: async (url, tile) => {
        // The desktop engine passes the tile through the main process, which caches it on disk; in a browser,
        // the page downloads it itself.
        const load = engine.loadTile ?? ((tileUrl) => fetchTile(tileUrl));
        const content = await load(url, { basemapId: source.id, zoom: area.zoom, x: tile.x, y: tile.y });
        // Only the basemap goes gray: a layer laid over it keeps its colors, as the boundary does.
        const isBasemap = source === basemap;
        if (content) {
          await drawTile(context, area, { ...tile, content }, { grayscale: grayscale && isBasemap, opacity: source.opacity });
        }
        return content ? true : null;
      },
      concurrency: CONCURRENCY,
    });
  }

  // A WMS draws the area asked for: the preview asks only for what it shows.
  for (const layer of mapLayers.filter(isWmsLayer)) {
    const blocks = wmsRequests(layer, area);
    const load = engine.loadTile ?? ((url) => fetchTile(url));
    const images = await fetchWmsImages(layer, blocks, {
      load: (url, block) => load(url, { basemapId: layer.id, zoom: area.zoom, x: block.x, y: block.y }),
    });
    for (const [index, block] of blocks.entries()) {
      if (images[index]) await drawWmsBlock(context, block, images[index], { opacity: layer.opacity });
    }
    const legend = await fetchTile(wmsLegendUrl(layer)).catch(() => null);
    if (legend) legendExtra.push(await legendImageEntry(legend));
  }

  context.save();
  context.translate(sizedFor.xMin - area.xMin, sizedFor.yMin - area.yMin);
  for (const { layer, tiles } of vectors) {
    drawPaths(context, vectorTileShapes(tiles, sizedFor, { styleOf: vectorStyleOf(layer) }));
  }
  for (const { paths } of zonings) drawPaths(context, paths);
  if (boundary) drawBoundary(context, boundary, sizedFor);
  for (const { labels } of zonings) drawLabels(context, labels);
  drawLayers(context, layers, sizedFor);
  if (legend) drawLegend(context, layers, sizedFor, legendExtra);
  if (attribution) drawAttribution(context, await attribution, sizedFor);
  context.restore();
  return canvas;
}
