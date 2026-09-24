#!/usr/bin/env node
// Builds the site into dist/: the documentation at its root, and the page that generates the maps in
// dist/generer/, with the shared core next to it. With --serve, also serves dist/ locally, for development.

import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { GENERATOR_PATH, buildDocs, pendingCaptures } from './build-docs.js';

const OUTPUT = 'dist';
const GENERATOR = path.join(OUTPUT, GENERATOR_PATH);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

await rm(OUTPUT, { recursive: true, force: true });

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const pages = await buildDocs(OUTPUT, { version });
const pending = await pendingCaptures();
console.log(
  `Documentation construite dans ${OUTPUT}/ (${pages} pages` +
    `${pending.length ? `, ${pending.length} capture(s) d'écran à venir : node scripts/build-docs.js les liste` : ''})`,
);

await mkdir(GENERATOR, { recursive: true });
await cp('web', GENERATOR, { recursive: true });
await cp('src/core', path.join(GENERATOR, 'core'), { recursive: true });
await cp('docs/images/logo.png', path.join(GENERATOR, 'logo.png'));
console.log(`Page de génération construite dans ${GENERATOR}`);

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
        // A directory is served by its index, as GitHub Pages does — which first adds the missing slash, so that
        // the relative addresses of the page lead where they should.
        if ((await stat(filePath)).isDirectory()) {
          if (!requested.endsWith('/')) {
            response.writeHead(301, { Location: `${requested}/` }).end();
            return;
          }
          filePath = path.join(filePath, 'index.html');
        }
        await stat(filePath);
      } catch {
        response.writeHead(404, { 'content-type': CONTENT_TYPES['.html'] });
        createReadStream(path.join(OUTPUT, '404.html')).pipe(response);
        return;
      }
      response.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
      createReadStream(filePath).pipe(response);
    })
    .listen(port, () =>
      console.log(`Site servi sur http://localhost:${port}/, page de génération sur http://localhost:${port}/${GENERATOR_PATH}`),
    );
}
