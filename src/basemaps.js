// Catalog of tiled basemaps (Web Mercator projection, 256 px tiles).

function geoplateformeWmts(layer, imageFormat) {
  return (
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    `&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${imageFormat}` +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
  );
}

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
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Esri, HERE, Garmin, © contributeurs OpenStreetMap',
  },
  {
    id: 'esri-satellite',
    name: 'Satellite (Esri World Imagery)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
];

export const BASEMAPS = Object.fromEntries(BASEMAP_LIST.map((basemap) => [basemap.id, basemap]));

export function tileUrl(basemap, z, x, y) {
  return basemap.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}
