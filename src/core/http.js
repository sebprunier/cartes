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

export function request(url, headers = {}, { timeoutMs = TIMEOUT_MS } = {}) {
  return fetch(url, {
    headers: { ...(isNode ? { 'User-Agent': USER_AGENT } : {}), ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Bytes of a part of a file, for the services that serve a large file by ranges. */
export async function requestRange(url, start, length) {
  const response = await request(url, { Range: `bytes=${start}-${start + length - 1}` });
  if (!response.ok) throw new HttpError(url, response.status);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Bytes of a whole file, for the services that serve one address per tile. A tile that holds nothing is not a
 * failure, and the two ways of saying so are told apart: `null` for a tile the service does not know (404),
 * an empty result for a tile it knows and has nothing to put in. A wrong address answers 404 everywhere,
 * which is worth saying, where a layer that simply stops short answers with emptiness.
 */
export async function requestBytes(url) {
  const response = await request(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(url, response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return bytes;
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

/**
 * Text answered to a form sent by POST — a file to geocode. A service under load refuses for a moment (429) or
 * fails at its gateway (502 to 504): the form is sent again, twice, after a pause.
 */
export async function requestForm(url, form, { retryDelayMs = 2000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      headers: isNode ? { 'User-Agent': USER_AGENT } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return response.text();
    if (attempt < 3 && [429, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, attempt * retryDelayMs));
      continue;
    }
    throw new HttpError(url, response.status);
  }
}
