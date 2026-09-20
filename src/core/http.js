const USER_AGENT = 'cartes/0.1 (generation de cartes communales)';
const TIMEOUT_MS = 30_000;

// Browsers forbid setting the User-Agent header, and send their own.
const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

export class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} pour ${url}`);
    this.status = status;
  }
}

export function request(url, headers = {}) {
  return fetch(url, {
    headers: { ...(isNode ? { 'User-Agent': USER_AGENT } : {}), ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Bytes of a part of a file, for the services that serve a large file by ranges. */
export async function requestRange(url, start, length) {
  const response = await request(url, { Range: `bytes=${start}-${start + length - 1}` });
  if (!response.ok) throw new HttpError(url, response.status);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Bytes of a whole file, for the services that serve one address per tile. A tile that does not exist is not
 * a failure: a service answers 404, or 200 with an empty body, where its data does not reach.
 */
export async function requestBytes(url) {
  const response = await request(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(url, response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return null;
  // Some services serve gzipped tiles without announcing it, which fetch then cannot undo by itself.
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzip(bytes) : bytes;
}

/** Decompression is a web standard, available both in a browser and under Node. */
export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function requestJson(url) {
  const response = await request(url);
  if (!response.ok) throw new HttpError(url, response.status);
  return response.json();
}
