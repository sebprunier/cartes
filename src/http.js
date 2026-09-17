const USER_AGENT = 'cartes/0.1 (generation de cartes communales)';
const DELAI_MS = 30_000;

export class ErreurHttp extends Error {
  constructor(url, statut) {
    super(`HTTP ${statut} pour ${url}`);
    this.statut = statut;
  }
}

export function requete(url) {
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(DELAI_MS),
  });
}

export async function requeteJson(url) {
  const reponse = await requete(url);
  if (!reponse.ok) throw new ErreurHttp(url, reponse.status);
  return reponse.json();
}
