import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpError, requestJson } from '../src/core/http.js';

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
