// Catalog of tiled basemaps (Web Mercator projection, 256 px tiles).

import { requestJson } from './http.js';

function geoplateformeWmts(layer, imageFormat) {
  return (
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    `&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${imageFormat}` +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
  );
}

function esriService(name) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/${name}/MapServer`;
}

// Esri requires "Powered by Esri" and the data sources published in the metadata of each service.
// The attribution below is a copy of these sources, used when the metadata cannot be fetched.
const BASEMAP_LIST = [
  {
    id: 'plan-ign',
    name: 'Plan IGN v2 (Géoplateforme)',
    url: geoplateformeWmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
    maxZoom: 19,
    attribution: '© IGN – Plan IGN',
  },
  {
    id: 'ortho-ign',
    name: 'Photographies aériennes IGN (Géoplateforme)',
    url: geoplateformeWmts('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
    maxZoom: 19,
    attribution: '© IGN – BD ORTHO',
  },
  {
    id: 'esri-plan',
    name: 'Plan (Esri World Street Map)',
    url: `${esriService('World_Street_Map')}/tile/{z}/{y}/{x}`,
    maxZoom: 19,
    attribution:
      'Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, ' +
      'Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community',
    attributionService: esriService('World_Street_Map'),
    poweredBy: 'Powered by Esri',
  },
  {
    id: 'esri-satellite',
    name: 'Satellite (Esri World Imagery)',
    url: `${esriService('World_Imagery')}/tile/{z}/{y}/{x}`,
    maxZoom: 19,
    attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    attributionService: esriService('World_Imagery'),
    poweredBy: 'Powered by Esri',
  },
];

export const BASEMAPS = Object.fromEntries(BASEMAP_LIST.map((basemap) => [basemap.id, basemap]));

/**
 * Returns the basemap with an up to date attribution, read from the service metadata when the provider
 * publishes one (the data sources of Esri basemaps change over time). Keeps the catalog attribution otherwise.
 */
export async function withCurrentAttribution(basemap) {
  if (!basemap.attributionService) return basemap;
  try {
    const { copyrightText } = await requestJson(`${basemap.attributionService}?f=json`);
    if (copyrightText) return { ...basemap, attribution: copyrightText.replace(/^Sources?\s*:\s*/i, '') };
  } catch {
    // Metadata unavailable (network, service error): the catalog attribution is still valid enough.
  }
  return basemap;
}

export function tileUrl(basemap, z, x, y) {
  return basemap.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}
