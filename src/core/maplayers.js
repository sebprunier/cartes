// Catalog of layers that can be laid over a basemap: parcels, risk zones… A layer says where to find the
// image of a tile, so that the download, the cache and the retries written for the basemaps serve it too.

import { geoplateformeWmts } from './basemaps.js';

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
    description: 'Limites et numéros des parcelles, à partir du zoom 16.',
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
    id: 'ppr-inondation',
    name: 'PPR inondation',
    description: 'Zonage réglementaire des plans de prévention du risque inondation, à partir du zoom 13.',
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
    description: 'Zonage réglementaire des plans de prévention du risque mouvement de terrain, à partir du zoom 13.',
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

/**
 * The layers chosen, in the order of the catalog, rejecting the unknown ones. A choice is an identifier, or
 * an object `{ id, opacity }` when the opacity of the catalog is not the one wanted.
 */
export function chooseMapLayers(selection = []) {
  const chosen = selection.map((entry) => (typeof entry === 'string' ? { id: entry } : entry));
  const unknown = chosen.filter(({ id }) => !MAP_LAYERS[id]).map(({ id }) => id);
  if (unknown.length > 0) {
    throw new MapLayerError(
      `Couche inconnue : ${unknown.join(', ')}. Couches disponibles : ${Object.keys(MAP_LAYERS).join(', ')}.`,
    );
  }
  return MAP_LAYER_LIST.filter((layer) => chosen.some(({ id }) => id === layer.id)).map((layer) => {
    const { opacity } = chosen.find(({ id }) => id === layer.id);
    return opacity === undefined ? layer : { ...layer, opacity: checkOpacity(opacity, layer) };
  });
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

/** Whether a layer is laid down as tiles, downloaded and cached like a basemap. */
export function isTileLayer(layer) {
  return !isVectorLayer(layer) && !isWmsLayer(layer);
}

/**
 * Colors of a feature of a vector layer, from the property that carries its category, faded by the opacity of
 * the layer: a hazard drawn over a map must not hide it.
 */
export function vectorStyleOf(layer) {
  return (properties) => {
    const style = layer.styles[properties[layer.categoryProperty]];
    return style && { ...style, fillOpacity: layer.opacity };
  };
}

/**
 * Legend entries of a vector layer: one per level it draws. `drawn` limits them to the levels really present
 * on the map, a legend naming a level that is nowhere to be seen being misleading.
 */
export function mapLayerLegendEntries(layer, drawn) {
  return Object.entries(layer.styles ?? {})
    .filter(([name]) => !drawn || drawn.has(name))
    .map(([, style]) => ({ label: style.label, color: style.fill, shape: 'polygon' }));
}

/** What the layer does not show at this zoom level, or undefined when it shows everything. */
export function mapLayerZoomWarning(layer, zoom) {
  return zoom < layer.minZoom ? `${layer.name} : ${layer.zoomNote}` : undefined;
}

export class MapLayerError extends Error {}
