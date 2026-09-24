// Rendering engine of the web page: the work happens in a worker, in the browser.
// The Electron application provides another engine with the same interface.

export const engine = {
  desktop: false,
  // All the zoom levels of the basemaps are offered: how far a browser can go depends on the size of the
  // municipality and on the machine, and the canvas refuses what it cannot draw before anything is downloaded.
  maxZoom: 19,
  formats: [
    ['png', 'PNG'],
    ['jpg', 'JPEG'],
  ],
  zoomNote:
    'Les zooms les plus élevés produisent de très grandes images, qu’un navigateur finit par refuser de ' +
    'dessiner : cela dépend de la taille de la commune et de la machine. La ligne de commande et ' +
    "l'application de bureau n'ont pas cette limite.",

  customLayerNote:
    'Les tuiles ou les images seront demandées directement à ce service, qui apprendra donc quelle commune vous ' +
    'cartographiez. L’adresse est retenue dans ce navigateur pour vos prochaines cartes, et nulle part ailleurs. ' +
    'Un service qui n’autorise pas les autres sites à le lire (CORS) restera inaccessible depuis cette page.',

  // No loadTile: the preview is drawn in the page, which downloads its tiles itself and lets the browser
  // cache them. The desktop application needs one, its interface having no network role.
  checkLayer: (layer, place) => askWorker({ task: 'check-layer', layer, place }),
  readCapabilities: (address) => askWorker({ task: 'capabilities', address }),
  estimate: (request) => askWorker({ task: 'estimate', ...request }),
  generate: (request, onProgress) => askWorker({ task: 'generate', ...request }, onProgress),
  cancel: () => stopWorker(),
};

let worker;

/** Sends a task to a fresh worker and waits for its result, forwarding the progress messages. */
function askWorker(message, onProgress) {
  stopWorker();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.progress) onProgress?.(data.progress);
      else if (data.error) reject(new Error(data.error));
      else if (data.done) resolve(data);
    };
    worker.onerror = (event) => reject(new Error(event.message ?? 'Erreur inattendue'));
    worker.postMessage(message);
  });
}

function stopWorker() {
  worker?.terminate();
  worker = undefined;
}
