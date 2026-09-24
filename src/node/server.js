// HTTP API: the services of the command line, for other software. Paths and fields are in French, like the
// commands and options, and accept the same English aliases. Generating a map takes from seconds to minutes
// and gives a file of up to tens of megabytes: a map is asked for, then followed, then downloaded, so that no
// request waits for the end behind a proxy that would cut it.

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { BASEMAPS } from '../core/basemaps.js';
import { formatBytes, imageMemory } from '../core/estimates.js';
import { LayerError, readLayer } from '../core/layers.js';
import { MAP_LAYERS, MapLayerError, chooseMapLayers } from '../core/maplayers.js';
import { MunicipalityNotFound, searchMunicipalities } from '../core/municipalities.js';
import { paperFormat, printSizeMm } from '../core/print.js';
import { extentFromBbox, groundResolution } from '../core/tiles.js';
import { REQUEST_FIELDS } from './api-fields.js';
import { estimateMapFileSize, generateMap, mapFileName, planMap } from './generate.js';
import { openApi } from './openapi.js';

const OUTPUT_FORMATS = { png: 'png', jpg: 'jpg', jpeg: 'jpg', tif: 'tif', tiff: 'tif' };
const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', tif: 'image/tiff' };
const MAX_BODY_BYTES = 20 * 1024 * 1024;

// Paths, by their French name, with their English alias.
const ROUTES = {
  communes: 'municipalities',
  fonds: 'basemaps',
  couches: 'maplayers',
  estimations: 'estimates',
  cartes: 'maps',
  fichier: 'file',
};
const FRENCH_ROUTES = Object.fromEntries(Object.entries(ROUTES).map(([french, english]) => [english, french]));

const LAYER_FIELDS = { id: 'id', opacite: 'opacity' };
const CUSTOM_LAYER_FIELDS = { adresse: 'url', nom: 'name', source: 'attribution', opacite: 'opacity' };
const DATA_FIELDS = { fichier: 'fileName', titre: 'title', contenu: 'content' };

/** An error of the request, told to the client as is, with its HTTP status. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Creates the HTTP server of the API. Nothing is limited by default: `maxZoom` lowers the highest zoom
 * accepted, `apiKey` reserves the API to whoever has the key. `maxGenerations` maps are generated at once,
 * the next ones wait their turn: the memory of a map is about four times that of its image. A generated map
 * is kept `retentionMs`, then removed with its file.
 */
export function createApiServer({
  cacheDir,
  outputDir,
  version,
  apiKey,
  maxZoom = Infinity,
  maxGenerations = 1,
  retentionMs = 60 * 60 * 1000,
  concurrency = 6,
}) {
  const maps = new Map();
  const queue = [];
  let running = 0;
  const context = { cacheDir, outputDir, version, apiKey, maxZoom, concurrency, maps, queue, schedule, expireLater };

  function schedule() {
    while (running < maxGenerations && queue.length > 0) {
      const map = queue.shift();
      running++;
      run(map, context)
        .catch(() => {})
        .finally(() => {
          running--;
          expireLater(map);
          schedule();
        });
    }
  }

  function expireLater(map) {
    map.expiresAt = new Date(Date.now() + retentionMs);
    setTimeout(() => remove(map, context), retentionMs).unref();
  }

  const server = http.createServer((request, response) => {
    handle(request, response, context).catch((error) => sendError(response, error));
  });
  server.on('close', () => {
    for (const map of maps.values()) map.controller.abort();
  });
  return server;
}

async function handle(request, response, context) {
  const url = new URL(request.url, 'http://localhost');
  // Integrating the API into a web page is allowed from any site: the key, when there is one, is what
  // protects it, and it travels in a header that browsers never send on their own.
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, DELETE',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return response.end();
  }

  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => FRENCH_ROUTES[segment] ?? decodeURIComponent(segment));
  const route = `${request.method} /${segments.map((segment, index) => (index === 1 ? ':id' : segment)).join('/')}`;

  // The description of the API is public: it says how to get in, not what is inside.
  if (route === 'GET /') return sendJson(response, 200, home(context));
  if (route === 'GET /openapi.json') return sendJson(response, 200, openApi(context.version));
  checkKey(request, context.apiKey);

  switch (route) {
    case 'GET /communes':
      return sendJson(response, 200, await municipalities(url.searchParams));
    case 'GET /fonds':
      return sendJson(response, 200, basemaps());
    case 'GET /couches':
      return sendJson(response, 200, mapLayers());
    case 'POST /estimations':
      return sendJson(response, 200, await estimate(await readBody(request), context));
    case 'POST /cartes':
      return sendJson(response, 202, await createMap(await readBody(request), context, response));
    case 'GET /cartes/:id':
      return sendJson(response, 200, mapStatus(findMap(segments[1], context)));
    case 'GET /cartes/:id/fichier':
      return sendFile(response, findMap(segments[1], context));
    case 'DELETE /cartes/:id':
      return sendJson(response, 200, mapStatus(await cancel(findMap(segments[1], context), context)));
    default:
      throw new ApiError(404, `Aucun service à cette adresse : ${request.method} ${url.pathname}.`);
  }
}

function home({ version, apiKey }) {
  return {
    nom: 'cartes',
    version,
    description: "Cartes détaillées des communes françaises, prêtes à imprimer en grand format.",
    cleRequise: Boolean(apiKey),
    documentation: 'https://sebprunier.github.io/cartes/api.html',
    openapi: '/openapi.json',
  };
}

function checkKey(request, apiKey) {
  if (!apiKey) return;
  const given = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? '';
  // Compared through their digests, so that the comparison takes the same time whatever the key given.
  const digest = (key) => createHash('sha256').update(key).digest();
  if (!timingSafeEqual(digest(given), digest(apiKey))) {
    throw new ApiError(401, "Clé d'API absente ou invalide : envoyez-la dans l'en-tête Authorization: Bearer <clé>.");
  }
}

async function municipalities(params) {
  const name = params.get('nom') ?? params.get('name');
  if (!name?.trim()) throw new ApiError(400, 'Le paramètre nom est obligatoire, par exemple /communes?nom=Colombiers.');
  const department = params.get('departement') ?? params.get('department') ?? undefined;
  const found = await searchMunicipalities(name, department);
  return found.map((m) => ({
    codeInsee: m.inseeCode,
    nom: m.name,
    codePostal: m.postcode,
    departement: m.department,
    contexte: m.context,
    population: m.population ?? null,
  }));
}

function basemaps() {
  return Object.values(BASEMAPS).map((basemap) => ({
    id: basemap.id,
    nom: basemap.name,
    zoomMax: basemap.maxZoom,
    format: basemap.outputFormat,
    source: basemap.attribution,
  }));
}

function mapLayers() {
  return Object.values(MAP_LAYERS).map((layer) => ({
    id: layer.id,
    nom: layer.name,
    description: layer.description,
    theme: layer.theme,
    fournisseur: layer.provider,
    zoomMin: layer.minZoom,
    opacite: layer.opacity,
    source: layer.attribution,
  }));
}

/**
 * The table of `cartes generer --estimer`: for each zoom level, the size of the image, of the print and of the
 * memory. The weight of the file is estimated for the zoom asked for only, from a sample of its tiles.
 */
async function estimate(body, context) {
  const request = await resolveRequest(body, context);
  const { basemap, zoom, margin, dpi, format, grayscale } = request;
  const { boundary, bbox, extent, warnings } = request.plan;
  const latitude = (bbox[1] + bbox[3]) / 2;

  const zooms = [];
  for (let level = Math.max(0, Math.min(zoom, basemap.maxZoom - 6)); level <= basemap.maxZoom; level++) {
    const levelExtent = extentFromBbox(bbox, level, margin);
    const [widthMm, heightMm] = printSizeMm(levelExtent.width, levelExtent.height, dpi);
    zooms.push({
      zoom: level,
      metresParPixel: Number(groundResolution(latitude, level).toFixed(2)),
      largeur: levelExtent.width,
      hauteur: levelExtent.height,
      tuiles: levelExtent.tileCount,
      impression: { largeurMm: Math.round(widthMm), hauteurMm: Math.round(heightMm), format: paperFormat(widthMm, heightMm) },
      memoire: imageMemory(levelExtent),
      memoireLisible: formatBytes(imageMemory(levelExtent)),
    });
  }

  let weight = null;
  try {
    const size = await estimateMapFileSize({
      basemap,
      extent,
      mapLayers: request.mapLayers,
      format,
      grayscale,
      cacheDir: context.cacheDir,
      concurrency: context.concurrency,
    });
    if (size !== undefined) weight = Math.round(size);
  } catch {
    // Sample unavailable (network, service error): the estimate is only informative.
  }

  return {
    commune: { codeInsee: boundary.inseeCode, nom: boundary.name },
    zoom,
    dpi,
    format,
    poids: weight,
    poidsLisible: weight === null ? null : `≈ ${formatBytes(weight)}`,
    niveaux: zooms,
    avertissements: warnings,
  };
}

async function createMap(body, context, response) {
  const request = await resolveRequest(body, context);
  const { boundary, extent, warnings } = request.plan;
  const id = randomUUID();
  const map = {
    id,
    request,
    status: 'en attente',
    createdAt: new Date(),
    extent,
    fileName: `${mapFileName({ ...request, boundary })}.${request.format}`,
    filePath: path.join(context.outputDir, `${id}.${request.format}`),
    steps: [],
    progress: {},
    warnings: [...warnings],
    controller: new AbortController(),
  };
  context.maps.set(id, map);
  context.queue.push(map);
  context.schedule();
  response.setHeader('Location', `/cartes/${id}`);
  return mapStatus(map);
}

async function run(map, { cacheDir, outputDir, concurrency }) {
  map.status = 'en cours';
  map.startedAt = new Date();
  const { request } = map;
  try {
    await mkdir(outputDir, { recursive: true });
    const result = await generateMap(
      {
        basemap: request.basemap,
        extent: map.extent,
        boundary: request.plan.boundary,
        layers: request.layers,
        mapLayers: request.mapLayers,
        outline: request.outline,
        legend: request.legend,
        grayscale: request.grayscale,
        dpi: request.dpi,
        format: request.format,
        outputPath: map.filePath,
        cacheDir,
        concurrency,
      },
      {
        // The path of the file on the server is none of the client's business: it knows the map by its name.
        onStep: (message) => map.steps.push(message.trim().replace(map.filePath, map.fileName)),
        onProgress: ({ sourceId, done, total, missing }) =>
          (map.progress[sourceId] = { fait: done, total, ...(missing === undefined ? {} : { manquantes: missing }) }),
        signal: map.controller.signal,
      },
    );
    if (map.status === 'annulée') return rm(map.filePath, { force: true });
    map.warnings.push(...result.warnings);
    if (result.missing > 0) {
      map.warnings.push(`${result.missing} tuile(s) indisponible(s), laissée(s) en blanc : redemandez la carte pour réessayer.`);
    }
    if (result.updateDatesMissing) {
      map.warnings.push(
        'Date de mise à jour des données indisponible dans le catalogue de la Géoplateforme. ' +
          'La licence des données IGN demande de la mentionner : redemandez la carte plus tard.',
      );
    }
    map.size = (await stat(map.filePath)).size;
    map.status = 'terminée';
  } catch (error) {
    await rm(map.filePath, { force: true });
    if (map.status === 'annulée') return;
    map.status = 'échouée';
    map.error = error.message;
    throw error;
  } finally {
    map.endedAt = new Date();
  }
}

async function cancel(map, context) {
  if (map.status === 'en attente') {
    context.queue.splice(context.queue.indexOf(map), 1);
    map.status = 'annulée';
    map.endedAt = new Date();
    context.expireLater(map);
  } else if (map.status === 'en cours') {
    map.status = 'annulée';
    map.controller.abort();
  } else {
    await remove(map, context);
    map.status = 'supprimée';
  }
  return map;
}

async function remove(map, { maps }) {
  maps.delete(map.id);
  await rm(map.filePath, { force: true });
}

function findMap(id, { maps }) {
  const map = maps.get(id);
  if (!map) throw new ApiError(404, `Aucune carte ${id} : elle n'a jamais existé, ou elle a expiré.`);
  return map;
}

/** What a client sees of a map: where it stands, and where to download it once it is ready. */
function mapStatus(map) {
  const done = map.status === 'terminée';
  return {
    id: map.id,
    statut: map.status,
    fichier: done ? `/cartes/${map.id}/fichier` : null,
    nomFichier: map.fileName,
    poids: map.size ?? null,
    largeur: map.extent.width,
    hauteur: map.extent.height,
    avancement: map.progress,
    etapes: map.steps,
    avertissements: map.warnings,
    erreur: map.error ?? null,
    creation: map.createdAt,
    debut: map.startedAt ?? null,
    fin: map.endedAt ?? null,
    expiration: map.expiresAt ?? null,
  };
}

function sendFile(response, map) {
  if (map.status !== 'terminée') {
    throw new ApiError(409, `La carte n'est pas prête : elle est ${map.status}. Suivez-la sur /cartes/${map.id}.`);
  }
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[map.request.format],
    'Content-Length': map.size,
    // The name carries accents: the plain form is kept for old clients, the encoded one for the others.
    'Content-Disposition':
      `attachment; filename="${map.fileName.normalize('NFKD').replace(/[^\x20-\x7e]/g, '')}"; ` +
      `filename*=UTF-8''${encodeURIComponent(map.fileName)}`,
  });
  createReadStream(map.filePath).pipe(response);
}

/**
 * Reads a map request — the options of `cartes generer` as JSON fields — and resolves it into what the
 * generation takes: the basemap, the layers, the data, and the plan of the map.
 */
export async function resolveRequest(body, { maxZoom = Infinity } = {}) {
  const fields = normalizeFields(body, REQUEST_FIELDS, 'la demande');

  if (typeof fields.municipality !== 'string' || !fields.municipality.trim()) {
    throw new ApiError(400, 'Le champ commune est obligatoire : un nom de commune ou un code INSEE.');
  }
  const basemapId = fields.basemap ?? 'plan-ign';
  const basemap = BASEMAPS[basemapId];
  if (!basemap) {
    throw new ApiError(400, `Fond inconnu : ${basemapId}. Fonds disponibles : ${Object.keys(BASEMAPS).join(', ')}.`);
  }
  const highest = Math.min(basemap.maxZoom, maxZoom);
  const zoom = integerField(fields.zoom ?? 17, 'zoom', 0, highest);
  const dpi = integerField(fields.dpi ?? 150, 'dpi', 1);
  const margin = fields.margin ?? 0.03;
  if (typeof margin !== 'number' || !(margin >= 0)) throw new ApiError(400, 'Le champ marge doit être un nombre positif.');
  const formatName = fields.format ?? basemap.outputFormat;
  const format = typeof formatName === 'string' ? OUTPUT_FORMATS[formatName.toLowerCase()] : undefined;
  if (!format) throw new ApiError(400, `Format inconnu : ${formatName}. Formats disponibles : png, jpg, tif.`);
  const grayscale = booleanField(fields.grayscale, 'gris', false);
  const outline = booleanField(fields.outline, 'contour', true);
  const legend = booleanField(fields.legend, 'legende', true);

  let mapLayers;
  try {
    mapLayers = chooseMapLayers([
      ...listField(fields.maplayers, 'couches').map((layer) =>
        typeof layer === 'string' ? { id: layer } : normalizeFields(layer, LAYER_FIELDS, 'une couche'),
      ),
      ...listField(fields.customLayers, 'couchesPerso').map((layer) =>
        normalizeFields(layer, CUSTOM_LAYER_FIELDS, 'une couche ajoutée par son adresse'),
      ),
    ]);
  } catch (error) {
    throw error instanceof MapLayerError ? new ApiError(400, error.message) : error;
  }

  const layers = listField(fields.data, 'donnees').map((entry, index) => {
    const { fileName, title, content } = normalizeFields(entry, DATA_FIELDS, 'un fichier de données');
    if (typeof fileName !== 'string' || typeof content !== 'string') {
      throw new ApiError(400, 'Chaque fichier de données porte son nom (fichier) et son contenu en texte (contenu).');
    }
    try {
      return readLayer(content, {
        fileName,
        name: title,
        index,
        categoryProperty: fields.dataCategory,
        colorProperty: fields.dataColor,
      });
    } catch (error) {
      throw error instanceof LayerError ? new ApiError(400, `${fileName} : ${error.message}`) : error;
    }
  });

  let plan;
  try {
    plan = await planMap({
      municipality: fields.municipality,
      department: fields.department,
      zoom,
      margin,
      mapLayers,
      layers,
    });
  } catch (error) {
    if (error instanceof MunicipalityNotFound || error instanceof MapLayerError) throw new ApiError(400, error.message);
    throw error;
  }
  return { basemap, zoom, dpi, margin, format, grayscale, outline, legend, mapLayers, layers, plan };
}

/** The fields of an object, by their English name, whichever name they were given: unknown ones are refused. */
function normalizeFields(value, names, what) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(400, `Objet JSON attendu pour ${what}.`);
  }
  const english = new Set(Object.values(names));
  const fields = {};
  for (const [name, fieldValue] of Object.entries(value)) {
    const key = names[name] ?? (english.has(name) ? name : undefined);
    if (!key) {
      throw new ApiError(400, `Champ inconnu dans ${what} : ${name}. Champs possibles : ${Object.keys(names).join(', ')}.`);
    }
    fields[key] = fieldValue;
  }
  return fields;
}

function integerField(value, name, min, max = Infinity) {
  if (!Number.isInteger(value) || value < min || value > max) {
    const bounds = max === Infinity ? `supérieur ou égal à ${min}` : `compris entre ${min} et ${max}`;
    throw new ApiError(400, `Le champ ${name} doit être un entier ${bounds}.`);
  }
  return value;
}

function booleanField(value, name, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') throw new ApiError(400, `Le champ ${name} vaut true ou false.`);
  return value;
}

function listField(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ApiError(400, `Le champ ${name} est une liste.`);
  return value;
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      throw new ApiError(413, `Demande trop volumineuse : au-delà de ${formatBytes(MAX_BODY_BYTES)}.`);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Le corps de la demande doit être un objet JSON.');
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendError(response, error) {
  if (response.headersSent) return response.destroy();
  const status = error instanceof ApiError ? error.status : 500;
  const cause = error.cause ? ` (${error.cause.message ?? error.cause})` : '';
  sendJson(response, status, { erreur: `${error.message}${status === 500 ? cause : ''}` });
}
