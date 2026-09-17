#!/usr/bin/env node
// Builds the interface of the desktop application into dist-electron/renderer/: the same page as the web
// version, with the engine that renders in the main process instead of the one that renders in the browser.

import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT = path.join('dist-electron', 'renderer');

await rm('dist-electron', { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
await cp('web', OUTPUT, { recursive: true });
await cp('src/core', path.join(OUTPUT, 'core'), { recursive: true });
await cp('docs/images/logo.png', path.join(OUTPUT, 'logo.png'));
await rm(path.join(OUTPUT, 'worker.js')); // The browser worker is replaced by the main process.
await cp('electron/engine.js', path.join(OUTPUT, 'engine.js'));
console.log(`Interface de l'application construite dans ${OUTPUT}/`);
