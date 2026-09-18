#!/usr/bin/env node
// Builds the web page into dist/: the page files, the shared core next to them, and the logo.
// With --serve, also serves dist/ locally, for development.

import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { buildDocs } from './build-docs.js';

const OUTPUT = 'dist';
const DOCUMENTATION = path.join(OUTPUT, 'documentation');
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
await cp('web', OUTPUT, { recursive: true });
await cp('src/core', path.join(OUTPUT, 'core'), { recursive: true });
await cp('docs/images/logo.png', path.join(OUTPUT, 'logo.png'));
console.log(`Page web construite dans ${OUTPUT}/`);

await mkdir(DOCUMENTATION, { recursive: true });
await cp('docs/documentation.css', path.join(DOCUMENTATION, 'documentation.css'));
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const pages = await buildDocs(DOCUMENTATION, { version });
console.log(`Documentation construite dans ${DOCUMENTATION}/ (${pages} pages)`);

if (process.argv.includes('--serve')) {
  const port = Number(process.argv[process.argv.indexOf('--serve') + 1]) || 8000;
  http
    .createServer(async (request, response) => {
      const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let filePath = path.join(OUTPUT, requested);
      if (!path.resolve(filePath).startsWith(path.resolve(OUTPUT))) {
        response.writeHead(403).end('Interdit');
        return;
      }
      try {
        // A directory is served by its index, as GitHub Pages does.
        if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
        await stat(filePath);
      } catch {
        response.writeHead(404).end('Introuvable');
        return;
      }
      response.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
      createReadStream(filePath).pipe(response);
    })
    .listen(port, () => console.log(`Page servie sur http://localhost:${port}`));
}
