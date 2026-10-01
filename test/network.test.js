import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';

import { useFetch } from '../src/core/http.js';
import { MapLayerError, checkMapLayer, customMapLayer } from '../src/core/maplayers.js';
import { PrivateAddressError, createPublicFetch, isPublicAddress } from '../src/node/network.js';

/** A lookup that answers `addresses` for any name, and counts the names asked. */
function fakeLookup(...addresses) {
  const asked = [];
  const lookup = (hostname, options, callback) => {
    asked.push(hostname);
    callback(null, addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
  };
  return { lookup, asked };
}

describe('isPublicAddress', () => {
  it('refuses the loopback, the private networks, the link-local addresses and their IPv6 forms', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::a00:1',
      'localhost',
    ]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it('accepts the addresses of the internet', () => {
    for (const address of ['8.8.8.8', '172.32.0.1', '193.51.24.1', '2001:4860:4860::8888']) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });
});

describe('createPublicFetch', () => {
  it('refuses an address written as a private IP, without connecting', async () => {
    const publicFetch = createPublicFetch();
    for (const url of [
      'http://127.0.0.1:1/tuiles/0/0/0.png',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data/',
      'https://10.0.0.1/wms',
      'http://[::ffff:127.0.0.1]/',
      // The URL parser reads this as 127.0.0.1.
      'http://2130706433/',
    ]) {
      await assert.rejects(publicFetch(url), PrivateAddressError, url);
    }
  });

  it('refuses a name that resolves to a private address, even among public ones', async () => {
    for (const addresses of [['10.0.0.5'], ['93.184.216.34', '127.0.0.1']]) {
      const { lookup, asked } = fakeLookup(...addresses);
      await assert.rejects(
        createPublicFetch({ lookup })('http://interne.exemple/tuiles/0/0/0.png'),
        /^Error: interne\.exemple désigne une adresse privée, que l’API ne consulte pas/,
      );
      assert.deepEqual(asked, ['interne.exemple']);
    }
  });

  describe('on a server of its own', () => {
    let server;
    let base;
    // Only this server, on 127.0.0.1, stands for the internet here: ::1 stays private.
    const publicFetch = createPublicFetch({ isAllowed: (address) => address === '127.0.0.1' });

    before(async () => {
      server = http.createServer((request, response) => {
        const port = server.address().port;
        if (request.url === '/texte') return response.end('bonjour');
        if (request.url === '/compresse') {
          response.writeHead(200, { 'Content-Encoding': 'gzip' });
          return response.end(gzipSync('bonjour, compressé'));
        }
        if (request.url === '/vers-texte') {
          response.writeHead(302, { Location: '/texte' });
          return response.end();
        }
        if (request.url === '/vers-prive') {
          response.writeHead(307, { Location: `http://[::1]:${port}/texte` });
          return response.end();
        }
        if (request.url === '/boucle') {
          response.writeHead(302, { Location: '/boucle' });
          return response.end();
        }
        if (request.url === '/lente') return setTimeout(() => response.end('trop tard'), 500);
        if (request.url === '/grosse') return response.end(Buffer.alloc(2 * 1024 * 1024));
        if (request.url === '/bombe') {
          response.writeHead(200, { 'Content-Encoding': 'gzip' });
          return response.end(gzipSync(Buffer.alloc(2 * 1024 * 1024)));
        }
        response.writeHead(404);
        response.end();
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });

    it('answers as fetch does: status, headers, body', async () => {
      const response = await publicFetch(`${base}/texte`, { headers: { 'User-Agent': 'essai' } });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'bonjour');
      assert.equal((await publicFetch(`${base}/absente`)).status, 404);
    });

    it('uncompresses what the service compresses', async () => {
      assert.equal(await (await publicFetch(`${base}/compresse`)).text(), 'bonjour, compressé');
    });

    it('follows a redirection, but not to a private address, nor endlessly', async () => {
      assert.equal(await (await publicFetch(`${base}/vers-texte`)).text(), 'bonjour');
      await assert.rejects(publicFetch(`${base}/vers-prive`), PrivateAddressError);
      await assert.rejects(publicFetch(`${base}/boucle`), /fetch failed/);
    });

    it('fails on a body larger than the limit, counted once uncompressed', async () => {
      const limited = createPublicFetch({ isAllowed: (address) => address === '127.0.0.1', maxBytes: 1024 * 1024 });
      for (const route of ['/grosse', '/bombe']) {
        const response = await limited(`${base}${route}`);
        await assert.rejects(response.arrayBuffer(), route);
      }
      assert.equal((await (await publicFetch(`${base}/bombe`)).arrayBuffer()).byteLength, 2 * 1024 * 1024);
    });

    it('stops at the end of its time, as fetch does', async () => {
      await assert.rejects(publicFetch(`${base}/lente`, { signal: AbortSignal.timeout(50) }), { name: 'TimeoutError' });
    });
  });

  it('is what the core asks with, once the API puts it in place', async (t) => {
    useFetch(createPublicFetch());
    t.after(() => useFetch());
    const layer = customMapLayer({ url: 'http://127.0.0.1:9/{z}/{x}/{y}.png', name: 'Interne', attribution: '©' });
    await assert.rejects(checkMapLayer(layer, { lon: 0.43, lat: 46.78, zoom: 13 }), (error) => {
      assert.ok(error instanceof MapLayerError);
      assert.match(error.message, /127\.0\.0\.1 est une adresse privée, que l’API ne consulte pas/);
      return true;
    });
  });
});
