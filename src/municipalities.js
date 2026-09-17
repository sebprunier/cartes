// Municipality (commune) search and boundary retrieval through the Géoplateforme (IGN).

import { requestJson } from './http.js';

const GEOCODING_URL = 'https://data.geopf.fr/geocodage/search';
const WFS_URL = 'https://data.geopf.fr/wfs/ows';
const MUNICIPALITIES_LAYER = 'ADMINEXPRESS-COG.LATEST:commune';

// INSEE codes: 5 digits, or 2A/2B followed by 3 digits for Corsica.
const INSEE_CODE_RE = /^(\d{5}|2[AB]\d{3})$/i;

export class MunicipalityNotFound extends Error {}

export function isInseeCode(input) {
  return INSEE_CODE_RE.test(input.trim());
}

/** Lowercase name without accents, with hyphens and apostrophes replaced by spaces. */
export function normalizeName(name) {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[-'’]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** Searches municipalities by name with the Géoplateforme geocoding API. */
export async function searchMunicipalities(name, department) {
  const url = new URL(GEOCODING_URL);
  url.search = new URLSearchParams({ q: name, type: 'municipality', limit: 20 });
  const { features } = await requestJson(url);
  const municipalities = features.map(({ properties: p }) => ({
    inseeCode: p.citycode,
    name: p.name,
    postcode: p.postcode ?? '',
    department: p.depcode ?? '',
    context: p.context ?? '',
    population: p.population,
  }));
  if (!department) return municipalities;
  return municipalities.filter((m) => m.department.toUpperCase() === department.toUpperCase());
}

/**
 * Returns the INSEE code matching the input (municipality name or INSEE code).
 * Throws MunicipalityNotFound when no municipality, or several of them, match.
 */
export async function resolveMunicipality(input, department) {
  if (isInseeCode(input)) return input.trim().toUpperCase();

  const candidates = await searchMunicipalities(input, department);
  const namesakes = candidates.filter((m) => normalizeName(m.name) === normalizeName(input));
  const matches = namesakes.length > 0 ? namesakes : candidates;
  if (matches.length === 0) {
    throw new MunicipalityNotFound(`Aucune commune trouvée pour « ${input} ».`);
  }
  if (matches.length > 1) {
    throw new MunicipalityNotFound(
      `Plusieurs communes correspondent à « ${input} » :\n` +
        matches.map((m) => `  ${describeMunicipality(m)}`).join('\n') +
        '\nPrécisez le département (--department) ou donnez directement le code INSEE.',
    );
  }
  return matches[0].inseeCode;
}

export function describeMunicipality(municipality) {
  const population = municipality.population ? `, ${municipality.population} hab.` : '';
  return (
    `${municipality.inseeCode}  ${municipality.name} (${municipality.postcode}) — ` +
    `${municipality.context}${population}`
  );
}

/**
 * Fetches a municipality boundary from ADMIN EXPRESS (Géoplateforme WFS service).
 * Polygons are lists of rings, which are lists of [lon, lat] points.
 */
export async function fetchBoundary(inseeCode) {
  if (!isInseeCode(inseeCode)) throw new Error(`Code INSEE invalide : ${inseeCode}`);

  const url = new URL(WFS_URL);
  url.search = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: MUNICIPALITIES_LAYER,
    OUTPUTFORMAT: 'application/json',
    CQL_FILTER: `code_insee='${inseeCode.toUpperCase()}'`,
  });
  const { features } = await requestJson(url);
  if (features.length === 0) {
    throw new MunicipalityNotFound(`Aucun contour trouvé pour le code INSEE ${inseeCode}.`);
  }

  const [{ geometry, properties }] = features;
  let polygons;
  if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
  else throw new Error(`Géométrie inattendue : ${geometry.type}`);

  return { inseeCode: properties.code_insee, name: properties.nom_officiel, polygons };
}

/** Bounding box [lonMin, latMin, lonMax, latMax] of the boundary. */
export function boundaryBbox(boundary) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of boundary.polygons.flat(2)) {
    bbox[0] = Math.min(bbox[0], lon);
    bbox[1] = Math.min(bbox[1], lat);
    bbox[2] = Math.max(bbox[2], lon);
    bbox[3] = Math.max(bbox[3], lat);
  }
  return bbox;
}
