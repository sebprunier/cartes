// Catalogue des fonds de carte tuilés (projection Web Mercator, tuiles de 256 px).

function wmtsGeoplateforme(couche, formatImage) {
  return (
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    `&LAYER=${couche}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${formatImage}` +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
  );
}

const LISTE_FONDS = [
  {
    identifiant: 'plan-ign',
    nom: 'Plan IGN v2 (Géoplateforme)',
    url: wmtsGeoplateforme('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
    zoomMax: 19,
    attribution: '© IGN – Plan IGN',
  },
  {
    identifiant: 'ortho-ign',
    nom: 'Photographies aériennes IGN (Géoplateforme)',
    url: wmtsGeoplateforme('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
    zoomMax: 19,
    attribution: '© IGN – BD ORTHO',
  },
  {
    identifiant: 'esri-plan',
    nom: 'Plan (Esri World Street Map)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    zoomMax: 19,
    attribution: 'Esri, HERE, Garmin, © contributeurs OpenStreetMap',
  },
  {
    identifiant: 'esri-satellite',
    nom: 'Satellite (Esri World Imagery)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    zoomMax: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
];

export const FONDS = Object.fromEntries(LISTE_FONDS.map((fond) => [fond.identifiant, fond]));

export function urlTuile(fond, z, x, y) {
  return fond.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}
