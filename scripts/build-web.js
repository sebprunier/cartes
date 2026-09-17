#!/usr/bin/env node
// Builds the web page into dist/: the page files, the shared core next to them, and the logo.
// With --serve, also serves dist/ locally, for development.

import { createReadStream } from 'node:fs';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const OUTPUT = 'dist';
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

if (process.argv.includes('--serve')) {
  const port = Number(process.argv[process.argv.indexOf('--serve') + 1]) || 8000;
  http
    .createServer(async (request, response) => {
      const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filePath = path.join(OUTPUT, requested === '/' ? 'index.html' : requested);
      if (!path.resolve(filePath).startsWith(path.resolve(OUTPUT))) {
        response.writeHead(403).end('Interdit');
        return;
      }
      try {
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
