// Generation of a map, and estimate of its file size, shared by the tools that render with sharp: the command
// line, the desktop application and the API. Each tool resolves its own request — options, interface, HTTP —
// into the objects taken here, and tells its user what happens in its own way.

import { canUsePalette } from '../core/basemaps.js';
import { estimateFileSize } from '../core/estimates.js';
import { layerWarning, layersSource } from '../core/layers.js';
import {
  checkMapLayer,
  drawnAtZoom,
  isCustomLayer,
  isTileLayer,
  isUrbanismLayer,
  isVectorLayer,
  isWmsLayer,
  mapLayerLegendEntries,
  mapLayerZoomWarning,
  resolveMapLayers,
  vectorStyleOf,
} from '../core/maplayers.js';
import { withUpdateDates } from '../core/metadata.js';
import {
  BOUNDARY_SOURCE,
  boundaryBbox,
  fetchBoundary,
  normalizeName,
  resolveMunicipality,
} from '../core/municipalities.js';
import { attributionText } from '../core/overlays.js';
import { downloadTiles, extentFromBbox, fetchTile, layerTiles, sampleTiles, tilesInExtent } from '../core/tiles.js';
import { extentBbox, readUrbanPlan, urbanPlanDrawing } from '../core/urbanism.js';
import { categoriesInTiles, readVectorLayer, vectorTileShapes } from '../core/vectortiles.js';
import { fetchWmsImages, wmsLegendUrl, wmsRequests } from '../core/wms.js';
import { cachedTileLoader, tileSizes } from './cache.js';
import {
  assembleTiles,
  attributionLabel,
  boundaryOutline,
  drawMapLayer,
  drawOverlays,
  drawWmsLayer,
  labelOverlays,
  layerOverlays,
  legendImageEntry,
  legendOverlay,
  saveImage,
  vectorOverlays,
} from './render.js';

// The source of the progress of the dates of the data, read in the catalog for the attribution of the map.
export const DATES_PROGRESS = 'dates';

// Size of the grid of tiles downloaded for each zoom level to estimate the size of the generated file:
// 6 × 6 tiles keep the sampling error under 10 % on the maps measured, where 16 tiles in a row reached 25 %.
export const SAMPLE_GRID_SIZE = 6;

/**
 * Finds the municipality — by name or INSEE code — its boundary and the extent of its map, and says what the
 * user should know before generating it: a layer that stops short of this zoom, a data file too large to
 * label every object, a layer given by its address that has nothing on this municipality. That last one is
 * found by trying the layer on one tile, so that a mistyped address fails here, not after a long download.
 */
export async function planMap({ municipality, department, zoom, margin, mapLayers = [], layers = [] }) {
  const inseeCode = await resolveMunicipality(municipality, department);
  const boundary = await fetchBoundary(inseeCode);
  const bbox = boundaryBbox(boundary);
  const extent = extentFromBbox(bbox, zoom, margin);

  const warnings = [];
  const [lon, lat] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  for (const layer of mapLayers.filter(isCustomLayer)) {
    const { empty } = await checkMapLayer(layer, { lon, lat, zoom });
    if (empty) warnings.push(`« ${layer.name} » répond, mais n’a aucune donnée sur cette commune.`);
  }
  for (const layer of mapLayers) {
    const warning = mapLayerZoomWarning(layer, zoom);
    if (warning) warnings.push(warning);
  }
  for (const layer of layers) {
    const warning = layerWarning(layer);
    if (warning) warnings.push(`${layer.name} — ${warning}`);
  }
  return { boundary, bbox, extent, warnings };
}

/** Name of the file of a map, without its extension: the municipality, the basemap, the layers and the zoom. */
export function mapFileName({ boundary, basemap, mapLayers = [], zoom, grayscale = false }) {
  return (
    `${boundary.inseeCode}-${normalizeName(boundary.name).replaceAll(' ', '-')}-${basemap.id}` +
    `${mapLayers.map((layer) => `-${layer.id}`).join('')}-z${zoom}${grayscale ? '-gris' : ''}`
  );
}

/**
 * Generates the map of `extent` into `outputPath`.
 *
 * - `basemap`, `mapLayers`: the basemap and the chosen layers, as the catalogs define them;
 * - `boundary`: the outline of the municipality, drawn unless `outline` is false;
 * - `layers`: the data added to the map, as `readLayer` returns them;
 * - `legend`: false to leave the legend out.
 *
 * `onStep(message)` tells what is being done, and what went wrong along the way without stopping the map;
 * `onProgress({ sourceId, done, total })` counts the tiles or images of each source. An aborted `signal` stops
 * the generation at the next step. What the tool has to word for its own user comes back in the result: `missing`
 * tiles of the basemap, left blank, `updateDatesMissing` when the catalog did not give the date of the
 * data, which the license of the IGN asks to write on the map, and `warnings` about what the map lacks.
 */
export async function generateMap(
  {
    basemap,
    extent,
    boundary,
    layers = [],
    mapLayers: chosenLayers = [],
    outline = true,
    legend = true,
    grayscale = false,
    dpi,
    format,
    outputPath,
    cacheDir,
    concurrency,
  },
  { onStep = () => {}, onProgress = () => {}, signal } = {},
) {
  const { zoom } = extent;
  const warnings = [];
  // A layer whose service publishes nothing at this zoom is left out, and not credited: its warning said so.
  // One published by vintage gets the most recent one the municipality has, or is left out, and says so.
  const [lonMin, latMin, lonMax, latMax] = extentBbox(extent);
  const resolved = await resolveMapLayers(
    chosenLayers.filter((layer) => drawnAtZoom(layer, zoom)),
    [(lonMin + lonMax) / 2, (latMin + latMax) / 2],
  );
  const mapLayers = resolved.layers;
  warnings.push(...resolved.warnings);
  // Checked between the steps, and not only while tiles download: a map canceled once its tiles are there
  // would otherwise be drawn and written to the end, for nothing.
  const stopIfAborted = () => {
    if (signal?.aborted) throw new Error('Génération annulée.');
  };
  // A layer above the last zoom its service publishes is downloaded at that zoom, and drawn larger.
  const download = (source, { zoom: tileZoom, tiles } = { zoom, tiles: [...tilesInExtent(extent)] }) =>
    downloadTiles(source, tileZoom, tiles, {
      loadTile: cachedTileLoader({ cacheDir, basemapId: source.vintage ? `${source.id}-${source.vintage}` : source.id, zoom: tileZoom }),
      concurrency,
      signal,
      onProgress: (done, total) => onProgress({ sourceId: source.id, done, total }),
    });

  // The zoning and the images of a WMS are read before anything else: a service that does not answer fails the
  // map at once, rather than once its thousands of tiles are downloaded.
  const urbanPlans = new Map();
  // The labels of the zoning are placed first, those of the prescriptions around them.
  const placedLabels = [];
  for (const layer of mapLayers.filter(isUrbanismLayer)) {
    onStep(`Lecture de « ${layer.name} » pour ${boundary.name}, sur le Géoportail de l’urbanisme…`);
    const plan = await readUrbanPlan(boundary.inseeCode, extentBbox(extent), { content: layer.content });
    const drawing = urbanPlanDrawing(layer, plan, extent, boundary.name, { avoid: placedLabels });
    placedLabels.push(...drawing.labels.map(({ box }) => box));
    // The zoning and the prescriptions of a municipality without a document say it alike: once is enough.
    if (drawing.warning && !warnings.includes(drawing.warning)) warnings.push(drawing.warning);
    if (!drawing.warning) onStep(`  ${drawing.paths.length} forme(s), ${drawing.labels.length} étiquette(s).`);
    urbanPlans.set(layer.id, drawing);
    onProgress({ sourceId: layer.id, done: 1, total: 1 });
  }
  // The dates of the data are asked for now, and waited for only to write the attribution: the catalog can take
  // longer than all the tiles.
  const datedSources = withUpdateDates(
    [
      basemap,
      // The zoning is credited with the documents of this municipality, or not at all when it has none.
      ...mapLayers.flatMap((layer) => (isUrbanismLayer(layer) ? (urbanPlans.get(layer.id).source ?? []) : [layer])),
      ...(outline ? [BOUNDARY_SOURCE] : []),
    ],
    // Their progress has a line of its own: the catalog can be slower than every tile of the map.
    { onProgress: (progress) => onProgress({ sourceId: DATES_PROGRESS, ...progress }) },
  );
  const wmsBlocks = new Map();
  for (const layer of mapLayers.filter(isWmsLayer)) {
    stopIfAborted();
    const blocks = wmsRequests(layer, extent);
    onStep(`Téléchargement de ${blocks.length} image(s) pour « ${layer.name} »…`);
    const images = await fetchWmsImages(layer, blocks, {
      onImage: (done, total) => onProgress({ sourceId: layer.id, done, total }),
    });
    blocks.forEach((block, index) => (block.content = images[index]));
    wmsBlocks.set(layer.id, blocks);
  }

  onStep(`Téléchargement de ${extent.tileCount} tuiles pour « ${basemap.name} » (zoom ${zoom})…`);
  const tiles = await download(basemap);
  const failedTiles = tiles.filter((tile) => tile.error);
  if (failedTiles.length > 0) {
    onStep(
      `  ${failedTiles.length} tuile(s) en échec malgré plusieurs tentatives, par exemple : ${failedTiles[0].error.message}`,
    );
  }

  stopIfAborted();
  onStep(`Assemblage d'une image de ${extent.width} × ${extent.height} px…`);
  const { pixels, missing } = await assembleTiles(extent, tiles, { grayscale });

  const vectorShapes = [];
  const zoneLabels = [];
  const legendExtra = [];
  for (const layer of mapLayers) {
    stopIfAborted();
    if (isUrbanismLayer(layer)) {
      const { paths, labels, legend: entries } = urbanPlans.get(layer.id);
      vectorShapes.push(...paths);
      zoneLabels.push(...labels);
      legendExtra.push(...entries);
      continue;
    }

    if (isVectorLayer(layer)) {
      onStep(`Lecture des tuiles vectorielles de « ${layer.name} »…`);
      const vectorTiles = await readVectorLayer(layer, extent);
      const shapes = vectorTileShapes(vectorTiles, extent, { styleOf: vectorStyleOf(layer) });
      const readAt = vectorTiles[0]?.zoom;
      const coarser = readAt !== undefined && readAt < zoom ? `, lues au zoom ${readAt} et dessinées en plus grand` : '';
      onStep(`  ${shapes.length} forme(s) dessinée(s) depuis ${vectorTiles.length} tuile(s)${coarser}.`);
      onProgress({ sourceId: layer.id, done: 1, total: 1 });
      vectorShapes.push(...shapes);
      legendExtra.push(...mapLayerLegendEntries(layer, categoriesInTiles(layer, vectorTiles)));
      continue;
    }

    if (isWmsLayer(layer)) {
      const blocks = wmsBlocks.get(layer.id);
      const missingBlocks = await drawWmsLayer(pixels, extent, blocks, { opacity: layer.opacity });
      if (missingBlocks > 0) onStep(`  ${missingBlocks} image(s) indisponible(s) : le fond reste visible.`);
      // The service styles its own zoning: its legend is the only one that tells the truth about it.
      const legendImage = await fetchTile(wmsLegendUrl(layer)).catch(() => null);
      if (legendImage) legendExtra.push(await legendImageEntry(legendImage));
      continue;
    }

    const wanted = layerTiles(layer, extent);
    const larger = wanted.scale > 1 ? `, au zoom ${wanted.zoom} et dessinées ${wanted.scale} fois plus grandes` : '';
    onStep(`Téléchargement de ${wanted.tiles.length} tuiles pour « ${layer.name} »${larger}…`);
    const downloaded = await download(layer, wanted);
    const { missing: missingLayerTiles, drawn } = await drawMapLayer(pixels, extent, downloaded, {
      opacity: layer.opacity,
      scale: wanted.scale,
    });
    // A layer of tiles can declare its legend; it is shown only when the layer drew something on this map.
    if (drawn) legendExtra.push(...(layer.legend ?? []));
    if (missingLayerTiles > 0) {
      onStep(`  ${missingLayerTiles} tuile(s) de la couche indisponible(s) : le fond reste visible.`);
    }
  }

  stopIfAborted();
  const overlays = vectorOverlays(vectorShapes);
  if (outline) overlays.push(boundaryOutline(boundary, extent));
  overlays.push(...labelOverlays(zoneLabels));
  overlays.push(...layerOverlays(layers, extent));
  if (legend) overlays.push(await legendOverlay(layers, extent, legendExtra));

  const sources = await datedSources;
  const added = layersSource(layers);
  if (added) sources.push(added);
  overlays.push(await attributionLabel(attributionText({ sources }), extent));
  onStep(outline ? 'Tracé du contour et ajout de la mention des sources…' : 'Ajout de la mention des sources…');
  await drawOverlays(pixels, extent, overlays);

  stopIfAborted();
  onStep(`Enregistrement dans ${outputPath}…`);
  await saveImage(pixels, extent, outputPath, { dpi, palette: canUsePalette(basemap, format) });

  return {
    width: extent.width,
    height: extent.height,
    missing,
    updateDatesMissing: sources.some((source) => source.metadataId && !source.updateDate),
    warnings,
  };
}

/**
 * Estimated size in bytes of the file of the map of `extent`, from a sample of its tiles: undefined when the
 * format gives no way to estimate it. Fails when the sample cannot be downloaded.
 */
export async function estimateMapFileSize({ basemap, extent, mapLayers = [], format, grayscale, cacheDir, concurrency }) {
  const sample = sampleTiles(extent, SAMPLE_GRID_SIZE);
  const sizesOf = async (source) => {
    // A tile drawn larger fills as many pixels as the tiles of the map it covers, and weighs about as much as
    // each of them: counted as one of them. Measured on Colombiers at zoom 17, from the land cover of zoom 16:
    // 7.4 MB estimated for the layer, 8.0 MB in the file. Spread over them, the estimate fell to 1.9 MB.
    const { zoom, tiles: wanted } = layerTiles(source, extent, sample);
    const tiles = await downloadTiles(source, zoom, wanted, {
      loadTile: cachedTileLoader({ cacheDir, basemapId: source.vintage ? `${source.id}-${source.vintage}` : source.id, zoom }),
      concurrency,
    });
    return tileSizes(tiles);
  };

  const sampleSizes = await sizesOf(basemap);
  const layers = [];
  const [lonMin, latMin, lonMax, latMax] = extentBbox(extent);
  const { layers: resolved } = await resolveMapLayers(
    mapLayers.filter((each) => isTileLayer(each) && drawnAtZoom(each, extent.zoom)),
    [(lonMin + lonMax) / 2, (latMin + latMax) / 2],
  );
  // A layer we draw ourselves has no tiles to sample, and adds nothing to the file; nor does one left out.
  for (const layer of resolved) {
    layers.push({ layer, sampleSizes: await sizesOf(layer) });
  }
  return estimateFileSize({
    basemap,
    format,
    grayscale,
    palette: canUsePalette(basemap, format),
    zoom: extent.zoom,
    tileCount: extent.tileCount,
    sampleSizes,
    layers,
  });
}
