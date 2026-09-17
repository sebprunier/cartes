// Assemblage des tuiles en une image unique, tracé du contour et formats d'impression.

import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { TAILLE_TUILE, lonLatVersPixel } from './tuiles.js';

const CANAUX = 3;
const COULEUR_CONTOUR = 'rgb(200, 30, 90)';
// Coefficients de luminance (Rec. 601) : le gris reste sur 3 canaux pour garder le contour en couleur.
const LUMINANCE = [0.299, 0.587, 0.114];
// librsvg refuse les SVG de plus de 32 767 px de côté : les surcouches sont dessinées par blocs.
const TAILLE_BLOC = 4096;

// Formats ISO 216 [nom, petit côté, grand côté] en millimètres, du plus petit au plus grand.
const FORMATS_PAPIER = [
  ['A4', 210, 297],
  ['A3', 297, 420],
  ['A2', 420, 594],
  ['A1', 594, 841],
  ['A0', 841, 1189],
  ['2A0', 1189, 1682],
  ['4A0', 1682, 2378],
];

/**
 * Recolle les tuiles dans un tampon de pixels RVB bruts aux dimensions exactes de l'emprise.
 * Les tuiles manquantes restent blanches.
 */
export async function assembler(emprise, tuiles, { gris = false } = {}) {
  const { largeur, hauteur } = emprise;
  const pixels = Buffer.alloc(largeur * hauteur * CANAUX, 255);
  let manquantes = 0;

  for (const { x, y, chemin } of tuiles) {
    if (!chemin) {
      manquantes++;
      continue;
    }
    let tuile;
    try {
      let decodage = sharp(chemin).flatten({ background: '#ffffff' }).toColourspace('srgb');
      if (gris) decodage = decodage.recomb([LUMINANCE, LUMINANCE, LUMINANCE]);
      tuile = await decodage.raw().toBuffer({ resolveWithObject: true });
    } catch {
      // Fichier de cache corrompu : on le supprime pour qu'il soit retéléchargé.
      await rm(chemin, { force: true });
      manquantes++;
      continue;
    }
    copierPixels(tuile, pixels, x * TAILLE_TUILE - emprise.xMin, y * TAILLE_TUILE - emprise.yMin, largeur, hauteur);
  }
  return { pixels, manquantes };
}

/** Copie des pixels bruts à la position (dx, dy) de l'image, en rognant ce qui dépasse. */
function copierPixels({ data, info }, pixels, dx, dy, largeur, hauteur) {
  if (info.channels !== CANAUX) throw new Error(`Pixels à ${info.channels} canaux, ${CANAUX} attendus.`);
  const colonneDebut = Math.max(0, -dx);
  const colonneFin = Math.min(info.width, largeur - dx);
  if (colonneFin <= colonneDebut) return;
  for (let ligne = Math.max(0, -dy); ligne < info.height && dy + ligne < hauteur; ligne++) {
    data.copy(
      pixels,
      ((dy + ligne) * largeur + dx + colonneDebut) * CANAUX,
      (ligne * info.width + colonneDebut) * CANAUX,
      (ligne * info.width + colonneFin) * CANAUX,
    );
  }
}

/** Tracé SVG du contour de la commune, en pixels de l'image, épaisseur proportionnelle à sa taille. */
export function traceContour(contour, emprise) {
  const epaisseur = Math.max(3, Math.round(Math.max(emprise.largeur, emprise.hauteur) / 800));
  const trace = contour.polygones
    .flat()
    .map((anneau) => {
      const points = anneau.map(([lon, lat]) => {
        const [px, py] = lonLatVersPixel(lon, lat, emprise.zoom);
        return `${(px - emprise.xMin).toFixed(1)},${(py - emprise.yMin).toFixed(1)}`;
      });
      return `M${points.join('L')}Z`;
    })
    .join('');
  return `<path d="${trace}" fill="none" stroke="${COULEUR_CONTOUR}" stroke-width="${epaisseur}" stroke-linejoin="round"/>`;
}

/** Dessine des éléments SVG (en pixels de l'image) directement dans les pixels, bloc par bloc. */
export async function dessinerSurcouches(pixels, emprise, elementsSvg) {
  const { largeur, hauteur } = emprise;
  const source = { raw: { width: largeur, height: hauteur, channels: CANAUX }, limitInputPixels: false };
  for (let top = 0; top < hauteur; top += TAILLE_BLOC) {
    for (let left = 0; left < largeur; left += TAILLE_BLOC) {
      const width = Math.min(TAILLE_BLOC, largeur - left);
      const height = Math.min(TAILLE_BLOC, hauteur - top);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
        `viewBox="${left} ${top} ${width} ${height}">${elementsSvg.join('')}</svg>`;
      const bloc = await sharp(pixels, source)
        .extract({ left, top, width, height })
        .composite([{ input: Buffer.from(svg) }])
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      copierPixels(bloc, pixels, left, top, largeur, hauteur);
    }
  }
}

/** Enregistre l'image ; le format dépend de l'extension (.png, .jpg ou .tif). */
export async function enregistrer(pixels, emprise, sortie, { dpi }) {
  let image = sharp(pixels, {
    raw: { width: emprise.largeur, height: emprise.hauteur, channels: CANAUX },
    limitInputPixels: false,
  });

  const extension = path.extname(sortie).toLowerCase();
  if (extension === '.png') image = image.png();
  else if (extension === '.jpg' || extension === '.jpeg') image = image.jpeg({ quality: 92 });
  else if (extension === '.tif' || extension === '.tiff') image = image.tiff({ compression: 'lzw' });
  else throw new Error(`Format de sortie non géré : ${extension} (utilisez .png, .jpg ou .tif)`);

  await mkdir(path.dirname(sortie), { recursive: true });
  await image.withDensity(dpi).toFile(sortie);
}

export function tailleImpressionMm(largeurPx, hauteurPx, dpi) {
  return [(largeurPx / dpi) * 25.4, (hauteurPx / dpi) * 25.4];
}

/** Plus petit format ISO dans lequel tient l'image (en portrait ou en paysage). */
export function formatPapier(largeurMm, hauteurMm) {
  const [petit, grand] = [largeurMm, hauteurMm].sort((a, b) => a - b);
  const format = FORMATS_PAPIER.find(([, cotePetit, coteGrand]) => petit <= cotePetit && grand <= coteGrand);
  return format ? format[0] : '> 4A0';
}
