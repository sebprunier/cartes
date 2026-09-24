// Catalog of layers that can be laid over a basemap: parcels, risk zones… A layer says where to find the
// image of a tile, so that the download, the cache and the retries written for the basemaps serve it too.

import { geoplateformeWmts, tileUrl } from './basemaps.js';
import { requestBytes } from './http.js';
import { TILE_SIZE, lonLatToPixel } from './tiles.js';

// Themes the catalog is sorted into, in the order they are offered. They are named for a town hall, not for the
// services: a PPR and the clays are both a risk, whoever publishes them. The order is that of the list
// only; the layers are still laid on the map in the order of the catalog.
export const MAP_LAYER_THEMES = [
  { id: 'urbanisme', name: 'Foncier et urbanisme' },
  { id: 'risques', name: 'Risques' },
  { id: 'territoire', name: 'Territoire et environnement' },
];

// `theme` is one of MAP_LAYER_THEMES, and `provider` the short name of who publishes the layer, where
// `attribution` is the full mention written on the map.
// A layer is downloaded like a basemap: `tileUrl` builds the address of each of its tiles, and is the place
// to extend when a service needs something else than a template, a WMS asking for the bounds of each tile.
// `url` is a template with {z}, {x} and {y}, as for a basemap. `opacity` fades the layer over the map, the
// tiles carrying their own transparency. `minZoom`, when a layer has one, is the level from which it shows
// what it promises, and `zoomNote` says what is missing below it.
// `dataMaxZoom` caps the resolution asked for: above it the drawing is stretched, which spares a service and
// suits data that has no more detail to give — and, for some services, keeps them drawing at all.
const MAP_LAYER_LIST = [
  {
    id: 'cadastre',
    name: 'Parcelles cadastrales',
    description: 'Limites et numéros des parcelles.',
    theme: 'urbanisme',
    provider: 'IGN',
    url: geoplateformeWmts('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'image/png'),
    minZoom: 16,
    maxZoom: 19,
    zoomNote: 'En dessous du zoom 16, seules les limites et les numéros de sections apparaissent, sans les parcelles.',
    opacity: 0.6,
    attribution: '© IGN – Parcellaire Express (PCI)',
    metadataId: 'IGNF_PARCELLAIRE-EXPRESS-PCI',
    // What the layer adds to the file, divided by the size of its tiles. Measured on Colombiers at zoom 16,
    // where a layer weighs the most; at lower zoom levels it draws less, and the estimate errs on the high side.
    fileSizeRatios: {
      color: { png: 0.75, pngPalette: 0.3, jpg: 0.3, tif: 1.1 },
      grayscale: { png: 0.8, pngPalette: 0.3, jpg: 0.35, tif: 1.35 },
    },
  },
  {
    id: 'plu',
    name: 'Zonage du PLU',
    description:
      'Zones urbaines, à urbaniser, agricoles et naturelles du document d’urbanisme en vigueur : PLU, PLU ' +
      'intercommunal ou carte communale.',
    theme: 'urbanisme',
    provider: 'Géoportail de l’urbanisme',
    kind: 'urbanism',
    maxZoom: 19,
    opacity: 0.45,
    // Completed on each map with the document and the day it was approved (see urbanPlanSource).
    attribution: 'Géoportail de l’urbanisme',
    // The colors a PLU is usually printed in, in increasing luminance: 96 for U, 129 for N, 159 for AUc, 195 for
    // AUs and 232 for A. Laid at 45 % over white, they keep only about 15 levels apart (183 to 245): printed in
    // grayscale, the label of each zone is what tells them apart. A carte communale reuses them.
    styles: {
      U: { fill: '#d7301f', label: 'Zone urbaine (U)' },
      AUc: { fill: '#f08c2e', label: 'Zone à urbaniser, ouverte (AU)' },
      AUs: { fill: '#f7b38d', label: 'Zone à urbaniser, fermée (AU)' },
      A: { fill: '#fff27a', label: 'Zone agricole (A)' },
      N: { fill: '#43a857', label: 'Zone naturelle et forestière (N)' },
      'CC-constructible': { fill: '#d7301f', label: 'Secteur constructible' },
      'CC-activites': { fill: '#f08c2e', label: 'Secteur réservé aux activités' },
      'CC-non-constructible': { fill: '#fff27a', label: 'Secteur non constructible' },
    },
    // No weight ratio, as for the clays: a wash of translucent color flattens the image rather than weighing on it.
  },
  {
    id: 'ppr-inondation',
    name: 'PPR inondation',
    description: 'Zonage réglementaire des plans de prévention du risque inondation.',
    theme: 'risques',
    provider: 'Géorisques',
    kind: 'wms',
    url: 'https://mapsref.brgm.fr/wxs/georisques/risques',
    wmsLayers: 'PPRN_ZONE_INOND',
    wmsStyle: 'inspire_common:DEFAULT',
    dataMaxZoom: 16,
    minZoom: 13,
    maxZoom: 19,
    zoomNote: 'En dessous du zoom 13, le service ne dessine pas ce zonage.',
    opacity: 0.55,
    attribution: '© BRGM – Géorisques, PPR inondation',
    // The service publishes no update date: the map credits the day the zoning was read instead.
    datedByConsultation: true,
  },
  {
    id: 'ppr-mouvements',
    name: 'PPR mouvements de terrain',
    description: 'Zonage réglementaire des plans de prévention du risque mouvement de terrain.',
    theme: 'risques',
    provider: 'Géorisques',
    kind: 'wms',
    url: 'https://mapsref.brgm.fr/wxs/georisques/risques',
    wmsLayers: 'PPRN_ZONE_MVT',
    wmsStyle: 'inspire_common:DEFAULT',
    dataMaxZoom: 16,
    minZoom: 13,
    maxZoom: 19,
    zoomNote: 'En dessous du zoom 13, le service ne dessine pas ce zonage.',
    opacity: 0.55,
    attribution: '© BRGM – Géorisques, PPR mouvements de terrain',
    datedByConsultation: true,
  },
  {
    id: 'cavites',
    name: 'Cavités souterraines',
    description: 'Carrières, caves et ouvrages souterrains abandonnés, d’origine non minière.',
    theme: 'risques',
    provider: 'Géorisques',
    kind: 'wms',
    url: 'https://mapsref.brgm.fr/wxs/georisques/risques',
    wmsLayers: 'CAVITE_LOCALISEE',
    wmsStyle: 'inspire_common:DEFAULT',
    // The service stops drawing this layer when zoomed past 1:2000: the image is asked for at zoom 17, where
    // the scale is still large enough, and drawn bigger if needed.
    dataMaxZoom: 17,
    maxZoom: 19,
    opacity: 0.9,
    attribution: '© BRGM – Géorisques, cavités souterraines',
    datedByConsultation: true,
  },
  {
    id: 'canalisations',
    name: 'Canalisations de matières dangereuses',
    description: 'Canalisations de transport de gaz, d’hydrocarbures et de produits chimiques, et leurs servitudes.',
    theme: 'risques',
    provider: 'Géorisques',
    kind: 'wms',
    url: 'https://mapsref.brgm.fr/wxs/georisques/risques',
    wmsLayers: 'CANALISATIONS',
    wmsStyle: 'default',
    // Nothing is drawn below 1:20000: the image is always asked for at zoom 14, then drawn larger, which
    // thickens the lines at the highest zoom levels.
    dataMaxZoom: 14,
    maxZoom: 19,
    opacity: 0.9,
    attribution: '© BRGM – Géorisques, canalisations de matières dangereuses',
    datedByConsultation: true,
  },
  {
    id: 'argiles',
    name: 'Retrait-gonflement des argiles',
    description: 'Aléa de retrait-gonflement des argiles, millésime 2026, par niveau.',
    theme: 'risques',
    provider: 'BRGM',
    kind: 'vector',
    url: 'https://static.data.gouv.fr/resources/carte-des-risques-retrait-gonflement-des-argiles-2026/20260401-081931/argile-2026.pmtiles',
    dataMaxZoom: 12,
    minZoom: 4,
    maxZoom: 19,
    zoomNote: 'La donnée s’arrête au zoom 12 : au-delà, les mêmes contours sont dessinés en plus grand, nets mais pas plus précis.',
    opacity: 0.45,
    attribution: '© BRGM – Retrait-gonflement des argiles 2026, via la DINUM',
    updateDate: '2026-04-01',
    // The level of hazard, whose colors stay distinct once printed in grayscale (luminance 213, 161 and 96).
    // Zones are filled without an outline: a tile cuts the shapes it holds, and an outline would draw the cut.
    categoryProperty: 'ALEA',
    styles: {
      Faible: { fill: '#f7d774', label: 'Aléa faible' },
      Moyen: { fill: '#e8913c', label: 'Aléa moyen' },
      Fort: { fill: '#c0392b', label: 'Aléa fort' },
    },
    // No weight ratio: a layer drawn as a wash of translucent color does not add to the file, it flattens the
    // image and makes it compress slightly better. Measured on Colombiers: −7 % in PNG, −16 % in JPEG.
  },
];

export const MAP_LAYERS = Object.fromEntries(MAP_LAYER_LIST.map((layer) => [layer.id, layer]));

/** Layers sorted into their themes, in the order of MAP_LAYER_THEMES and of the list given; empty themes left out. */
export function mapLayersByTheme(layers) {
  return MAP_LAYER_THEMES.map((theme) => ({ theme, layers: layers.filter((layer) => layer.theme === theme.id) })).filter(
    ({ layers: inTheme }) => inTheme.length > 0,
  );
}

// Properties holding, in the tiles of a layer added by the user, the label of a feature and its color. The
// names are those of the data files the tool already reads, a service that publishes tiles and a municipality
// that exports a GeoJSON naming the same things the same way.
const CUSTOM_CATEGORY_KEYS = ['label', 'libelle', 'libellé', 'categorie', 'catégorie', 'category', 'classe', 'niveau'];
const CUSTOM_COLOR_KEYS = ['color', 'couleur', 'fill'];
// The tiles of a vector layer, which we draw ourselves, rather than images laid down as they come.
const VECTOR_TILE_PATH = /\.(pbf|mvt)$/i;
const DEFAULT_CUSTOM_COLOR = '#0e4777';

/**
 * The layers chosen, in the order of the catalog, rejecting the unknown ones. A choice is an identifier, or
 * an object `{ id, opacity }` when the opacity of the catalog is not the one wanted. A choice carrying a
 * `url` describes a layer of its own, added by whoever generates the map, and comes after those of the catalog.
 */
export function chooseMapLayers(selection = []) {
  const chosen = selection.map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
  const [custom, fromCatalog] = partition(chosen, (entry) => Boolean(entry.url));

  const unknown = fromCatalog.filter(({ id }) => !MAP_LAYERS[id]).map(({ id }) => id);
  if (unknown.length > 0) {
    throw new MapLayerError(
      `Couche inconnue : ${unknown.join(', ')}. Couches disponibles : ${Object.keys(MAP_LAYERS).join(', ')}.`,
    );
  }
  const catalog = MAP_LAYER_LIST.filter((layer) => fromCatalog.some(({ id }) => id === layer.id)).map((layer) => {
    const { opacity } = fromCatalog.find(({ id }) => id === layer.id);
    return opacity === undefined ? layer : { ...layer, opacity: checkOpacity(opacity, layer) };
  });
  return [...catalog, ...custom.map(customMapLayer)];
}

function partition(items, matches) {
  return [items.filter(matches), items.filter((item) => !matches(item))];
}

/**
 * A layer described by whoever generates the map, from the address of its tiles, rather than taken from the
 * catalog. The catalog describes layers we have checked one by one; here everything is claimed by the person
 * adding it, so everything is verified before a single tile travels.
 *
 * `url` is a template in {z}/{x}/{y}, serving either images or vector tiles — which the tool draws itself,
 * from the colors the tiles carry. `name` is what the interface shows, and `attribution` what the map credits:
 * it is required, because a layer whose source is not cited has no place on a map that is handed around.
 */
export function customMapLayer(definition = {}) {
  const url = String(definition.url ?? '').trim();
  const name = String(definition.name ?? '').trim();
  const attribution = String(definition.attribution ?? '').trim();

  const missing = ['{z}', '{x}', '{y}'].filter((placeholder) => !url.includes(placeholder));
  if (missing.length > 0) {
    throw new MapLayerError(
      `Adresse de couche incomplète : il y manque ${missing.join(', ')}. Attendu un gabarit qui désigne une ` +
        'tuile, par exemple https://exemple.fr/tuiles/{z}/{x}/{y}.png.',
    );
  }
  const address = parseTemplate(url);
  if (!name) throw new MapLayerError(`Nom de couche manquant pour ${url} : c’est ce que l’interface affichera.`);
  if (!attribution) {
    throw new MapLayerError(
      `Source manquante pour la couche « ${name} » : elle est écrite sur la carte, à côté de celles de l’IGN. ` +
        'La plupart des licences l’imposent, et une carte qui circule sans ses sources ne vaut rien.',
    );
  }

  return {
    id: definition.id || customId(name),
    name,
    description: definition.description?.trim() || `Couche ajoutée, servie par ${address.host}.`,
    provider: address.host,
    kind: VECTOR_TILE_PATH.test(address.pathname) ? 'vector' : 'tiles',
    url,
    custom: true,
    opacity: checkOpacity(definition.opacity ?? 0.6, { id: definition.id || name }),
    attribution,
    color: definition.color || DEFAULT_CUSTOM_COLOR,
    categoryProperty: definition.categoryProperty,
    colorProperty: definition.colorProperty,
    // Nothing tells where the data of a template stops: a service answers an empty tile past its own detail.
    // The check made when the layer is added finds it, and it can also be given outright.
    dataMaxZoom: numberOrUndefined(definition.dataMaxZoom, 'zoom maximal', name),
    maxZoom: 19,
    // The map credits the day the layer was read: a service reachable by its address alone says no more.
    datedByConsultation: true,
  };
}

/** The address of a tile of the template, checked as a whole rather than trusted placeholder by placeholder. */
function parseTemplate(url) {
  let address;
  try {
    address = new URL(tileUrl({ url }, 0, 0, 0));
  } catch {
    throw new MapLayerError(`Adresse de couche invalide : ${url}.`);
  }
  if (address.protocol !== 'https:' && address.protocol !== 'http:') {
    throw new MapLayerError(`Adresse de couche invalide : ${url}. Attendu une adresse en https.`);
  }
  return address;
}

function numberOrUndefined(value, what, name) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 24) {
    throw new MapLayerError(`${what} invalide pour la couche « ${name} » : ${value}. Attendu un zoom de 0 à 24.`);
  }
  return number;
}

/** An identifier drawn from the name, so that the same layer added twice stays the same layer. */
function customId(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `perso-${slug || 'couche'}`;
}

/** Whether a layer was added by whoever generates the map, rather than taken from the catalog. */
export function isCustomLayer(layer) {
  return Boolean(layer?.custom);
}

// How far down the probe goes looking for data: below this, a tile covers a whole region and a layer that
// still says nothing says nothing at all.
const LOWEST_PROBE_ZOOM = 8;

/**
 * Tries the address of a layer on a single tile, over the municipality being mapped, before three hundred of
 * them are asked for: a mistyped address, or a service closed to us, must say so at once rather than after a
 * long download.
 *
 * An answer that holds nothing is not a failure — a layer is legitimately empty over part of a territory, and
 * a service answers an empty tile past its own detail. So the check walks down a few levels before saying the
 * layer shows nothing here, and it never concludes anything about where the data stops: one tile cannot.
 */
export async function checkMapLayer(layer, { lon, lat, zoom }, { fetchBytes = requestBytes } = {}) {
  const lowest = Math.min(zoom, LOWEST_PROBE_ZOOM);
  let answered = false;
  for (let probe = zoom; probe >= lowest; probe--) {
    const [x, y] = lonLatToPixel(lon, lat, probe);
    const url = tileUrl(layer, probe, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
    let bytes;
    try {
      bytes = await fetchBytes(url);
    } catch (error) {
      throw new MapLayerError(
        `La couche « ${layer.name} » n’a pas répondu : ${error.message}. Vérifiez l’adresse, et que le service ` +
          'est bien ouvert à tous.',
      );
    }
    if (bytes?.length) return { empty: false, missing: false };
    // `null` is a service that does not know this tile at all, where an empty answer is one that knows it and
    // has nothing to put in it.
    if (bytes !== null) answered = true;
  }
  return { empty: true, missing: !answered };
}

/** An opacity is a share of 1: 1 hides the basemap, and 0 would draw nothing at all. */
function checkOpacity(value, layer) {
  const opacity = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) {
    throw new MapLayerError(
      `Opacité invalide pour la couche ${layer.id} : ${value}. Attendu : un nombre supérieur à 0 et au plus 1, ` +
        'par exemple 0.6.',
    );
  }
  return opacity;
}

/** Whether a layer is drawn by us, from vector tiles, rather than laid down as ready-made images. */
export function isVectorLayer(layer) {
  return layer.kind === 'vector';
}

/** Whether a layer comes from a service that draws the area asked for, instead of serving ready-made tiles. */
export function isWmsLayer(layer) {
  return layer.kind === 'wms';
}

/** Whether a layer is the zoning of the planning documents, read as data for the municipality of the map. */
export function isUrbanismLayer(layer) {
  return layer.kind === 'urbanism';
}

/** Whether a layer is laid down as tiles, downloaded and cached like a basemap. */
export function isTileLayer(layer) {
  return !isVectorLayer(layer) && !isWmsLayer(layer) && !isUrbanismLayer(layer);
}

/**
 * Colors of a feature of a vector layer, from the property that carries its category, faded by the opacity of
 * the layer: a hazard drawn over a map must not hide it.
 */
export function vectorStyleOf(layer) {
  if (layer.styles) {
    return (properties) => {
      const style = layer.styles[properties[layer.categoryProperty]];
      return style && { ...style, fillOpacity: layer.opacity };
    };
  }
  // A layer added by the user comes with no style table: its tiles say, feature by feature, what to draw. A
  // service that publishes its own colors has already made them readable together, which we cannot guess.
  return (properties) => ({
    fill: text(propertyOf(properties, layer.colorProperty, CUSTOM_COLOR_KEYS)) ?? layer.color,
    fillOpacity: layer.opacity,
  });
}

/** The category of a feature of a vector layer, which gives it its line in the legend. */
export function vectorCategoryOf(layer) {
  if (layer.styles) return (properties) => properties[layer.categoryProperty];
  return (properties) => text(propertyOf(properties, layer.categoryProperty, CUSTOM_CATEGORY_KEYS));
}

/** The property asked for, if the tiles carry it, else the first usual name found among the properties. */
function propertyOf(properties, asked, usualNames) {
  if (asked) return properties[asked];
  const found = Object.keys(properties).find((name) => usualNames.includes(name.toLowerCase()));
  return found === undefined ? undefined : properties[found];
}

function text(value) {
  const written = value === undefined || value === null ? '' : String(value).trim();
  return written === '' ? undefined : written;
}

/**
 * Legend entries of a vector layer: one per level it draws. `drawn` limits them to the levels really present
 * on the map, a legend naming a level that is nowhere to be seen being misleading.
 */
export function mapLayerLegendEntries(layer, drawn) {
  if (layer.styles) {
    return Object.entries(layer.styles)
      .filter(([name]) => !drawn || drawn.has(name))
      .map(([, style]) => ({ label: style.label, color: style.fill, shape: 'polygon' }));
  }
  // A layer added by the user has no list of levels to draw from: its legend is what its tiles hold. When they
  // name nothing, the layer gets a single line under its own name, which is still better than no legend.
  const named = [...(drawn ?? [])].filter(([label]) => label !== undefined);
  if (named.length === 0) return [{ label: layer.name, color: layer.color, shape: 'polygon' }];
  return named.map(([label, color]) => ({ label, color: color ?? layer.color, shape: 'polygon' }));
}

/** What the layer does not show at this zoom level, or undefined when it shows everything. */
export function mapLayerZoomWarning(layer, zoom) {
  return zoom < layer.minZoom ? `${layer.name} : ${layer.zoomNote}` : undefined;
}

export class MapLayerError extends Error {}
