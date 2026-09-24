// The capabilities of a WMS: what a service says it can draw — its layers, their titles, the source to credit,
// the projections and the scales they are drawn at. A layer added from a WMS is chosen among them rather than
// typed: its name must be exact, and the service knows it (#27). The core runs in a browser and a worker too,
// without an XML library: the document is read tag by tag, for what the tool needs of it and nothing more.

import { HttpError, request } from './http.js';

// Scale of a map at zoom 0, as a WMS computes it: the width of the world in Web Mercator, in metres, for 256
// pixels of 0.28 mm — the size of a pixel the standard assumes.
const SCALE_AT_ZOOM_0 = 559082264.028;
// The projection of the maps; its old name still appears in older services.
const WEB_MERCATOR = ['EPSG:3857', 'EPSG:900913'];

export class CapabilitiesError extends Error {}

/**
 * The address of the service, without what asks it for something: « …/wms?SERVICE=WMS&REQUEST=GetCapabilities »,
 * « …/wms? » and « …/wms » are the same service. What else the address carries — a map file, a key — stays.
 */
export function serviceAddress(address) {
  let url;
  try {
    url = new URL(String(address ?? '').trim());
  } catch {
    throw new CapabilitiesError(`Adresse de service invalide : ${address}. Attendu par exemple https://exemple.fr/wms.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CapabilitiesError(`Adresse de service invalide : ${address}. Attendu une adresse en https.`);
  }
  for (const name of [...url.searchParams.keys()]) {
    if (['service', 'request', 'version', 'layers', 'layer', 'styles', 'format', 'bbox', 'crs', 'srs', 'width', 'height', 'transparent'].includes(name.toLowerCase())) {
      url.searchParams.delete(name);
    }
  }
  return url.toString().replace(/\?$/, '');
}

/** The address asking the service for its capabilities. */
export function capabilitiesUrl(address) {
  const service = serviceAddress(address);
  return `${service}${service.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`;
}

/**
 * The capabilities of the service at `address`: its title, and the layers it can draw for a map — those with a
 * name, in Web Mercator. The others are counted, so that an empty list can be explained.
 */
export async function readCapabilities(address, { fetchText = requestText } = {}) {
  const url = capabilitiesUrl(address);
  let xml;
  try {
    xml = await fetchText(url);
  } catch (error) {
    throw new CapabilitiesError(
      `Le service n’a pas répondu (${error.message}). Vérifiez l’adresse${
        typeof window === 'object' || typeof WorkerGlobalScope === 'function'
          ? ', et qu’il autorise les autres sites à le lire (CORS) : sinon, passez par l’application de bureau'
          : ''
      }.`,
    );
  }
  if (!/<(\w+:)?WMS_Capabilities[\s>]|<WMT_MS_Capabilities[\s>]/.test(xml)) {
    throw new CapabilitiesError(
      'Cette adresse ne répond pas comme un service WMS : attendu la description de ses couches ' +
        '(GetCapabilities), reçu autre chose.',
    );
  }
  return parseCapabilities(xml);
}

/** The capabilities read from their XML (see readCapabilities). */
export function parseCapabilities(xml) {
  const document = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<(\/?)wms:/g, '<$1');
  const service = section(document, 'Service');
  const root = layerTree(document);
  const layers = [];
  let withoutWebMercator = 0;
  const visit = (node, inherited) => {
    // The styles and the source of a layer have names and titles of their own: left aside to read the layer's.
    const own = ownContent(node);
    const bare = own.replace(/<Style\b[\s\S]*?<\/Style>/g, '').replace(/<Attribution\b[\s\S]*?<\/Attribution>/g, '');
    const projections = [...inherited.projections, ...values(own, 'CRS'), ...values(own, 'SRS')];
    const attribution = text(section(section(own, 'Attribution'), 'Title')) ?? inherited.attribution;
    const minScale = number(first(own, 'MinScaleDenominator')) ?? inherited.minScale;
    const maxScale = number(first(own, 'MaxScaleDenominator')) ?? inherited.maxScale;
    const name = text(first(bare, 'Name'));
    if (name) {
      if (WEB_MERCATOR.some((code) => projections.some((projection) => projection.toUpperCase() === code))) {
        layers.push({
          name,
          title: text(first(bare, 'Title')) ?? name,
          attribution,
          // Past the smallest scale the service draws, it draws nothing: the image is asked for at the zoom
          // where it still does, and drawn larger.
          dataMaxZoom: minScale ? Math.floor(Math.log2(SCALE_AT_ZOOM_0 / minScale)) : undefined,
          // Below the largest one, the same, the other way round.
          minZoom: maxScale ? Math.ceil(Math.log2(SCALE_AT_ZOOM_0 / maxScale)) : undefined,
        });
      } else {
        withoutWebMercator++;
      }
    }
    for (const child of node.children) visit(child, { projections, attribution, minScale, maxScale });
  };
  for (const node of root) visit(node, { projections: [], attribution: undefined });
  return { title: text(first(service, 'Title')), layers, withoutWebMercator };
}

/** The <Layer> elements of the document as a tree: each with its whole text, and its nested layers. */
function layerTree(document) {
  const roots = [];
  const stack = [];
  const tag = /<Layer\b[^>]*?(\/?)>|<\/Layer>/g;
  for (let match = tag.exec(document); match; match = tag.exec(document)) {
    if (match[0].startsWith('</')) {
      const node = stack.pop();
      if (!node) continue;
      node.text = document.slice(node.start, match.index);
      (stack.at(-1)?.children ?? roots).push(node);
    } else if (!match[1]) {
      stack.push({ start: match.index + match[0].length, children: [] });
    }
  }
  return roots;
}

/** The text of a layer without the text of the layers it holds: what belongs to it alone. */
function ownContent(node) {
  let own = node.text;
  for (const child of node.children) own = own.replace(child.text, '');
  return own.replace(/<Layer\b[^>]*>\s*<\/Layer>/g, '');
}

function section(xml, name) {
  return xml?.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '';
}

function first(xml, name) {
  return xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
}

function values(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, 'g'))].map(([, value]) => value.trim());
}

function number(value) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** The text of an element, its entities read and its CDATA unwrapped, or undefined when empty. */
function text(value) {
  if (value === undefined) return undefined;
  const written = value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (entity, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .trim();
  return written === '' ? undefined : written;
}

async function requestText(url) {
  const response = await request(url);
  if (!response.ok) throw new HttpError(url, response.status);
  return response.text();
}

/**
 * Layers of a WMS given by name, as the command line and the API take them, completed from the capabilities of
 * their service: the scales it draws them at. A name the service does not know is refused here, with the names
 * that come closest — the service would otherwise answer an error page in place of every image. Each service is
 * read once, however many of its layers are asked for. Other definitions pass as they are.
 */
export async function completeWmsDefinitions(definitions, { read = readCapabilities } = {}) {
  const services = new Map();
  const completed = [];
  for (const definition of definitions) {
    if (!definition.wmsLayers) {
      completed.push(definition);
      continue;
    }
    const service = serviceAddress(definition.url);
    if (!services.has(service)) services.set(service, read(service));
    const { layers } = await services.get(service);
    const found = layers.find(({ name }) => name === definition.wmsLayers);
    if (!found) {
      const wanted = definition.wmsLayers.toLowerCase();
      const close = layers
        .filter(({ name, title }) => `${name} ${title}`.toLowerCase().includes(wanted) || wanted.includes(name.toLowerCase()))
        .slice(0, 8)
        .map(({ name }) => name);
      throw new CapabilitiesError(
        `Le service ${new URL(service).host} n’a pas de couche « ${definition.wmsLayers} » qu’il sache dessiner ` +
          `pour une carte. ${close.length > 0 ? `Couches proches : ${close.join(', ')}.` : `Il en propose ${layers.length}.`}`,
      );
    }
    completed.push({
      ...definition,
      url: service,
      minZoom: definition.minZoom ?? found.minZoom,
      dataMaxZoom: definition.dataMaxZoom ?? found.dataMaxZoom,
    });
  }
  return completed;
}
