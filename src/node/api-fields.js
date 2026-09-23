// Fields of a map request to the HTTP API, by their French name, with their English alias: those of the
// command line options. Shared by the server, which reads them, and by its OpenAPI description.

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
