// Fields of a map request to the HTTP API, by their French name, with their English alias: those of the
// command line options. Shared by the server, which reads them, and by its OpenAPI description, which lists
// them. Every field is accepted under either name, and none other.

export const REQUEST_FIELDS = {
  commune: 'municipality',
  departement: 'department',
  fond: 'basemap',
  zoom: 'zoom',
  couches: 'maplayers',
  couchesPerso: 'customLayers',
  donnees: 'data',
  donneesCategorie: 'dataCategory',
  donneesCouleur: 'dataColor',
  format: 'format',
  marge: 'margin',
  dpi: 'dpi',
  gris: 'grayscale',
  contour: 'outline',
  legende: 'legend',
};

// A layer of the catalog, when it is given as an object rather than by its id alone.
export const LAYER_FIELDS = { id: 'id', opacite: 'opacity' };

// A layer added by its address: a template of tiles, or a WMS and the name of one of its layers.
export const CUSTOM_LAYER_FIELDS = {
  adresse: 'url',
  couche: 'layer',
  nom: 'name',
  source: 'attribution',
  opacite: 'opacity',
};

// A file of data added to the map.
export const DATA_FIELDS = { fichier: 'fileName', titre: 'title', contenu: 'content' };

/** The English aliases of a map of fields that differ from the French name, for the descriptions. */
export function englishAliases(fields) {
  return Object.entries(fields)
    .filter(([french, english]) => french !== english)
    .map(([, english]) => english);
}

/** Every name a field of the map may be given: the French ones and their English aliases. */
export function acceptedNames(fields) {
  return [...new Set([...Object.keys(fields), ...Object.values(fields)])];
}
