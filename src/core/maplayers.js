// Catalog of layers that can be laid over a basemap: parcels, risk zones… A layer says where to find the
// image of a tile, so that the download, the cache and the retries written for the basemaps serve it too.

import { geoplateformeWmts } from './basemaps.js';

// A layer is downloaded like a basemap: `tileUrl` builds the address of each of its tiles, and is the place
// to extend when a service needs something else than a template, a WMS asking for the bounds of each tile.
// `url` is a template with {z}, {x} and {y}, as for a basemap. `opacity` fades the layer over the map, the
// tiles carrying their own transparency. `minZoom` is the level from which the layer shows what it promises,
// and `zoomNote` says what is missing below it.
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
  },
];

export const MAP_LAYERS = Object.fromEntries(MAP_LAYER_LIST.map((layer) => [layer.id, layer]));

/** The layers chosen by their identifier, in the order of the catalog, rejecting unknown ones. */
export function chooseMapLayers(ids) {
  const unknown = ids.filter((id) => !MAP_LAYERS[id]);
  if (unknown.length > 0) {
    throw new MapLayerError(
      `Couche inconnue : ${unknown.join(', ')}. Couches disponibles : ${Object.keys(MAP_LAYERS).join(', ')}.`,
    );
  }
  return MAP_LAYER_LIST.filter((layer) => ids.includes(layer.id));
}

/** What the layer does not show at this zoom level, or undefined when it shows everything. */
export function mapLayerZoomWarning(layer, zoom) {
  return zoom < layer.minZoom ? `${layer.name} : ${layer.zoomNote}` : undefined;
}

export class MapLayerError extends Error {}
