// Rendering engine of the desktop application: the work happens in the main process, with sharp.
// It replaces web/engine.js, which renders in the browser, and offers the same interface.

export const engine = {
  desktop: true,
  // The main process renders with sharp: no limit from the browser, only the memory of the machine.
  maxZoom: 19,
  formats: [
    ['png', 'PNG'],
    ['jpg', 'JPEG'],
    ['tif', 'TIFF'],
  ],
  zoomNote:
    'Les zooms les plus élevés demandent beaucoup de mémoire : environ 1 Go au zoom 18 et 4 Go au zoom 19 pour ' +
    'une commune de taille moyenne. La colonne « Mémoire » indique la valeur exacte.',

  customLayerNote:
    'Les tuiles seront demandées directement à ce service, qui apprendra donc quelle commune vous ' +
    'cartographiez. L’adresse est retenue sur cet ordinateur pour vos prochaines cartes, et nulle part ailleurs.',

  // The tiles of the preview go through the main process, which keeps them in the same cache as the maps.
  loadTile: (url, tile) => window.cartes.tile(url, tile),

  // The check goes through the main process too: the interface is a page, and a page is bound by the rules a
  // service sets for other sites (CORS). The application is not, and must not refuse what it can in fact read.
  checkLayer: (layer, place) => window.cartes.checkLayer(layer, place),

  estimate: (request) => window.cartes.estimate(request),
  generate: (request, onProgress) => window.cartes.generate(request, onProgress),
  cancel: () => window.cartes.cancel(),
};
