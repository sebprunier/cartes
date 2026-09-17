const USER_AGENT = 'cartes/0.1 (generation de cartes communales)';
const TIMEOUT_MS = 30_000;

export class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status} pour ${url}`);
    this.status = status;
  }
}

export function request(url) {
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function requestJson(url) {
  const response = await request(url);
  if (!response.ok) throw new HttpError(url, response.status);
  return response.json();
}
