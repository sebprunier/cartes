// Layers drawn from vector tiles: which tiles of an archive cover the map, and what shapes they give once
// placed in the image. Unlike an image layer, the drawing is ours, so it stays sharp at any print size.

import { tileUrl } from './basemaps.js';
import { requestBytes, requestRange } from './http.js';
import { vectorCategoryOf, vectorStyleOf } from './maplayers.js';
import { readVectorTile } from './mvt.js';
import { box, boxesOverlap, expandBox, mergeBoxes, pathData } from './overlays.js';
import { openArchive } from './pmtiles.js';
import { TILE_SIZE } from './tiles.js';

const CONCURRENCY = 6;
// How many levels the reading drops through, looking for the detail a template really holds. Each level
// divides the number of tiles by four, so the whole search costs barely more than a single reading.
const MAX_FALLBACKS = 6;
// Below this, a tile covers a whole region: a layer that still holds nothing holds nothing here.
const LOWEST_ZOOM = 8;
// How many tiles are asked for to find out whether a level holds anything.
const PROBE_TILES = 8;
// A service that refuses this many tiles in a row is not going to serve the next one either.
const MAX_CONSECUTIVE_FAILURES = 10;

export class VectorLayerError extends Error {}

/**
 * Reads from the archive of a layer the tiles covering the extent, and decodes them. Only a few kilobytes
 * travel: the table of contents of the archive, then the tiles themselves.
 */
export async function readVectorLayer(layer, extent, { fetchRange = requestRange, fetchBytes = requestBytes } = {}) {
  const source = await openSource(layer, { fetchRange, fetchBytes });
  // The zoom the layer is first read at: never above what the map shows, so that dropping a level means
  // something — `Infinity - 1` is still `Infinity`.
  const highest = Math.min(extent.zoom, layer.dataMaxZoom ?? Infinity, source.maxZoom);

  // An archive says in its table of contents how far its data goes, so its tiles are simply read.
  if (source.fallbacks === 0) return readTiles(layer, source, vectorTilesInExtent(extent, highest).tiles);

  // A template says nothing, and a service answers an empty tile past its own detail. So the layer is read
  // one level lower when it holds nothing at the zoom asked for, and drawn larger: a coarser drawing beats a
  // layer that silently shows nothing. Which level holds something is asked of a handful of tiles spread over
  // the map, not of the whole map: finding out otherwise would mean thousands of requests, at high zoom, to a
  // service that owes us nothing.
  for (let zoom = highest; zoom >= LOWEST_ZOOM; zoom--) {
    if (highest - zoom > MAX_FALLBACKS) break;
    const { tiles } = vectorTilesInExtent(extent, zoom);
    const sample = spread(tiles, PROBE_TILES);
    const probed = await readTiles(layer, source, sample);
    if (probed.length === 0) continue;
    const rest = tiles.filter((tile) => !sample.includes(tile));
    return [...probed, ...(await readTiles(layer, source, rest))];
  }
  return [];
}

/** A handful of tiles taken evenly across the map, rather than a corner of it. */
function spread(tiles, count) {
  if (tiles.length <= count) return tiles;
  const step = tiles.length / count;
  return Array.from({ length: count }, (unused, index) => tiles[Math.floor(index * step)]);
}

/**
 * Reads the tiles given, leaving out those a service refuses. A tile that fails leaves a hole rather than
 * losing the whole map, but too many failures in a row stop it: a service we do not own may be limiting us,
 * and insisting would be rude as well as useless.
 */
async function readTiles(layer, source, tiles) {
  const decoded = [];
  let next = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  let lastError;

  const worker = async () => {
    while (next < tiles.length && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      const tile = tiles[next++];
      try {
        const bytes = await source.tile(tile.zoom, tile.x, tile.y);
        if (bytes?.length) decoded.push({ ...tile, layers: readVectorTile(bytes) });
        consecutiveFailures = 0;
      } catch (error) {
        lastError = error;
        failures++;
        consecutiveFailures++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker));

  // A service that refuses everything asked of it is not a layer with nothing to show: taking one for the
  // other would draw an empty map in silence, and leave the address looking valid.
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || (failures > 0 && failures === tiles.length)) {
    const limited = lastError?.status === 429;
    throw new VectorLayerError(
      `La couche « ${layer.name} » n’a pas pu être lue : ${failures} tuile(s) en échec` +
        (limited
          ? '. Le service limite le nombre de requêtes : reprenez à un niveau de zoom plus faible, ou plus tard.'
          : `. Dernière erreur : ${lastError?.message ?? 'inconnue'}.`),
      { cause: lastError },
    );
  }
  return decoded;
}

/**
 * Where the tiles of a layer come from: a single archive, whose table of contents says how far its data goes,
 * or one address per tile, which says nothing at all — such a service answers an empty tile past its own
 * detail, so the zoom level where its data stops is part of what the layer is asked to declare.
 */
async function openSource(layer, { fetchRange, fetchBytes }) {
  if (!layer.url.includes('{z}')) {
    const archive = await openArchive(layer.url, fetchRange);
    return { maxZoom: archive.header.maxZoom, fallbacks: 0, tile: archive.tile };
  }
  return { maxZoom: Infinity, fallbacks: MAX_FALLBACKS, tile: (zoom, x, y) => fetchBytes(tileUrl(layer, zoom, x, y)) };
}

/**
 * The categories really present in the tiles read, with the color each is drawn in, so that a legend names
 * only what can be seen. Categories are ordered by a number the features carry when they all carry one —
 * a level of hazard reads « faible, moyen, fort », never in the order the tiles happen to arrive in.
 */
export function categoriesInTiles(layer, tiles) {
  const categoryOf = vectorCategoryOf(layer);
  const styleOf = vectorStyleOf(layer);

  const found = new Map();
  for (const tile of tiles) {
    for (const vectorLayer of tile.layers ?? []) {
      for (const feature of vectorLayer.features) {
        const category = categoryOf(feature.properties);
        if (found.has(category)) continue;
        found.set(category, { color: styleOf(feature.properties)?.fill, rank: rankOf(feature.properties) });
      }
    }
  }

  const entries = [...found];
  const ranks = entries.map(([, { rank }]) => rank);
  if (ranks.every((rank) => rank !== undefined) && new Set(ranks).size === ranks.length) {
    entries.sort(([, one], [, other]) => one.rank - other.rank);
  }
  return new Map(entries.map(([category, { color }]) => [category, color]));
}

/** The one number a feature carries, if it carries exactly one: a label is usually paired with its level. */
function rankOf(properties) {
  const numbers = Object.values(properties).filter((value) => typeof value === 'number');
  return numbers.length === 1 ? numbers[0] : undefined;
}

/**
 * Tiles of the archive covering the extent, and the zoom level they are read at: an archive stops at a zoom
 * level, above which the same tiles are simply drawn larger. Their geometry stays sharp, but not more precise.
 */
export function vectorTilesInExtent(extent, dataMaxZoom) {
  const zoom = Math.min(extent.zoom, dataMaxZoom);
  const size = TILE_SIZE * 2 ** (extent.zoom - zoom);
  const tiles = [];
  for (let y = Math.floor(extent.yMin / size); y <= Math.floor((extent.yMax - 1) / size); y++) {
    for (let x = Math.floor(extent.xMin / size); x <= Math.floor((extent.xMax - 1) / size); x++) {
      tiles.push({ x, y, zoom });
    }
  }
  return { zoom, tiles };
}

/**
 * Shapes in image pixels of the decoded tiles, each with the area it covers so that it is drawn only where it
 * falls. `styleOf(properties)` gives the colors of a feature, or nothing at all to leave it out.
 */
export function vectorTileShapes(tiles, extent, { styleOf, strokeWidth = 0 }) {
  const image = box(0, 0, extent.width, extent.height);
  const shapes = [];

  for (const tile of tiles) {
    const factor = 2 ** (extent.zoom - tile.zoom);
    const originX = tile.x * TILE_SIZE * factor - extent.xMin;
    const originY = tile.y * TILE_SIZE * factor - extent.yMin;

    // Tiles carry a margin beyond their own square, so that a shape crossing their edge stays whole. Drawn as
    // they come, these margins overlap and the neighbouring tile is painted twice: the geometry is cut back.
    const side = TILE_SIZE * factor;
    const own = box(originX, originY, side, side);

    for (const layer of tile.layers ?? []) {
      const scale = side / layer.extent;
      for (const feature of layer.features) {
        const style = styleOf(feature.properties);
        if (!style || feature.rings.length === 0) continue;
        const rings = feature.rings
          .map((ring) => clipRing(ring.map(([x, y]) => [originX + x * scale, originY + y * scale]), own))
          .filter((ring) => ring.length > 2);
        if (rings.length === 0) continue;
        const area = expandBox(ringsBox(rings), strokeWidth);
        if (!boxesOverlap(area, image)) continue;
        shapes.push({
          path: pathData(rings, feature.shape === 'polygon'),
          box: area,
          color: style.color,
          strokeWidth: style.color ? strokeWidth : 0,
          fill: feature.shape === 'polygon' ? style.fill : undefined,
          fillOpacity: style.fillOpacity ?? 1,
        });
      }
    }
  }
  return shapes;
}

/**
 * A ring cut to a rectangle, edge by edge (Sutherland–Hodgman): the points outside are replaced by where the
 * ring crosses the edge. A ring entirely outside comes back empty.
 */
function clipRing(ring, area) {
  const edges = [
    { inside: ([x]) => x >= area.x, at: (from, to) => crossing(from, to, 0, area.x) },
    { inside: ([x]) => x <= area.x + area.width, at: (from, to) => crossing(from, to, 0, area.x + area.width) },
    { inside: ([, y]) => y >= area.y, at: (from, to) => crossing(from, to, 1, area.y) },
    { inside: ([, y]) => y <= area.y + area.height, at: (from, to) => crossing(from, to, 1, area.y + area.height) },
  ];

  let points = ring;
  for (const edge of edges) {
    const kept = [];
    for (let index = 0; index < points.length; index++) {
      const current = points[index];
      const previous = points[(index + points.length - 1) % points.length];
      const currentInside = edge.inside(current);
      if (currentInside !== edge.inside(previous)) kept.push(edge.at(previous, current));
      if (currentInside) kept.push(current);
    }
    points = kept;
    if (points.length === 0) return [];
  }
  return points;
}

/** Where the segment crosses the line at `value` on the given axis (0 for x, 1 for y). */
function crossing(from, to, axis, value) {
  const other = 1 - axis;
  const share = (value - from[axis]) / (to[axis] - from[axis]);
  const point = [];
  point[axis] = value;
  point[other] = from[other] + share * (to[other] - from[other]);
  return point;
}

function ringsBox(rings) {
  return rings.flat().reduce((current, [x, y]) => mergeBoxes(current, box(x, y, 0, 0)), undefined);
}
