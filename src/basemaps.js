// Catalog of tiled basemaps (Web Mercator projection, 256 px tiles).

function geoplateformeWmts(layer, imageFormat) {
  return (
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    `&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${imageFormat}` +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
  );
}

// The metadata id is the identifier of the dataset in the Géoplateforme catalog, to read its update date.
// The output format is PNG for maps (sharp lines and texts), and JPEG for photographs, which PNG compresses
// poorly: an aerial photograph weighs about 8 times more in PNG than in JPEG.
// The file size ratios are the size of a generated file divided by the total size of its tiles, in color or in
// grayscale, by output format. They were measured on Colombiers (86) at two zoom levels, to estimate file sizes.
const BASEMAP_LIST = [
  {
    id: 'plan-ign',
    name: 'Plan IGN v2 (Géoplateforme)',
    url: geoplateformeWmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
    maxZoom: 19,
    attribution: '© IGN – Plan IGN',
    metadataId: 'IGNF_PLAN-IGN',
    outputFormat: 'png',
    fileSizeRatios: { color: { png: 1, jpg: 0.6, tif: 1.4 }, grayscale: { png: 0.9, jpg: 0.55, tif: 0.9 } },
  },
  {
    id: 'ortho-ign',
    name: 'Photographies aériennes IGN (Géoplateforme)',
    url: geoplateformeWmts('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
    maxZoom: 19,
    attribution: '© IGN – BD ORTHO',
    metadataId: 'IGNF_BD-ORTHO',
    outputFormat: 'jpg',
    fileSizeRatios: { color: { png: 12, jpg: 1.65, tif: 9 }, grayscale: { png: 6, jpg: 1.5, tif: 6.4 } },
  },
];

export const BASEMAPS = Object.fromEntries(BASEMAP_LIST.map((basemap) => [basemap.id, basemap]));

export function tileUrl(basemap, z, x, y) {
  return basemap.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}
