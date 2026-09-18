// Data layers added to a map: reading the files provided by the municipality (GeoJSON, CSV), and conversion
// of their features into shapes in image pixels, ready to be drawn by the platform.

import { lonLatToPixel } from './tiles.js';

// Colors given to the layers that do not carry their own, distinguishable once printed in grayscale.
const PALETTE = ['#0e4777', '#15814f', '#b3261e', '#7b3fb8', '#c2620a'];
const DEFAULT_FILL_OPACITY = 0.35;
// Properties holding the label of a feature, its category, its color, and the coordinates of a CSV row.
const LABEL_KEYS = ['nom', 'name', 'libelle', 'libellé', 'title', 'titre', 'label'];
const CATEGORY_KEYS = ['categorie', 'catégorie', 'category', 'type', 'groupe', 'group'];
const COLOR_KEYS = ['couleur', 'color'];
const LATITUDE_KEYS = ['latitude', 'lat', 'y'];
const LONGITUDE_KEYS = ['longitude', 'lon', 'lng', 'long', 'x'];

export class LayerError extends Error {}

/**
 * Reads a layer from the content of a file. The format comes from the file name (.geojson, .json, .csv), and
 * its name from `name`, else from the file name: it titles the legend and appears in the sources mention.
 * Features are grouped by their category property, which gives one legend entry and one color per category;
 * `categoryProperty` and `colorProperty` choose these properties, otherwise the usual names are looked up.
 */
export function readLayer(text, { fileName, name, color, index = 0, categoryProperty, colorProperty } = {}) {
  const features = /\.csv$/i.test(fileName) ? readCsv(text) : readGeoJson(text);
  if (features.length === 0) throw new LayerError(`Aucune donnée trouvée dans ${fileName}.`);

  const properties = [...new Set(features.flatMap((feature) => Object.keys(feature.properties)))];
  const layer = {
    name: name?.trim() || layerName(fileName),
    color: color ?? PALETTE[index % PALETTE.length],
    features,
    properties,
    categoryProperty: choose(categoryProperty, properties, CATEGORY_KEYS, 'de catégorie'),
    colorProperty: choose(colorProperty, properties, COLOR_KEYS, 'de couleur'),
  };
  return applyProperties(layer, index);
}

/** The property asked for, if the file has it, else the first usual name found among the properties. */
function choose(asked, properties, usualNames, what) {
  if (!asked) return properties.find((property) => usualNames.includes(property.toLowerCase()));
  const found = properties.find((property) => property.toLowerCase() === asked.toLowerCase());
  if (!found) {
    throw new LayerError(
      `Propriété ${what} introuvable : ${asked}. ` +
        `Propriétés disponibles : ${properties.length === 0 ? 'aucune' : properties.join(', ')}.`,
    );
  }
  return found;
}

/**
 * Gives each feature its category and its color: the one written in the file when there is one, otherwise a
 * color of the palette per category, so that a legend entry and its features always match.
 */
export function applyProperties(layer, index = 0) {
  const categories = [];
  for (const feature of layer.features) {
    const category = layer.categoryProperty ? text(feature.properties[layer.categoryProperty]) : undefined;
    feature.category = category;
    if (category && !categories.includes(category)) categories.push(category);
  }

  const offset = index % PALETTE.length;
  const colors = new Map(
    categories.map((category, position) => [category, PALETTE[(offset + position) % PALETTE.length]]),
  );
  for (const feature of layer.features) {
    // A color written in the file, whatever the convention, is kept: the palette only fills the gaps.
    const written = layer.colorProperty ? text(feature.properties[layer.colorProperty]) : undefined;
    feature.color = written ?? feature.style.color ?? feature.style.fill ?? colors.get(feature.category) ?? layer.color;
  }
  // The legend shows, for each category, the color of its features, whether it is written or taken from the palette.
  return {
    ...layer,
    categories: categories.map((category) => ({
      name: category,
      color: layer.features.find((feature) => feature.category === category).color,
    })),
  };
}

function text(value) {
  return value === undefined || value === null || value === '' ? undefined : String(value).trim() || undefined;
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
      properties,
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
        properties,
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

// Above this number of features, drawing slows down noticeably: the overlay of a layer is drawn again for
// each 4096 px block of the image, and a map at zoom 19 has dozens of blocks. Measured on a layer of points:
// at zoom 17, 5 000 features take about 9 seconds to draw, against 1 second for 200.
export const LARGE_LAYER_FEATURES = 2000;

/** Warning about a layer heavy enough to slow the drawing down, or undefined when it is small enough. */
export function layerWarning(layer) {
  const count = layer.features.length;
  if (count < LARGE_LAYER_FEATURES) return undefined;
  return (
    `${count.toLocaleString('fr-FR')} objets : le dessin de la carte peut prendre plusieurs dizaines de ` +
    'secondes aux niveaux de zoom les plus élevés, et beaucoup d’étiquettes ne trouveront pas de place.'
  );
}

/** Data source describing the layers added by the user, for the attribution of the map. */
export function layersSource(layers) {
  if (layers.length === 0) return undefined;
  return { attribution: `Données ajoutées : ${layers.map((layer) => layer.name).join(', ')}` };
}

/**
 * Legend entries of the layers: one per category when the features carry one, otherwise one per layer, with
 * the color drawn for it and the shape that represents it best. What is outside the extent is left out, as
 * nothing is drawn for it.
 */
export function legendEntries(layers, extent) {
  return layers.flatMap((layer) => {
    const drawn = layerShapes(layer, extent).features;
    if (drawn.length === 0) return [];
    if ((layer.categories ?? []).length === 0) {
      return [{ label: layer.name, color: layer.color, shape: dominantShape(drawn) }];
    }
    return layer.categories.flatMap(({ name, color }) => {
      const features = drawn.filter((feature) => feature.category === name);
      return features.length === 0 ? [] : [{ label: name, color, shape: dominantShape(features) }];
    });
  });
}

/**
 * Title of the legend: the name of the layer when a single file is added and its entries are its categories,
 * otherwise a plain word, as the entries then come from several files.
 */
export function legendTitle(layers) {
  const [layer, ...others] = layers;
  return others.length === 0 && (layer?.categories ?? []).length > 0 ? layer.name : 'Légende';
}

function dominantShape(features) {
  const counts = { point: 0, line: 0, polygon: 0 };
  for (const feature of features) counts[feature.shape]++;
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0];
}

/**
 * Shapes of several layers, with the labels of all of them placed in a single pass: two files drawn on the
 * same map must not write over each other. The order of the layers gives the priority.
 */
export function layersShapes(layers, extent) {
  const shapes = layers.map((layer) => layerShapes(layer, extent));
  placeLabels(
    shapes.flatMap(({ points }) => points),
    extent,
    labelFontSize(extent),
  );
  return shapes;
}

/**
 * Shapes of a layer in image pixels: points with their label, and paths as SVG path data, usable by an SVG
 * overlay as well as by a canvas (Path2D). Features outside the extent are left out. The labels are placed by
 * `layersShapes`, which sees every layer at once.
 */
export function layerShapes(layer, extent) {
  const scale = Math.max(extent.width, extent.height);
  const strokeWidth = Math.max(2, Math.round(scale / 1200));
  const radius = Math.max(4, Math.round(scale / 400));
  const fontSize = labelFontSize(extent);
  const points = [];
  const paths = [];
  const drawn = [];

  for (const feature of layer.features) {
    const color = feature.color ?? layer.color;
    if (feature.shape === 'point') {
      const [x, y] = pixel(feature.position, extent);
      if (!inside(x, y, extent, radius)) continue;
      points.push({ x, y, radius: radius * sizeFactor(feature.style.size), color, label: feature.label });
      drawn.push(feature);
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
    drawn.push(feature);
  }
  return { points, paths, features: drawn, radius, strokeWidth, fontSize };
}

/** Size of the labels, which follows the size of the image, as the symbols and the attribution do. */
function labelFontSize(extent) {
  return Math.max(11, Math.round(Math.max(4, Math.round(Math.max(extent.width, extent.height) / 400)) * 1.6));
}

/**
 * Places the label of each point beside its symbol, trying a few positions around it, and drops the labels
 * that would overlap another label or symbol: two labels written on top of each other are unreadable, while
 * a point without its label stays understandable thanks to the legend.
 */
function placeLabels(points, extent, fontSize) {
  const gap = Math.max(2, Math.round(fontSize / 5));
  // The symbols are obstacles from the start: a label never covers a point.
  const taken = points.map(({ x, y, radius }) => box(x - radius, y - radius, 2 * radius, 2 * radius));

  for (const point of points) {
    if (!point.label) continue;
    const width = textWidth(point.label, fontSize);
    const placement = placements(point, width, fontSize, gap).find(
      (candidate) => within(candidate.box, extent) && !taken.some((other) => overlap(candidate.box, other)),
    );
    if (!placement) {
      point.label = undefined;
      continue;
    }
    point.labelX = placement.x;
    point.labelY = placement.y;
    point.labelAlign = placement.align;
    taken.push(placement.box);
  }
}

/** Positions tried for a label, from the most readable to the least: beside the point, then above or below. */
function placements({ x, y, radius }, width, fontSize, gap) {
  const beside = radius * 1.5;
  const baseline = fontSize / 3;
  return [
    { x: x + beside, y: y + baseline, align: 'start' },
    { x: x - beside, y: y + baseline, align: 'end' },
    { x, y: y - radius - gap, align: 'middle' },
    { x, y: y + radius + gap + fontSize * 0.8, align: 'middle' },
    { x: x + beside, y: y - radius - gap, align: 'start' },
    { x: x - beside, y: y + radius + gap + fontSize * 0.8, align: 'end' },
  ].map((placement) => ({ ...placement, box: labelBox(placement, width, fontSize, gap) }));
}

/** Area covered by a label drawn at a baseline, widened by the gap kept between two labels. */
function labelBox({ x, y, align }, width, fontSize, gap) {
  const left = align === 'start' ? x : align === 'end' ? x - width : x - width / 2;
  return box(left - gap, y - fontSize * 0.8 - gap / 2, width + 2 * gap, fontSize * 1.05 + gap);
}

function box(x, y, width, height) {
  return { x, y, width, height };
}

function overlap(one, other) {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  );
}

function within({ x, y, width, height }, extent) {
  return x >= 0 && y >= 0 && x + width <= extent.width && y + height <= extent.height;
}

// Width of a character, as a fraction of the font size: enough to keep labels apart, whatever the font used.
const NARROW_CHARACTERS = 'ijltfI.,:;!|\'’"()[]{}-–';
const WIDE_CHARACTERS = 'mwMW@%';

/** Estimated width of a text, the platforms measuring it differently once the map is drawn. */
function textWidth(text, fontSize) {
  let width = 0;
  for (const character of text) {
    if (character === ' ') width += 0.28;
    else if (NARROW_CHARACTERS.includes(character)) width += 0.34;
    else if (WIDE_CHARACTERS.includes(character)) width += 0.92;
    else if (/\p{Lu}/u.test(character)) width += 0.68;
    else width += 0.55;
  }
  return width * fontSize;
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
