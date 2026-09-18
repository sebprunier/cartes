// Data layers added to a map: reading the files provided by the municipality (GeoJSON, CSV), and conversion
// of their features into shapes in image pixels, ready to be drawn by the platform.

import { lonLatToPixel } from './tiles.js';

// Colors given to the layers that do not carry their own, distinguishable once printed in grayscale.
const PALETTE = ['#0e4777', '#15814f', '#b3261e', '#7b3fb8', '#c2620a'];
const DEFAULT_FILL_OPACITY = 0.35;
// Properties holding the label of a feature, and the coordinates of a CSV row.
const LABEL_KEYS = ['nom', 'name', 'libelle', 'libellé', 'title', 'titre', 'label'];
const LATITUDE_KEYS = ['latitude', 'lat', 'y'];
const LONGITUDE_KEYS = ['longitude', 'lon', 'lng', 'long', 'x'];

export class LayerError extends Error {}

/**
 * Reads a layer from the content of a file. The format comes from the file name (.geojson, .json, .csv),
 * and the color is the one given, else the next one of the palette.
 */
export function readLayer(text, { fileName, color, index = 0 }) {
  const name = layerName(fileName);
  const layerColor = color ?? PALETTE[index % PALETTE.length];
  const features = /\.csv$/i.test(fileName) ? readCsv(text) : readGeoJson(text);
  if (features.length === 0) throw new LayerError(`Aucune donnée trouvée dans ${fileName}.`);
  return { name, color: layerColor, features };
}

/** Readable name of a layer, from its file name: « points-de-collecte.geojson » becomes « Points de collecte ». */
function layerName(fileName) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return withoutExtension.charAt(0).toUpperCase() + withoutExtension.slice(1);
}

/** Features of a GeoJSON file: FeatureCollection, Feature, or a bare geometry. */
function readGeoJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new LayerError(`Fichier GeoJSON illisible : ${error.message}`);
  }
  const collection =
    parsed.type === 'FeatureCollection'
      ? parsed.features
      : [parsed.type === 'Feature' ? parsed : { type: 'Feature', geometry: parsed, properties: {} }];
  if (!Array.isArray(collection)) throw new LayerError('Fichier GeoJSON sans liste d’objets.');

  return collection.flatMap((feature) => {
    const properties = feature?.properties ?? {};
    return geometries(feature?.geometry).map((geometry) => ({
      ...geometry,
      label: label(properties),
      style: style(properties),
    }));
  });
}

/** Normalized geometries of a GeoJSON geometry: points, lines and rings, in longitude/latitude. */
function geometries(geometry) {
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  switch (type) {
    case 'Point':
      return [{ shape: 'point', position: position(coordinates) }];
    case 'MultiPoint':
      return coordinates.map((point) => ({ shape: 'point', position: position(point) }));
    case 'LineString':
      return [{ shape: 'line', rings: [coordinates.map(position)] }];
    case 'MultiLineString':
      return coordinates.map((line) => ({ shape: 'line', rings: [line.map(position)] }));
    case 'Polygon':
      return [{ shape: 'polygon', rings: coordinates.map((ring) => ring.map(position)) }];
    case 'MultiPolygon':
      return coordinates.map((polygon) => ({ shape: 'polygon', rings: polygon.map((ring) => ring.map(position)) }));
    case 'GeometryCollection':
      return (geometry.geometries ?? []).flatMap(geometries);
    default:
      throw new LayerError(`Géométrie non gérée : ${type}.`);
  }
}

/** Checks a [longitude, latitude] pair, and explains the most common mistake. */
function position(coordinates) {
  const [lon, lat] = coordinates ?? [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new LayerError('Coordonnées manquantes ou illisibles.');
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    throw new LayerError(
      `Coordonnées hors des bornes attendues (${lon}, ${lat}) : le fichier est probablement projeté, ` +
        'par exemple en Lambert 93. Convertissez-le en longitude/latitude (WGS 84).',
    );
  }
  return [lon, lat];
}

/** Points of a CSV file, from its latitude and longitude columns. */
function readCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new LayerError('Fichier CSV vide ou sans ligne de données.');

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const latitudeColumn = headers.findIndex((header) => LATITUDE_KEYS.includes(header));
  const longitudeColumn = headers.findIndex((header) => LONGITUDE_KEYS.includes(header));
  if (latitudeColumn === -1 || longitudeColumn === -1) {
    throw new LayerError(
      `Colonnes de coordonnées introuvables dans le CSV : une colonne ${LATITUDE_KEYS.join(', ')} ` +
        `et une colonne ${LONGITUDE_KEYS.join(', ')} sont attendues.`,
    );
  }
  const labelColumn = headers.findIndex((header) => LABEL_KEYS.includes(header));

  return rows.slice(1).flatMap((row) => {
    if (row.every((value) => value.trim() === '')) return [];
    const lon = decimal(row[longitudeColumn]);
    const lat = decimal(row[latitudeColumn]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    const properties = Object.fromEntries(headers.map((header, column) => [header, row[column]]));
    return [
      {
        shape: 'point',
        position: position([lon, lat]),
        label: labelColumn === -1 ? undefined : row[labelColumn]?.trim() || undefined,
        style: style(properties),
      },
    ];
  });
}

/** Rows of a CSV file, with the separator guessed from its first line, and quoted fields supported. */
function parseCsv(text) {
  const content = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = content.slice(0, content.indexOf('\n') + 1 || undefined);
  const separator = [';', '\t', ','].find((candidate) => firstLine.includes(candidate)) ?? ',';

  const rows = [[]];
  let value = '';
  let quoted = false;
  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (quoted) {
      if (character !== '"') value += character;
      else if (content[index + 1] === '"') value += content[index++];
      else quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === separator) {
      rows.at(-1).push(value);
      value = '';
    } else if (character === '\n') {
      rows.at(-1).push(value);
      rows.push([]);
      value = '';
    } else value += character;
  }
  rows.at(-1).push(value);
  return rows.at(-1).every((last) => last === '') && rows.length > 1 ? rows.slice(0, -1) : rows;
}

/** Number written with a dot or a comma as decimal separator; an empty cell is not a zero. */
function decimal(value) {
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  return text === '' ? Number.NaN : Number(text);
}

function label(properties) {
  const key = Object.keys(properties).find((property) => LABEL_KEYS.includes(property.toLowerCase()));
  const value = key === undefined ? undefined : properties[key];
  return value === undefined || value === null || value === '' ? undefined : String(value);
}

/** Style of a feature, following the convention used by uMap and geojson.io. */
function style(properties) {
  return {
    color: properties['marker-color'] ?? properties.stroke ?? undefined,
    fill: properties.fill ?? undefined,
    fillOpacity: Number.isFinite(Number(properties['fill-opacity'])) ? Number(properties['fill-opacity']) : undefined,
    strokeWidth: Number.isFinite(Number(properties['stroke-width'])) ? Number(properties['stroke-width']) : undefined,
    size: properties['marker-size'] ?? undefined,
  };
}

/** Data source describing the layers added by the user, for the attribution of the map. */
export function layersSource(layers) {
  if (layers.length === 0) return undefined;
  return { attribution: `Données ajoutées : ${layers.map((layer) => layer.name).join(', ')}` };
}

/**
 * Legend entries of the layers: their name, their color and the shape that represents them best.
 * Layers whose features are all outside the extent are left out, as nothing is drawn for them.
 */
export function legendEntries(layers, extent) {
  return layers
    .filter((layer) => {
      const { points, paths } = layerShapes(layer, extent);
      return points.length > 0 || paths.length > 0;
    })
    .map((layer) => ({ label: layer.name, color: layer.color, shape: dominantShape(layer) }));
}

function dominantShape(layer) {
  const counts = { point: 0, line: 0, polygon: 0 };
  for (const feature of layer.features) counts[feature.shape]++;
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0];
}

/**
 * Shapes of a layer in image pixels: points with their label, and paths as SVG path data, usable by an SVG
 * overlay as well as by a canvas (Path2D). Features outside the extent are left out.
 */
export function layerShapes(layer, extent) {
  const scale = Math.max(extent.width, extent.height);
  const strokeWidth = Math.max(2, Math.round(scale / 1200));
  const radius = Math.max(4, Math.round(scale / 400));
  const points = [];
  const paths = [];

  for (const feature of layer.features) {
    const color = feature.style.color ?? layer.color;
    if (feature.shape === 'point') {
      const [x, y] = pixel(feature.position, extent);
      if (!inside(x, y, extent, radius)) continue;
      points.push({ x, y, radius: radius * sizeFactor(feature.style.size), color, label: feature.label });
      continue;
    }
    const rings = feature.rings.map((ring) => ring.map((lonLat) => pixel(lonLat, extent)));
    if (!rings.some((ring) => ring.some(([x, y]) => inside(x, y, extent, scale / 10)))) continue;
    paths.push({
      path: pathData(rings, feature.shape === 'polygon'),
      color,
      strokeWidth: feature.style.strokeWidth ?? strokeWidth,
      fill: feature.shape === 'polygon' ? (feature.style.fill ?? color) : undefined,
      fillOpacity: feature.style.fillOpacity ?? DEFAULT_FILL_OPACITY,
    });
  }
  return { points, paths, radius, strokeWidth };
}

function pixel([lon, lat], extent) {
  const [x, y] = lonLatToPixel(lon, lat, extent.zoom);
  return [x - extent.xMin, y - extent.yMin];
}

/** Whether a point is in the image, with a margin to keep what is drawn across the border. */
function inside(x, y, extent, margin) {
  return x >= -margin && y >= -margin && x <= extent.width + margin && y <= extent.height + margin;
}

function sizeFactor(size) {
  return { small: 0.7, medium: 1, large: 1.5 }[size] ?? 1;
}

function pathData(rings, closed) {
  return rings
    .map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`)
    .join('');
}
