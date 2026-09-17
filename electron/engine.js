// Rendering engine of the desktop application: the work happens in the main process, with sharp.
// It replaces web/engine.js, which renders in the browser, and offers the same interface.

export const engine = {
  // The main process renders with sharp: no limit from the browser, only the memory of the machine.
  maxZoom: 19,
  formats: [
    ['png', 'PNG'],
    ['jpg', 'JPEG'],
    ['tif', 'TIFF'],
  ],
  privacyNote: "Tout se passe sur votre ordinateur : aucune donnée n'est envoyée ailleurs.",
  zoomNote:
    'Les zooms les plus élevés demandent beaucoup de mémoire : environ 1 Go au zoom 18 et 4 Go au zoom 19 pour ' +
    'une commune de taille moyenne. La colonne « Mémoire » indique la valeur exacte.',

  estimate: (request) => window.cartes.estimate(request),
  generate: (request, onProgress) => window.cartes.generate(request, onProgress),
  cancel: () => window.cartes.cancel(),
};
