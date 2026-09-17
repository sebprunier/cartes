// Rendering engine of the web page: the work happens in a worker, in the browser.
// The Electron application provides another engine with the same interface.

export const engine = {
  // Above this zoom level, the image goes beyond what browsers can draw.
  maxZoom: 17,
  formats: [
    ['png', 'PNG'],
    ['jpg', 'JPEG'],
  ],
  privacyNote: "Tout se passe dans votre navigateur : aucune donnée n'est envoyée ailleurs.",
  zoomNote:
    "Au-delà du zoom 17, l'image dépasse ce qu'un navigateur sait produire : passez par la ligne de commande " +
    "ou l'application de bureau.",

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
