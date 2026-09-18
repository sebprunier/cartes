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
// `pngPalette` is the ratio of a PNG written with a 256 color palette, which the command line and the desktop
// application use for maps: it halves the file, and stays lighter than a JPEG without softening the labels.
const BASEMAP_LIST = [
  {
    id: 'plan-ign',
    name: 'Plan IGN v2 (Géoplateforme)',
    url: geoplateformeWmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
    maxZoom: 19,
    attribution: '© IGN – Plan IGN',
    metadataId: 'IGNF_PLAN-IGN',
    outputFormat: 'png',
    fileSizeRatios: {
      color: { png: 1, pngPalette: 0.45, jpg: 0.6, tif: 1.4 },
      grayscale: { png: 0.9, pngPalette: 0.45, jpg: 0.55, tif: 0.9 },
    },
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

/**
 * Whether a PNG of this basemap can be written with a 256 color palette: a map uses few colors, so the palette
 * is invisible and halves the file, whereas a photograph would show bands. Browsers cannot write one.
 */
export function canUsePalette(basemap, format) {
  return format === 'png' && basemap.outputFormat === 'png';
}

export function tileUrl(basemap, z, x, y) {
  return basemap.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}
