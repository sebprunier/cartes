// Preview of the map before generating it. It is drawn with the same code as the map itself, so that what the
// preview shows is what the file will contain: the whole municipality reduced to a miniature, and a window of
// its center at real size, which tells whether the labels will still be readable once printed.

import { BASEMAPS } from './core/basemaps.js';
import { layersSource } from './core/layers.js';
import { chooseMapLayers, isVectorLayer, mapLayerLegendEntries, vectorStyleOf } from './core/maplayers.js';
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
  drawLegend,
  drawPaths,
  drawTile,
} from './render.js';

// Sizes in pixels of the two views, chosen to stay readable on a page without downloading many tiles.
const OVERVIEW_SIDE = 700;
const DETAIL_WIDTH = 700;
const DETAIL_HEIGHT = 420;
const CONCURRENCY = 6;

/**
 * Draws the two views of a map request: the miniature of the whole municipality, and the detail at the point
 * given as a fraction of the map, its center by default.
 */
export async function renderPreview(request, center) {
  const { basemapId, boundary, bbox, margin, grayscale, outline, mapLayers = [], layers, legend } = request;
  const basemap = BASEMAPS[basemapId];
  const chosen = chooseMapLayers(mapLayers);
  const sources = await withUpdateDates([basemap, ...chosen, ...(outline ? [BOUNDARY_SOURCE] : [])]);
  const added = layersSource(layers);
  if (added) sources.push(added);
  const extent = extentFromBbox(bbox, overviewZoom(bbox, margin), margin);

  const [overview, detail] = await Promise.all([
    paint({
      basemap,
      mapLayers: chosen,
      area: extent,
      sizedFor: extent,
      grayscale,
      boundary: outline ? boundary : undefined,
      layers,
      legend,
      attribution: attributionText({ sources }),
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
async function paint({ basemap, mapLayers = [], area, sizedFor, grayscale, boundary, layers, legend, attribution }) {
  const { canvas, context } = createCanvas(area.width, area.height);
  const tiles = [...tilesInExtent(area)];
  // Layers drawn from vector tiles are read once from their archive, not downloaded tile by tile.
  const legendExtra = [];
  const vectors = [];
  for (const layer of mapLayers.filter(isVectorLayer)) {
    const tiles = await readVectorLayer(layer, sizedFor);
    vectors.push({ layer, tiles });
    legendExtra.push(...mapLayerLegendEntries(layer, categoriesInTiles(layer, tiles)));
  }

  // The basemap first, then the image layers laid over it, in the order of the catalog.
  for (const source of [basemap, ...mapLayers.filter((layer) => !isVectorLayer(layer))]) {
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

  context.save();
  context.translate(sizedFor.xMin - area.xMin, sizedFor.yMin - area.yMin);
  for (const { layer, tiles } of vectors) {
    drawPaths(context, vectorTileShapes(tiles, sizedFor, { styleOf: vectorStyleOf(layer) }));
  }
  if (boundary) drawBoundary(context, boundary, sizedFor);
  drawLayers(context, layers, sizedFor);
  if (legend) drawLegend(context, layers, sizedFor, legendExtra);
  if (attribution) drawAttribution(context, attribution, sizedFor);
  context.restore();
  return canvas;
}
