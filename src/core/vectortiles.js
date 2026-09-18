// Layers drawn from vector tiles: which tiles of an archive cover the map, and what shapes they give once
// placed in the image. Unlike an image layer, the drawing is ours, so it stays sharp at any print size.

import { requestRange } from './http.js';
import { readVectorTile } from './mvt.js';
import { box, boxesOverlap, expandBox, mergeBoxes, pathData } from './overlays.js';
import { openArchive } from './pmtiles.js';
import { TILE_SIZE } from './tiles.js';

const CONCURRENCY = 6;

/**
 * Reads from the archive of a layer the tiles covering the extent, and decodes them. Only a few kilobytes
 * travel: the table of contents of the archive, then the tiles themselves.
 */
export async function readVectorLayer(layer, extent, { fetchRange = requestRange } = {}) {
  const archive = await openArchive(layer.url, fetchRange);
  const { tiles } = vectorTilesInExtent(extent, Math.min(layer.dataMaxZoom ?? Infinity, archive.header.maxZoom));

  const decoded = [];
  let next = 0;
  const worker = async () => {
    while (next < tiles.length) {
      const tile = tiles[next++];
      const bytes = await archive.tile(tile.zoom, tile.x, tile.y);
      if (bytes) decoded.push({ ...tile, layers: readVectorTile(bytes) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker));
  return decoded;
}

/** The categories really present in the tiles read, so that a legend names only what can be seen. */
export function categoriesInTiles(layer, tiles) {
  const present = new Set();
  for (const tile of tiles) {
    for (const vectorLayer of tile.layers) {
      for (const feature of vectorLayer.features) present.add(feature.properties[layer.categoryProperty]);
    }
  }
  return present;
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
