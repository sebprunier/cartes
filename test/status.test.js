import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAP_LAYERS } from '../src/core/maplayers.js';
import { SERVICES, SLOW_MS, checkService, describeCheck, serviceOfLayer } from '../src/core/status.js';

const service = (expect) => SERVICES.find((each) => each.expect === expect);

/** A clock that has moved by `ms` once the answer comes back. */
function clock(ms) {
  let calls = 0;
  return () => (calls++ === 0 ? 1000 : 1000 + ms);
}

describe('SERVICES', () => {
  it('checks the service of every layer of the catalog, and names what each one serves', () => {
    for (const id of Object.keys(MAP_LAYERS)) assert.ok(serviceOfLayer(id), id);
    assert.equal(serviceOfLayer('perso-1'), undefined);
    for (const each of SERVICES) {
      for (const field of ['id', 'group', 'name', 'provider', 'use', 'url', 'expect']) assert.ok(each[field], `${each.id} ${field}`);
    }
    assert.equal(new Set(SERVICES.map(({ id }) => id)).size, SERVICES.length);
  });
});

describe('checkService', () => {
  it('says a service works when it answers what a map needs, and how fast', async () => {
    const image = new Response(new Uint8Array([137, 80]), { headers: { 'content-type': 'image/png' } });
    const check = await checkService(service('image'), { fetchResponse: async () => image, now: clock(420) });
    assert.deepEqual(check, { state: 'ok', ms: 420 });
    assert.equal(describeCheck(check), 'fonctionne (0,4 s)');
    assert.equal(describeCheck({ state: 'ok', ms: 12 }), 'fonctionne (moins de 0,1 s)');
  });

  it('says a service is slow beyond three seconds', async () => {
    const json = () => Response.json({ features: [] });
    const check = await checkService(service('json'), { fetchResponse: async () => json(), now: clock(SLOW_MS + 200) });
    assert.equal(check.state, 'slow');
    assert.equal(describeCheck(check), 'lent (3,2 s)');
  });

  it('reads why a WMS answers an error page where an image is expected', async () => {
    // Géorisques on 24 September 2026.
    const page = new Response(
      '<HTML><HEAD><TITLE>MapServer Message</TITLE></HEAD><!-- MapServer version 6.5 --><BODY>' +
        'loadLayer(): Unknown identifier. Parsing error near (ITEMS):(line 666)</BODY></HTML>',
      { headers: { 'content-type': 'text/html' } },
    );
    const check = await checkService(service('image'), { fetchResponse: async () => page });
    assert.equal(check.state, 'down');
    assert.equal(
      check.detail,
      'une page d’erreur au lieu d’une image : « MapServer Message loadLayer(): Unknown identifier. Parsing error near (ITEMS):(line 666) »',
    );
  });

  it('says a service is down when it refuses, answers nothing usable, or cannot be reached', async () => {
    const refused = await checkService(service('json'), { fetchResponse: async () => new Response('', { status: 503 }) });
    assert.deepEqual([refused.state, refused.detail], ['down', 'erreur 503']);

    const garbled = await checkService(service('json'), { fetchResponse: async () => new Response('<html>') });
    assert.deepEqual([garbled.state, garbled.detail], ['down', 'une réponse illisible']);

    const empty = await checkService(service('record'), { fetchResponse: async () => new Response('<csw:GetRecordByIdResponse/>') });
    assert.deepEqual([empty.state, empty.detail], ['down', 'une fiche vide']);

    const unreachable = await checkService(service('json'), {
      fetchResponse: async () => {
        throw new TypeError('fetch failed');
      },
    });
    assert.deepEqual([unreachable.state, unreachable.detail], ['down', 'injoignable : réseau coupé, ou service arrêté']);

    const silent = await checkService(service('json'), {
      fetchResponse: async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    });
    assert.equal(silent.detail, 'pas de réponse en 15 s');
    assert.equal(describeCheck(silent), 'en panne — pas de réponse en 15 s');
  });

  it('asks an archive only for its header', async () => {
    const archive = SERVICES.find(({ id }) => id === 'argiles');
    let headers;
    const check = await checkService(archive, {
      fetchResponse: async (url, sent) => {
        headers = sent;
        return new Response(new Uint8Array(127), { status: 206 });
      },
    });
    assert.equal(check.state, 'ok');
    assert.deepEqual(headers, { Range: 'bytes=0-126' });
  });
});
