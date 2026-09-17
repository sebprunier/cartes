// Calcul des tuiles couvrant une emprise et téléchargement (avec cache disque).

import { mkdir, rename, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

import { urlTuile } from './fonds.js';
import { ErreurHttp, requete } from './http.js';

export const TAILLE_TUILE = 256;
const RAYON_TERRE = 6378137; // mètres, sphère de la projection Web Mercator
const TENTATIVES = 4;
const ECHECS_CONSECUTIFS_MAX = 10;

/** Coordonnées en pixels dans l'image « monde » Web Mercator au niveau de zoom donné. */
export function lonLatVersPixel(lon, lat, zoom) {
  const tailleMonde = TAILLE_TUILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * tailleMonde;
  const y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * tailleMonde;
  return [x, y];
}

/** Taille réelle au sol (en mètres) d'un pixel à la latitude donnée. */
export function resolutionSol(lat, zoom) {
  return (2 * Math.PI * RAYON_TERRE * Math.cos((lat * Math.PI) / 180)) / (TAILLE_TUILE * 2 ** zoom);
}

/**
 * Fenêtre en pixels (bornes max exclues) dans l'image monde d'un niveau de zoom, couvrant
 * la bbox [lonMin, latMin, lonMax, latMax]. La marge est une fraction de la largeur/hauteur
 * ajoutée de chaque côté.
 */
export function empriseDepuisBbox([lonMin, latMin, lonMax, latMax], zoom, marge = 0) {
  const [x0, y0] = lonLatVersPixel(lonMin, latMax, zoom);
  const [x1, y1] = lonLatVersPixel(lonMax, latMin, zoom);
  const margeX = (x1 - x0) * marge;
  const margeY = (y1 - y0) * marge;
  const emprise = {
    zoom,
    xMin: Math.floor(x0 - margeX),
    yMin: Math.floor(y0 - margeY),
    xMax: Math.ceil(x1 + margeX),
    yMax: Math.ceil(y1 + margeY),
  };
  emprise.largeur = emprise.xMax - emprise.xMin;
  emprise.hauteur = emprise.yMax - emprise.yMin;
  emprise.tuiles = {
    xMin: Math.floor(emprise.xMin / TAILLE_TUILE),
    yMin: Math.floor(emprise.yMin / TAILLE_TUILE),
    xMax: Math.floor((emprise.xMax - 1) / TAILLE_TUILE),
    yMax: Math.floor((emprise.yMax - 1) / TAILLE_TUILE),
  };
  emprise.nombreTuiles =
    (emprise.tuiles.xMax - emprise.tuiles.xMin + 1) * (emprise.tuiles.yMax - emprise.tuiles.yMin + 1);
  return emprise;
}

/** Indices {x, y} des tuiles qui recouvrent l'emprise. */
export function* tuilesDeLEmprise(emprise) {
  const { xMin, yMin, xMax, yMax } = emprise.tuiles;
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) yield { x, y };
  }
}

/**
 * Télécharge les tuiles de l'emprise et retourne la liste {x, y, chemin, erreur} des tuiles.
 * Une tuile absente (404, hors couverture du fond) a un chemin null ; une tuile qui échoue malgré
 * les nouvelles tentatives a un chemin null et une erreur, sans interrompre les autres.
 * Le téléchargement est abandonné si trop de tuiles échouent d'affilée (réseau coupé, service en panne).
 */
export async function telechargerTuiles(fond, emprise, dossierCache, paralleles, progression) {
  const tuiles = [...tuilesDeLEmprise(emprise)];
  let prochaine = 0;
  let faites = 0;
  let echecsConsecutifs = 0;
  let derniereErreur;

  async function travailleur() {
    while (prochaine < tuiles.length && echecsConsecutifs < ECHECS_CONSECUTIFS_MAX) {
      const tuile = tuiles[prochaine++];
      const chemin = path.join(dossierCache, fond.identifiant, String(emprise.zoom), String(tuile.x), `${tuile.y}.tuile`);
      try {
        tuile.chemin = await telechargerTuile(urlTuile(fond, emprise.zoom, tuile.x, tuile.y), chemin);
        echecsConsecutifs = 0;
      } catch (erreur) {
        tuile.chemin = null;
        tuile.erreur = derniereErreur = erreur;
        echecsConsecutifs++;
      }
      progression?.(++faites, tuiles.length);
    }
  }

  await Promise.all(Array.from({ length: paralleles }, travailleur));
  if (echecsConsecutifs >= ECHECS_CONSECUTIFS_MAX) {
    throw new Error(
      `Téléchargement interrompu après ${ECHECS_CONSECUTIFS_MAX} tuiles en échec d'affilée. ` +
        'Relancez la commande plus tard : les tuiles déjà téléchargées sont en cache.',
      { cause: derniereErreur },
    );
  }
  return tuiles;
}

async function telechargerTuile(url, chemin) {
  if (await existe(chemin)) return chemin;

  for (let tentative = 1; ; tentative++) {
    let reponse;
    try {
      reponse = await requete(url);
    } catch (erreur) {
      if (tentative === TENTATIVES) throw erreur;
      await pause(2 ** (tentative - 1) * 1000);
      continue;
    }

    if (reponse.ok && reponse.headers.get('content-type')?.startsWith('image/')) {
      await mkdir(path.dirname(chemin), { recursive: true });
      const temporaire = `${chemin}.tmp`;
      await writeFile(temporaire, Buffer.from(await reponse.arrayBuffer()));
      await rename(temporaire, chemin);
      return chemin;
    }

    await reponse.body?.cancel();
    // Tuile hors couverture du fond, mais la Géoplateforme renvoie aussi des 404 passagères :
    // on réessaie une fois avant de considérer la tuile absente.
    if (reponse.status === 404 && tentative >= 2) return null;
    // Les autres erreurs sont souvent passagères elles aussi (400, 429, 5xx…) : on réessaie.
    if (tentative === TENTATIVES) {
      throw reponse.ok ? new Error(`La réponse n'est pas une image : ${url}`) : new ErreurHttp(url, reponse.status);
    }
    await pause(2 ** (tentative - 1) * 1000);
  }
}

async function existe(chemin) {
  try {
    await access(chemin);
    return true;
  } catch {
    return false;
  }
}

function pause(ms) {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}
