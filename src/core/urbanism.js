// The zoning of the urban planning document of a municipality — PLU, intercommunal PLU or carte communale —
// read from the WFS of the Géoportail de l'urbanisme and drawn by the tool itself. Its WMS fills the zones only
// up to zoom 15, and draws bare outlines from zoom 16 (9.6 % of a tile at Colombiers): the scales a town hall
// prints at. Read as data, the zones stay filled and sharp at every zoom, with our legend and their labels.

import { HttpError, request } from './http.js';
import { labelFontSize } from './layers.js';
import { mapLayerLegendEntries } from './maplayers.js';
import { box, boxesOverlap, expandBox, mergeBoxes, pathData } from './overlays.js';
import { TILE_SIZE, lonLatToPixel } from './tiles.js';

const WFS_URL = 'https://data.geopf.fr/wfs/ows';
// Features asked for in one request; a document holding more is read page after page.
const PAGE_SIZE = 5000;
const ATTEMPTS = 3;

// Kinds of documents, as the service names them, and as the attribution writes them.
const DOCUMENT_NAMES = { PLU: 'PLU', PLUI: 'PLU intercommunal', CC: 'carte communale', POS: 'POS', PSMV: 'PSMV' };

export class UrbanismError extends Error {}

/**
 * The urban planning documents in force on the municipality `inseeCode`, and their zones that fall within
 * `bbox` [lonMin, latMin, lonMax, latMax] — an intercommunal PLU covers far more than one map. A municipality
 * under the national planning rules (RNU) has none: both lists come back empty.
 * A plan of safeguard (PSMV) is left out: it is a document of its own, over the centre of a few towns only.
 */
export async function readUrbanPlan(inseeCode, bbox, { fetchJson = requestWfs } = {}) {
  const links = await fetchJson(
    wfsUrl('wfs_du:doc_urba_com', { CQL_FILTER: `insee='${inseeCode}'`, PROPERTYNAME: 'partition' }),
  );
  const partitions = [...new Set(links.features.map(({ properties }) => properties.partition))].filter((partition) =>
    partition?.startsWith('DU_'),
  );

  const documents = [];
  const zones = [];
  for (const partition of partitions) {
    const [record] = (
      await fetchJson(
        wfsUrl('wfs_du:doc_urba', {
          CQL_FILTER: `partition='${partition}'`,
          PROPERTYNAME: 'partition,idurba,typedoc,datappro',
        }),
      )
    ).features;
    const kind = (record?.properties.typedoc ?? '').toUpperCase();
    documents.push({ partition, kind, approvedOn: isoDate(record?.properties.datappro) });

    const sectors = kind === 'CC';
    const [lonMin, latMin, lonMax, latMax] = bbox;
    // The service reads its bounds latitude first, as EPSG:4326 orders its axes.
    const filter = `partition='${partition}' AND BBOX(the_geom,${latMin},${lonMin},${latMax},${lonMax})`;
    const properties = sectors ? 'the_geom,typesect,libelle' : 'the_geom,typezone,libelle,libelong';
    for (let start = 0; ; start += PAGE_SIZE) {
      const page = await fetchJson(
        wfsUrl(sectors ? 'wfs_du:secteur_cc' : 'wfs_du:zone_urba', {
          CQL_FILTER: filter,
          PROPERTYNAME: properties,
          SRSNAME: 'EPSG:4326',
          COUNT: String(PAGE_SIZE),
          STARTINDEX: String(start),
        }),
      );
      for (const feature of page.features) {
        const zone = sectors ? sectorOf(feature) : zoneOf(feature);
        if (zone) zones.push(zone);
      }
      if (page.features.length < PAGE_SIZE) break;
    }
  }
  return { documents, zones };
}

/** A zone of a PLU: its category among U, AUc, AUs, A and N, the label written on it, and its polygons. */
function zoneOf({ properties, geometry }) {
  const category = zoneCategory(properties.typezone);
  const polygons = polygonsOf(geometry);
  if (!category || polygons.length === 0) return undefined;
  return { category, label: text(properties.libelle), name: text(properties.libelong), polygons };
}

/**
 * Category of a zone, from its type as the national standard (CNIG) writes it. Older documents write the
 * sectors of a zone in its type — « Ah », « Nh » —, which still belong to it.
 */
export function zoneCategory(type) {
  const written = text(type);
  if (!written) return undefined;
  if (/^AUs/i.test(written)) return 'AUs';
  if (/^AU/i.test(written)) return 'AUc';
  return { U: 'U', A: 'A', N: 'N' }[written[0].toUpperCase()];
}

// Sectors of a carte communale, by their code in the national standard; « 99 » marks a sector left to the
// national rules, which draws nothing.
const SECTORS = { '01': 'CC-constructible', '02': 'CC-activites', '03': 'CC-non-constructible' };

/** A sector of a carte communale, labelled by the short name its label starts with: « U : Zone… » gives « U ». */
function sectorOf({ properties, geometry }) {
  const category = SECTORS[properties.typesect];
  const polygons = polygonsOf(geometry);
  if (!category || polygons.length === 0) return undefined;
  const [short, long] = (text(properties.libelle) ?? '').split(/\s*:\s*/);
  return { category, label: text(short), name: text(long), polygons };
}

function polygonsOf(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/**
 * The source of the zoning, for the attribution of the map: the documents named with the date they were
 * approved, which the open licence asks for as the freshness of the data.
 */
export function urbanPlanSource(layer, documents, municipalityName) {
  const written = documents.filter(({ kind }) => DOCUMENT_NAMES[kind]);
  if (written.length === 0) return undefined;
  const names = written.map(({ kind }) => DOCUMENT_NAMES[kind]).join(', ');
  return {
    id: layer.id,
    attribution: `${layer.attribution}, ${names} de ${municipalityName}`,
    // The source carries one date: when several documents apply, the most recent tells how fresh the map is.
    approvedOn: written.map(({ approvedOn }) => approvedOn).filter(Boolean).sort().at(-1),
  };
}

/**
 * What a platform draws of the zoning on the map of `extent`: the zones and their labels, the lines of the
 * legend for the kinds of zones shown, the source to credit — and, for a municipality without a document, a
 * warning instead, the map being generated without zoning.
 */
export function urbanPlanDrawing(layer, plan, extent, municipalityName) {
  const { paths, labels, categories } = urbanPlanShapes(plan.zones, extent, {
    styles: layer.styles,
    opacity: layer.opacity,
    fontSize: labelFontSize(extent),
  });
  const source = urbanPlanSource(layer, plan.documents, municipalityName);
  const warning =
    plan.documents.length === 0
      ? `${municipalityName} n’a pas de document d’urbanisme sur le Géoportail de l’urbanisme : elle relève du ` +
        'règlement national d’urbanisme, et la carte n’a pas de zonage.'
      : undefined;
  return { paths, labels, legend: mapLayerLegendEntries(layer, categories), source, warning };
}

/**
 * Shapes of the zones in image pixels — filled, and outlined so that two zones of the same kind stay apart —
 * and the labels written on them. A label goes where the zone is widest, and is left out where it would not fit
 * or would cover another one.
 */
export function urbanPlanShapes(zones, extent, { styles, opacity, fontSize }) {
  const scale = Math.max(extent.width, extent.height);
  const strokeWidth = Math.max(1, Math.round(scale / 2500));
  const image = box(0, 0, extent.width, extent.height);
  const paths = [];
  const labels = [];
  const taken = [];
  const categories = new Set();

  for (const zone of zones) {
    const style = styles[zone.category];
    for (const polygon of zone.polygons) {
      const rings = polygon.map((ring) => ring.map(([lon, lat]) => pixel(lon, lat, extent)));
      const area = expandBox(ringsBox(rings), strokeWidth);
      if (!boxesOverlap(area, image)) continue;
      categories.add(zone.category);
      paths.push({
        path: pathData(rings, true),
        box: area,
        fill: style.fill,
        fillOpacity: opacity,
        fillRule: 'evenodd',
        color: ZONE_OUTLINE,
        strokeWidth,
      });

      if (!zone.label) continue;
      const width = labelWidth(zone.label, fontSize);
      const spot = widestPoint(rings, area, image);
      // A label wider than the zone would say nothing about it, and hide what surrounds it.
      if (!spot || spot.room < Math.max(width, fontSize) / 2) continue;
      const labelBox = box(spot.x - width / 2 - 2, spot.y - fontSize * 0.5 - 2, width + 4, fontSize + 4);
      if (!within(labelBox, image) || taken.some((other) => boxesOverlap(labelBox, other))) continue;
      taken.push(labelBox);
      labels.push({ text: zone.label, x: spot.x, y: spot.y + fontSize * 0.35, fontSize, color: LABEL_COLOR, box: labelBox });
    }
  }
  return { paths, labels, categories };
}

// Outlines of the zones: dark enough to part two zones of the same color, light enough not to compete with the
// roads of the basemap. The labels are written in the ink of the map, over a white halo.
const ZONE_OUTLINE = 'rgba(40, 40, 40, 0.55)';
const LABEL_COLOR = '#1f2933';

/**
 * The point of a polygon farthest from its edges, among a grid of candidates within the part of the polygon in
 * the image, and how far it is: a simple stand-in for the pole of inaccessibility, enough to place a label.
 */
function widestPoint(rings, area, image) {
  const left = Math.max(area.x, image.x);
  const top = Math.max(area.y, image.y);
  const right = Math.min(area.x + area.width, image.x + image.width);
  const bottom = Math.min(area.y + area.height, image.y + image.height);
  if (right <= left || bottom <= top) return undefined;

  const steps = 12;
  const [middleX, middleY] = [(left + right) / 2, (top + bottom) / 2];
  let best;
  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      const x = left + ((column + 0.5) / steps) * (right - left);
      const y = top + ((row + 0.5) / steps) * (bottom - top);
      if (!insideRings(x, y, rings)) continue;
      const room = distanceToRings(x, y, rings);
      // In a long zone, many points are as far from the edges: the one nearest its middle reads best.
      const score = room - 0.05 * Math.hypot(x - middleX, y - middleY);
      if (!best || score > best.score) best = { x, y, room, score };
    }
  }
  return best;
}

/** Whether a point is inside a polygon and outside its holes (even-odd rule). */
function insideRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const [xi, yi] = ring[index];
      const [xj, yj] = ring[previous];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function distanceToRings(x, y, rings) {
  let nearest = Infinity;
  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      nearest = Math.min(nearest, distanceToSegment(x, y, ring[previous], ring[index]));
    }
  }
  return nearest;
}

function distanceToSegment(x, y, [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const share = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length));
  return Math.hypot(x - (x1 + share * dx), y - (y1 + share * dy));
}

/** Width of a zone label: short codes in bold capitals and digits, « 1AUh », « Npi ». */
function labelWidth(label, fontSize) {
  return label.length * fontSize * 0.68;
}

function within({ x, y, width, height }, image) {
  return x >= image.x && y >= image.y && x + width <= image.x + image.width && y + height <= image.y + image.height;
}

function ringsBox(rings) {
  return rings.flat().reduce((current, [x, y]) => mergeBoxes(current, box(x, y, 0, 0)), undefined);
}

function pixel(lon, lat, extent) {
  const [x, y] = lonLatToPixel(lon, lat, extent.zoom);
  return [x - extent.xMin, y - extent.yMin];
}

/** Bounds [lonMin, latMin, lonMax, latMax] of an extent, to ask a service for what the map shows. */
export function extentBbox(extent) {
  const worldSize = TILE_SIZE * 2 ** extent.zoom;
  const lon = (x) => (x / worldSize) * 360 - 180;
  const lat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) * 180) / Math.PI;
  return [lon(extent.xMin), lat(extent.yMax), lon(extent.xMax), lat(extent.yMin)];
}

function wfsUrl(typeName, parameters) {
  return `${WFS_URL}?${new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: typeName,
    OUTPUTFORMAT: 'application/json',
    ...parameters,
  })}`;
}

/**
 * JSON answered by the WFS. The Géoplateforme fails now and then under load (5xx): the request is made again,
 * after a pause. What still fails is said in words a town hall understands.
 */
async function requestWfs(url, { retryDelayMs = 1500 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await request(url);
      if (!response.ok) throw new HttpError(url, response.status);
      return await response.json();
    } catch (error) {
      if (attempt === ATTEMPTS) {
        throw new UrbanismError(
          `Le Géoportail de l’urbanisme ne répond pas (${error.message}) : relancez la génération plus tard, ` +
            'ou générez la carte sans le zonage du PLU.',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * retryDelayMs));
    }
  }
}

/** YYYYMMDD, as the service writes its dates, written YYYY-MM-DD. */
function isoDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text(value) ?? '');
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function text(value) {
  const written = value === undefined || value === null ? '' : String(value).trim();
  return written === '' ? undefined : written;
}
