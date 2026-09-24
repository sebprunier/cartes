// The state of the services the tool depends on, checked by asking each of them for a little of what a map asks
// for: one tile, one feature, one record, a few bytes of an archive. On 24 September 2026 the WMS of Géorisques
// answered an error page for all its layers, and a town hall seeing a layer fail could not tell a broken service
// from a bug of the tool or from its own connection (#36).

import { BASEMAPS, tileUrl } from './basemaps.js';
import { request } from './http.js';
import { MAP_LAYERS } from './maplayers.js';
import { lonLatToPixel } from './tiles.js';

// Address of the page of the site that runs these checks, for the messages of a service that fails.
export const STATUS_PAGE_URL = 'https://sebprunier.github.io/cartes/etat-des-services.html';

// Colombiers, where every service has something to answer: its town hall, and its INSEE code.
const PLACE = { lon: 0.426713, lat: 46.772149, inseeCode: '86081' };
// Beyond this, a service answers but a map that asks it hundreds of times will crawl.
export const SLOW_MS = 3000;
const TIMEOUT_MS = 15_000;

/** The tile of Colombiers of a source served as tiles, at `zoom`. */
function tileOf(source, zoom) {
  const [x, y] = lonLatToPixel(PLACE.lon, PLACE.lat, zoom);
  return tileUrl(source, zoom, Math.floor(x / 256), Math.floor(y / 256));
}

/** A small image of Colombiers asked of a WMS layer, at a scale every layer of Géorisques draws. */
function wmsImageOf(layer) {
  const [x, y] = lonLatToPixel(PLACE.lon, PLACE.lat, 15);
  const metres = (pixel) => (pixel / (256 * 2 ** 15)) * 2 * 20037508.342789244 - 20037508.342789244;
  const [left, right, top, bottom] = [metres(x - 128), metres(x + 128), -metres(y - 128), -metres(y + 128)];
  const parameters = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: layer.wmsLayers,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: [left, bottom, right, top].join(','),
    WIDTH: '256',
    HEIGHT: '256',
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
  });
  return `${layer.url}?${parameters}`;
}

function wfsOf(typeName, filter, property) {
  const parameters = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: typeName,
    OUTPUTFORMAT: 'application/json',
    PROPERTYNAME: property,
    CQL_FILTER: filter,
  });
  return `https://data.geopf.fr/wfs/ows?${parameters}`;
}

/**
 * The services checked, grouped as the page shows them: what the tool asks of each, and the layers of the
 * catalog it serves. `expect` says what a working answer is: an image, JSON, an XML record, or bytes.
 */
export const SERVICES = [
  {
    id: 'plan-ign',
    group: 'Fonds de carte et contours',
    name: 'Plan IGN',
    provider: 'Géoplateforme (IGN)',
    use: 'le fond de carte « plan »',
    url: tileOf(BASEMAPS['plan-ign'], 14),
    expect: 'image',
  },
  {
    id: 'ortho-ign',
    group: 'Fonds de carte et contours',
    name: 'Photographies aériennes',
    provider: 'Géoplateforme (IGN)',
    use: 'le fond de carte « photographies aériennes »',
    url: tileOf(BASEMAPS['ortho-ign'], 14),
    expect: 'image',
  },
  {
    id: 'contours',
    group: 'Fonds de carte et contours',
    name: 'Contours des communes',
    provider: 'Géoplateforme (IGN)',
    use: 'le contour de la commune et l’emprise de la carte',
    url: wfsOf('ADMINEXPRESS-COG.LATEST:commune', `code_insee='${PLACE.inseeCode}'`, 'code_insee'),
    expect: 'json',
  },
  {
    id: 'geocodage',
    group: 'Fonds de carte et contours',
    name: 'Recherche et géocodage',
    provider: 'Géoplateforme (IGN)',
    use: 'la recherche d’une commune, et le géocodage d’un fichier d’adresses',
    url: 'https://data.geopf.fr/geocodage/search?q=Colombiers&type=municipality&limit=1',
    expect: 'json',
  },
  {
    id: 'catalogue',
    group: 'Fonds de carte et contours',
    name: 'Catalogue des données',
    provider: 'Géoplateforme (IGN)',
    use: 'les dates de mise à jour écrites dans la mention des sources',
    url:
      'https://data.geopf.fr/csw?SERVICE=CSW&VERSION=2.0.2&REQUEST=GetRecordById&ID=IGNF_PLAN-IGN' +
      '&OUTPUTSCHEMA=http://www.isotc211.org/2005/gmd&ELEMENTSETNAME=brief',
    expect: 'record',
  },
  {
    id: 'cadastre',
    group: 'Couches',
    name: 'Parcelles cadastrales',
    provider: 'Géoplateforme (IGN)',
    use: 'la couche du cadastre',
    layers: ['cadastre'],
    url: tileOf(MAP_LAYERS.cadastre, 16),
    expect: 'image',
  },
  {
    id: 'courbes',
    group: 'Couches',
    name: 'Courbes de niveau',
    provider: 'Géoplateforme (IGN)',
    use: 'la couche des courbes de niveau',
    layers: ['courbes'],
    url: tileOf(MAP_LAYERS.courbes, 16),
    expect: 'image',
  },
  {
    id: 'bcae',
    group: 'Couches',
    name: 'Bandes tampons des cours d’eau',
    provider: 'Géoplateforme (IGN)',
    use: 'la couche des cours d’eau BCAE',
    layers: ['bcae'],
    url: tileOf(MAP_LAYERS.bcae, 13),
    expect: 'image',
  },
  {
    id: 'artificialisation',
    group: 'Couches',
    name: 'Artificialisation des sols (OCS GE)',
    provider: 'Géoplateforme (IGN)',
    use: 'la couche de l’artificialisation des sols',
    layers: ['artificialisation'],
    // The vintage Colombiers has.
    url: tileOf({ url: MAP_LAYERS.artificialisation.url.replace('{vintage}', '2021-2023') }, 16),
    expect: 'image',
  },
  {
    id: 'urbanisme',
    group: 'Couches',
    name: 'Documents d’urbanisme',
    provider: 'Géoportail de l’urbanisme',
    use: 'le zonage et les prescriptions des PLU',
    layers: ['plu', 'plu-prescriptions'],
    url: wfsOf('wfs_du:doc_urba_com', `insee='${PLACE.inseeCode}'`, 'partition'),
    expect: 'json',
  },
  ...['ppr-inondation', 'ppr-mouvements', 'cavites', 'canalisations'].map((id) => ({
    id,
    group: 'Couches',
    name: MAP_LAYERS[id].name,
    provider: 'Géorisques (BRGM)',
    use: `la couche « ${MAP_LAYERS[id].name} »`,
    layers: [id],
    url: wmsImageOf(MAP_LAYERS[id]),
    expect: 'image',
  })),
  {
    id: 'argiles',
    group: 'Couches',
    name: 'Retrait-gonflement des argiles',
    provider: 'data.gouv.fr',
    use: 'la couche de l’aléa argiles',
    layers: ['argiles'],
    url: MAP_LAYERS.argiles.url,
    // The header of the archive: the tool reads it before any of its tiles.
    range: 'bytes=0-126',
    expect: 'bytes',
  },
];

/** The service a layer of the catalog depends on, or undefined for a layer added by its address. */
export function serviceOfLayer(layerId) {
  return SERVICES.find(({ layers = [] }) => layers.includes(layerId));
}

/**
 * Checks a service: whether it answers what a map would need, and how fast. Resolves, never rejects, with
 * `state` among « ok », « slow » and « down », the time taken in milliseconds, and for a service down, what went
 * wrong in words a town hall understands.
 */
export async function checkService(service, { fetchResponse = timedRequest, now = () => performance.now() } = {}) {
  const start = now();
  try {
    const response = await fetchResponse(service.url, service.range ? { Range: service.range } : {});
    const answer = await readAnswer(service, response);
    const ms = Math.round(now() - start);
    if (answer) return { state: 'down', ms, detail: answer };
    return { state: ms >= SLOW_MS ? 'slow' : 'ok', ms };
  } catch (error) {
    const ms = Math.round(now() - start);
    const detail =
      error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? `pas de réponse en ${TIMEOUT_MS / 1000} s`
        : 'injoignable : réseau coupé, ou service arrêté';
    return { state: 'down', ms, detail };
  }
}

/** What is wrong with an answer, or nothing when it is what a map would get from a working service. */
async function readAnswer(service, response) {
  if (!response.ok) {
    await response.body?.cancel();
    return `erreur ${response.status}`;
  }
  const type = response.headers.get('content-type') ?? '';
  if (service.expect === 'image') {
    if (type.startsWith('image/')) {
      await response.arrayBuffer();
      return undefined;
    }
    // A MapServer whose configuration is broken says why in its error page: Géorisques on 24 September 2026.
    const page = await response.text();
    const reason = page.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return `une page d’erreur au lieu d’une image${reason ? ` : « ${reason.slice(0, 120)} »` : ''}`;
  }
  if (service.expect === 'json') {
    try {
      await response.json();
      return undefined;
    } catch {
      return 'une réponse illisible';
    }
  }
  if (service.expect === 'record') {
    return (await response.text()).includes('MD_Metadata') ? undefined : 'une fiche vide';
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.length > 0 ? undefined : 'une réponse vide';
}

function timedRequest(url, headers) {
  return request(url, headers, { timeoutMs: TIMEOUT_MS });
}

/** A check of a service as a line of text: « en panne — erreur 503 », « lent (4,2 s) », « fonctionne (0,3 s) ». */
export function describeCheck(check) {
  if (check.state === 'down') return `en panne — ${check.detail}`;
  return `${check.state === 'slow' ? 'lent' : 'fonctionne'} (${duration(check.ms)})`;
}

/** Milliseconds written as seconds, the French way: « 0,3 s ». */
export function duration(ms) {
  // Answered from the cache of the browser, a service takes a few milliseconds: « 0 s » would read as a failure.
  if (ms < 100) return 'moins de 0,1 s';
  return `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
}
