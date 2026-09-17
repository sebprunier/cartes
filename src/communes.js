// Recherche de communes et récupération de leur contour via la Géoplateforme (IGN).

import { requeteJson } from './http.js';

const GEOCODAGE_URL = 'https://data.geopf.fr/geocodage/search';
const WFS_URL = 'https://data.geopf.fr/wfs/ows';
const COUCHE_COMMUNES = 'ADMINEXPRESS-COG.LATEST:commune';

// Codes INSEE : 5 chiffres, ou 2A/2B suivis de 3 chiffres pour la Corse.
const CODE_INSEE_RE = /^(\d{5}|2[AB]\d{3})$/i;

export class CommuneIntrouvable extends Error {}

export function estCodeInsee(saisie) {
  return CODE_INSEE_RE.test(saisie.trim());
}

/** Nom sans accents, en minuscules, avec tirets et apostrophes remplacés par des espaces. */
export function normaliser(nom) {
  return nom
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-'’]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** Recherche des communes par nom avec l'API de géocodage de la Géoplateforme. */
export async function rechercherCommunes(nom, departement) {
  const url = new URL(GEOCODAGE_URL);
  url.search = new URLSearchParams({ q: nom, type: 'municipality', limit: 20 });
  const { features } = await requeteJson(url);
  const communes = features.map(({ properties: p }) => ({
    codeInsee: p.citycode,
    nom: p.name,
    codePostal: p.postcode ?? '',
    departement: p.depcode ?? '',
    contexte: p.context ?? '',
    population: p.population,
  }));
  if (!departement) return communes;
  return communes.filter((c) => c.departement.toUpperCase() === departement.toUpperCase());
}

/**
 * Retourne le code INSEE correspondant à la saisie (nom de commune ou code INSEE).
 * Lève CommuneIntrouvable si aucune ou plusieurs communes correspondent.
 */
export async function choisirCommune(saisie, departement) {
  if (estCodeInsee(saisie)) return saisie.trim().toUpperCase();

  const candidates = await rechercherCommunes(saisie, departement);
  const homonymes = candidates.filter((c) => normaliser(c.nom) === normaliser(saisie));
  const choix = homonymes.length > 0 ? homonymes : candidates;
  if (choix.length === 0) {
    throw new CommuneIntrouvable(`Aucune commune trouvée pour « ${saisie} ».`);
  }
  if (choix.length > 1) {
    throw new CommuneIntrouvable(
      `Plusieurs communes correspondent à « ${saisie} » :\n` +
        choix.map((c) => `  ${decrire(c)}`).join('\n') +
        '\nPrécisez le département (--departement) ou donnez directement le code INSEE.',
    );
  }
  return choix[0].codeInsee;
}

export function decrire(commune) {
  const population = commune.population ? `, ${commune.population} hab.` : '';
  return `${commune.codeInsee}  ${commune.nom} (${commune.codePostal}) — ${commune.contexte}${population}`;
}

/**
 * Récupère le contour d'une commune dans ADMIN EXPRESS (service WFS de la Géoplateforme).
 * Les polygones sont des listes d'anneaux, eux-mêmes des listes de points [lon, lat].
 */
export async function recupererContour(codeInsee) {
  if (!estCodeInsee(codeInsee)) throw new Error(`Code INSEE invalide : ${codeInsee}`);

  const url = new URL(WFS_URL);
  url.search = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: COUCHE_COMMUNES,
    OUTPUTFORMAT: 'application/json',
    CQL_FILTER: `code_insee='${codeInsee.toUpperCase()}'`,
  });
  const { features } = await requeteJson(url);
  if (features.length === 0) {
    throw new CommuneIntrouvable(`Aucun contour trouvé pour le code INSEE ${codeInsee}.`);
  }

  const [{ geometry, properties }] = features;
  let polygones;
  if (geometry.type === 'Polygon') polygones = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polygones = geometry.coordinates;
  else throw new Error(`Géométrie inattendue : ${geometry.type}`);

  return { codeInsee: properties.code_insee, nom: properties.nom_officiel, polygones };
}

/** Emprise [lonMin, latMin, lonMax, latMax] du contour. */
export function bbox(contour) {
  const emprise = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of contour.polygones.flat(2)) {
    emprise[0] = Math.min(emprise[0], lon);
    emprise[1] = Math.min(emprise[1], lat);
    emprise[2] = Math.max(emprise[2], lon);
    emprise[3] = Math.max(emprise[3], lat);
  }
  return emprise;
}
