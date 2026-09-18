// Bridge between the interface and the main process: the interface never touches Node directly.

import { contextBridge, ipcRenderer } from 'electron';

let onProgress;

ipcRenderer.on('progress', (event, progress) => onProgress?.(progress));

contextBridge.exposeInMainWorld('cartes', {
  tile: (url, tile) => ipcRenderer.invoke('tile', url, tile),
  estimate: (request) => ipcRenderer.invoke('estimate', request),
  generate: (request, progressCallback) => {
    onProgress = progressCallback;
    return ipcRenderer.invoke('generate', request).finally(() => (onProgress = undefined));
  },
  cancel: () => ipcRenderer.invoke('cancel'),
});
