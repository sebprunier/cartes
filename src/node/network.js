// Requests of an instance of the API. Its clients choose the addresses of the layers they add, and the instance
// asks for them in their name: they must not reach the network it runs in — its own services, its neighbours,
// the metadata its host serves at 169.254.169.254. The address is checked when the connection is made, after
// the name is resolved and at each redirection: checked beforehand, a name could resolve to a public address
// for the check, and to a private one a moment later for the request.

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable, Transform, pipeline } from 'node:stream';
import zlib from 'node:zlib';

import { MAX_RESPONSE_BYTES } from '../core/http.js';

const MAX_REDIRECTS = 5;
const REDIRECTS = [301, 302, 303, 307, 308];
// Statuses whose answer has no body, which a Response refuses to be given one.
const NULL_BODY_STATUSES = [101, 204, 205, 304];
// The compressions that fetch asks for and undoes, and so does this one.
const DECODERS = {
  gzip: () => zlib.createGunzip(),
  'x-gzip': () => zlib.createGunzip(),
  deflate: () => zlib.createInflate(),
  br: () => zlib.createBrotliDecompress(),
};

// What is not the public internet, after the special-purpose registries of the IANA. An IPv4 address mapped in
// IPv6 (::ffff:127.0.0.1) is checked as the IPv4 one it is: the BlockList does it, both ways, so that a rule on
// ::ffff:0:0/96 would refuse every IPv4 address. Those embedded otherwise — NAT64, 6to4, Teredo — are refused
// whole.
const NOT_PUBLIC = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  NOT_PUBLIC.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]) {
  NOT_PUBLIC.addSubnet(address, prefix, 'ipv6');
}

/** An address the instance does not ask for: told to the client, who gave it, but not what a name resolves to. */
export class PrivateAddressError extends Error {
  constructor(host, { name = false } = {}) {
    super(
      `${host} ${name ? 'désigne' : 'est'} une adresse privée, que l’API ne consulte pas : ` +
        'seuls les services publics sont acceptés',
    );
  }
}

/** Whether an IP address is on the public internet. */
export function isPublicAddress(address) {
  const family = net.isIP(address);
  return family !== 0 && !NOT_PUBLIC.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * A `fetch` that only reaches the public internet, for the requests the core makes: GET, with headers and a
 * signal. `lookup` resolves a name, and `isAllowed` says whether an address may be reached — the tests reach
 * a server of their own on the loopback. A body larger than `maxBytes` fails while it is read.
 */
export function createPublicFetch({
  lookup = dns.lookup,
  isAllowed = isPublicAddress,
  maxBytes = MAX_RESPONSE_BYTES,
} = {}) {
  // The resolved addresses are checked where the socket is opened: there is no moment between the check and
  // the connection for the name to change its answer.
  const checkedLookup = (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      if (addresses.length === 0 || !addresses.every(({ address }) => isAllowed(address))) {
        return callback(new PrivateAddressError(hostname, { name: true }));
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
  const agents = {
    'http:': new http.Agent({ keepAlive: true, lookup: checkedLookup }),
    'https:': new https.Agent({ keepAlive: true, lookup: checkedLookup }),
  };

  return async function publicFetch(url, { headers = {}, signal } = {}) {
    let address = new URL(url);
    for (let redirects = 0; ; redirects++) {
      const response = await get(address, {
        headers: { 'Accept-Encoding': Object.keys(DECODERS).join(', '), ...headers },
        signal,
        agents,
        lookup: checkedLookup,
        isAllowed,
      });
      const location = REDIRECTS.includes(response.statusCode) && response.headers.location;
      if (!location) return toResponse(response, maxBytes);
      response.resume();
      if (redirects === MAX_REDIRECTS) {
        throw new TypeError('fetch failed', { cause: new Error('Trop de redirections.') });
      }
      address = new URL(location, address);
    }
  };
}

function get(address, { headers, signal, agents, lookup, isAllowed }) {
  if (address.protocol !== 'http:' && address.protocol !== 'https:') {
    const cause = new Error(`Protocole refusé : ${address.protocol}`);
    return Promise.reject(new TypeError('fetch failed', { cause }));
  }
  // An address written as an IP is connected to without being resolved: it is checked here.
  const host = address.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isAllowed(host)) return Promise.reject(new PrivateAddressError(host));

  const client = address.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(address, { headers, signal, agent: agents[address.protocol], lookup }, resolve);
    request.on('error', (error) => {
      // As fetch does: a timeout or a cancelation rejects with its reason, a refused address says why, and
      // any other failure of the network is the same « fetch failed », whatever the system said.
      if (signal?.aborted) reject(signal.reason);
      else if (error instanceof PrivateAddressError) reject(error);
      else reject(new TypeError('fetch failed', { cause: error }));
    });
  });
}

function toResponse(message, maxBytes) {
  const headers = new Headers();
  for (let index = 0; index < message.rawHeaders.length; index += 2) {
    try {
      headers.append(message.rawHeaders[index], message.rawHeaders[index + 1]);
    } catch {
      // A header that a Response would not hold is left out, as fetch does.
    }
  }
  const empty = NULL_BODY_STATUSES.includes(message.statusCode);
  if (empty) message.resume();
  return new Response(empty ? null : Readable.toWeb(limited(decoded(message), maxBytes)), {
    status: message.statusCode,
    statusText: message.statusMessage,
    headers,
  });
}

/** The body of an answer, uncompressed as fetch would. */
function decoded(message) {
  const decoder = DECODERS[message.headers['content-encoding']?.trim().toLowerCase()];
  return decoder ? pipeline(message, decoder(), () => {}) : message;
}

/** A body that fails past `maxBytes`, counted once uncompressed: a few kilobytes of gzip can unfold into gigabytes. */
function limited(body, maxBytes) {
  let length = 0;
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      length += chunk.length;
      if (length > maxBytes) callback(new Error(`Réponse trop volumineuse : plus de ${maxBytes / 1024 / 1024} Mo.`));
      else callback(null, chunk);
    },
  });
  return pipeline(body, counter, () => {});
}

/** The fetch of an instance of the API. */
export const publicFetch = createPublicFetch();
