// Assembles tiles into a single image, draws overlays and computes print formats.

import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { TILE_SIZE, lonLatToPixel } from './tiles.js';

export const CHANNELS = 3;
const OUTLINE_COLOR = 'rgb(200, 30, 90)';
const ATTRIBUTION_COLOR = '#333333';
// Luminance coefficients (Rec. 601): grayscale stays on 3 channels so overlays keep their colors.
const LUMINANCE = [0.299, 0.587, 0.114];
// librsvg rejects SVGs larger than 32,767 px on a side: overlays are drawn block by block.
const BLOCK_SIZE = 4096;

// ISO 216 formats [name, short side, long side] in millimeters, from smallest to largest.
const PAPER_FORMATS = [
  ['A4', 210, 297],
  ['A3', 297, 420],
  ['A2', 420, 594],
  ['A1', 594, 841],
  ['A0', 841, 1189],
  ['2A0', 1189, 1682],
  ['4A0', 1682, 2378],
];

/**
 * Stitches the tiles into a raw RGB pixel buffer with the exact dimensions of the extent.
 * Missing tiles are left white.
 */
export async function assembleTiles(extent, tiles, { grayscale = false } = {}) {
  const { width, height } = extent;
  const pixels = Buffer.alloc(width * height * CHANNELS, 255);
  let missing = 0;

  for (const { x, y, path: tilePath } of tiles) {
    if (!tilePath) {
      missing++;
      continue;
    }
    let tile;
    try {
      let decoding = sharp(tilePath).flatten({ background: '#ffffff' }).toColourspace('srgb');
      if (grayscale) decoding = decoding.recomb([LUMINANCE, LUMINANCE, LUMINANCE]);
      tile = await decoding.raw().toBuffer({ resolveWithObject: true });
    } catch {
      // Corrupted cache file: delete it so that it gets downloaded again.
      await rm(tilePath, { force: true });
      missing++;
      continue;
    }
    copyPixels(tile, pixels, x * TILE_SIZE - extent.xMin, y * TILE_SIZE - extent.yMin, width, height);
  }
  return { pixels, missing };
}

/** Copies raw pixels at position (dx, dy) of the image, cropping whatever overflows. */
function copyPixels({ data, info }, pixels, dx, dy, width, height) {
  if (info.channels !== CHANNELS) throw new Error(`Pixels à ${info.channels} canaux, ${CHANNELS} attendus.`);
  const firstColumn = Math.max(0, -dx);
  const endColumn = Math.min(info.width, width - dx);
  if (endColumn <= firstColumn) return;
  for (let row = Math.max(0, -dy); row < info.height && dy + row < height; row++) {
    data.copy(
      pixels,
      ((dy + row) * width + dx + firstColumn) * CHANNELS,
      (row * info.width + firstColumn) * CHANNELS,
      (row * info.width + endColumn) * CHANNELS,
    );
  }
}

/** SVG path of the municipality boundary, in image pixels, with a width proportional to the image size. */
export function boundaryOutline(boundary, extent) {
  const strokeWidth = Math.max(3, Math.round(Math.max(extent.width, extent.height) / 800));
  const pathData = boundary.polygons
    .flat()
    .map((ring) => {
      const points = ring.map(([lon, lat]) => {
        const [px, py] = lonLatToPixel(lon, lat, extent.zoom);
        return `${(px - extent.xMin).toFixed(1)},${(py - extent.yMin).toFixed(1)}`;
      });
      return `M${points.join('L')}Z`;
    })
    .join('');
  return `<path d="${pathData}" fill="none" stroke="${OUTLINE_COLOR}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;
}

/**
 * Text crediting the data sources with the date of their most recent update, as required by the IGN open licence,
 * followed by the generation date of the map.
 */
export function attributionText({ sources, date = new Date() }) {
  const credits = sources.map(({ attribution, updateDate }) =>
    updateDate ? `${attribution} (mise à jour du ${frenchDate(updateDate)})` : attribution,
  );
  return `Sources : ${credits.join(' ; ')} · Carte générée le ${date.toLocaleDateString('fr-FR')}`;
}

/** YYYY-MM-DD date written as DD/MM/YYYY, without time zone conversion. */
function frenchDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * SVG elements showing a text in the bottom right corner of the image, on a light background.
 * The text is rendered by sharp so that the background fits its actual size; its size is proportional
 * to the image size, so that it stays readable wherever the image is scaled to when printed.
 * Long texts wrap at 60 % of the image width.
 */
export async function attributionLabel(text, extent) {
  const fontSize = Math.max(12, Math.round(Math.max(extent.width, extent.height) / 150));
  const padding = Math.round(fontSize / 2);
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${ATTRIBUTION_COLOR}">${escapeMarkup(text)}</span>`,
      font: `sans ${fontSize}`,
      width: Math.round(extent.width * 0.6),
      wrap: 'word',
      dpi: 72,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });

  const boxWidth = info.width + 2 * padding;
  const boxHeight = info.height + 2 * padding;
  const x = extent.width - boxWidth - padding;
  const y = extent.height - boxHeight - padding;
  return (
    `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" fill="white" fill-opacity="0.85"/>` +
    `<image x="${x + padding}" y="${y + padding}" width="${info.width}" height="${info.height}" ` +
    `href="data:image/png;base64,${data.toString('base64')}"/>`
  );
}

function escapeMarkup(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Draws SVG elements (in image pixels) directly into the pixels, block by block. */
export async function drawOverlays(pixels, extent, svgElements) {
  const { width, height } = extent;
  const source = { raw: { width, height, channels: CHANNELS }, limitInputPixels: false };
  for (let top = 0; top < height; top += BLOCK_SIZE) {
    for (let left = 0; left < width; left += BLOCK_SIZE) {
      const blockWidth = Math.min(BLOCK_SIZE, width - left);
      const blockHeight = Math.min(BLOCK_SIZE, height - top);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${blockWidth}" height="${blockHeight}" ` +
        `viewBox="${left} ${top} ${blockWidth} ${blockHeight}">${svgElements.join('')}</svg>`;
      const block = await sharp(pixels, source)
        .extract({ left, top, width: blockWidth, height: blockHeight })
        .composite([{ input: Buffer.from(svg) }])
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      copyPixels(block, pixels, left, top, width, height);
    }
  }
}

/** Saves the image; the format depends on the extension (.png, .jpg or .tif). */
export async function saveImage(pixels, extent, outputPath, { dpi }) {
  let image = sharp(pixels, {
    raw: { width: extent.width, height: extent.height, channels: CHANNELS },
    limitInputPixels: false,
  });

  const extension = path.extname(outputPath).toLowerCase();
  if (extension === '.png') image = image.png();
  else if (extension === '.jpg' || extension === '.jpeg') image = image.jpeg({ quality: 92 });
  else if (extension === '.tif' || extension === '.tiff') image = image.tiff({ compression: 'lzw' });
  else throw new Error(`Format de sortie non géré : ${extension} (utilisez .png, .jpg ou .tif)`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await image.withDensity(dpi).toFile(outputPath);
}

export function printSizeMm(widthPx, heightPx, dpi) {
  return [(widthPx / dpi) * 25.4, (heightPx / dpi) * 25.4];
}

/** Smallest ISO format the image fits in (portrait or landscape). */
export function paperFormat(widthMm, heightMm) {
  const [shortSide, longSide] = [widthMm, heightMm].sort((a, b) => a - b);
  const format = PAPER_FORMATS.find(([, maxShort, maxLong]) => shortSide <= maxShort && longSide <= maxLong);
  return format ? format[0] : '> 4A0';
}
