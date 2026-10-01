import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { gzipSync } from 'node:zlib';

import { HttpError, gunzip, requestJson } from '../src/core/http.js';

describe('requestJson', () => {
  it('asks again a service that fails for a moment', async (t) => {
    const answers = [new Response('', { status: 503 }), Response.json({ features: [] })];
    const fetch = t.mock.method(globalThis, 'fetch', async () => answers.shift());
    assert.deepEqual(await requestJson('https://data.geopf.fr/wfs', { retryDelayMs: 1 }), { features: [] });
    assert.equal(fetch.mock.callCount(), 2);
  });

  it('says in French that a service does not answer, after three tries', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await assert.rejects(
      requestJson('https://data.geopf.fr/wfs/ows?q=1', { retryDelayMs: 1 }),
      /^Error: Le service data\.geopf\.fr ne répond pas \(pas de réponse en 30 s\) : réessayez dans quelques minutes\.$/,
    );
    assert.equal(fetch.mock.callCount(), 3);
  });

  it('does not ask again what the service refuses for good', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
    await assert.rejects(requestJson('https://data.geopf.fr/wfs', { retryDelayMs: 1 }), HttpError);
    assert.equal(fetch.mock.callCount(), 1);
  });
});

describe('gunzip', () => {
  it('unfolds what fits, and stops a gzip that unfolds past the limit', async () => {
    const bytes = gzipSync(Buffer.alloc(2 * 1024 * 1024));
    assert.equal(bytes.length < 10_000, true);
    assert.equal((await gunzip(bytes)).length, 2 * 1024 * 1024);
    await assert.rejects(
      gunzip(bytes, { maxBytes: 1024 * 1024 }),
      /^Error: Réponse trop volumineuse une fois décompressée : plus de 1 Mo\.$/,
    );
  });
});
