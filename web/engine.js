// Rendering engine of the web page: the work happens in a worker, in the browser.
// The Electron application provides another engine with the same interface.

export const engine = {
  // All the zoom levels of the basemaps are offered: how far a browser can go depends on the size of the
  // municipality and on the machine, and the canvas refuses what it cannot draw before anything is downloaded.
  maxZoom: 19,
  formats: [
    ['png', 'PNG'],
    ['jpg', 'JPEG'],
  ],
  privacyNote: "Tout se passe dans votre navigateur : aucune donnée n'est envoyée ailleurs.",
  zoomNote:
    'Les zooms les plus élevés produisent de très grandes images, qu’un navigateur finit par refuser de ' +
    'dessiner : cela dépend de la taille de la commune et de la machine. La ligne de commande et ' +
    "l'application de bureau n'ont pas cette limite.",

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
