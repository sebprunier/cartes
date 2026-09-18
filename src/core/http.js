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

export async function requestJson(url) {
  const response = await request(url);
  if (!response.ok) throw new HttpError(url, response.status);
  return response.json();
}
