// Rendering of the map with sharp: tile decoding, overlays and image file.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { CHANNELS, assemblePixels, copyPixels } from '../core/image.js';
import {
  ATTRIBUTION_COLOR,
  OUTLINE_COLOR,
  attributionLayout,
  boundaryPath,
  outlineStrokeWidth,
} from '../core/overlays.js';
import { removeTile } from './cache.js';

// Luminance coefficients (Rec. 601): grayscale stays on 3 channels so overlays keep their colors.
const LUMINANCE = [0.299, 0.587, 0.114];
// librsvg rejects SVGs larger than 32,767 px on a side: overlays are drawn block by block.
const BLOCK_SIZE = 4096;

/**
 * Stitches the cached tiles into a raw RGB pixel buffer with the exact dimensions of the extent.
 * Missing tiles, and tiles whose cache file is corrupted, are left white.
 */
export function assembleTiles(extent, tiles, { grayscale = false } = {}) {
  return assemblePixels(extent, tiles, async (tile) => {
    try {
      let decoding = sharp(tile.content).flatten({ background: '#ffffff' }).toColourspace('srgb');
      if (grayscale) decoding = decoding.recomb([LUMINANCE, LUMINANCE, LUMINANCE]);
      const { data, info } = await decoding.raw().toBuffer({ resolveWithObject: true });
      if (info.channels !== CHANNELS) throw new Error(`Tuile à ${info.channels} canaux, ${CHANNELS} attendus.`);
      return { data, width: info.width, height: info.height };
    } catch {
      // Corrupted cache file: delete it so that it gets downloaded again.
      await removeTile(tile.content);
      return null;
    }
  });
}

/** SVG element drawing the municipality boundary. */
export function boundaryOutline(boundary, extent) {
  return (
    `<path d="${boundaryPath(boundary, extent)}" fill="none" stroke="${OUTLINE_COLOR}" ` +
    `stroke-width="${outlineStrokeWidth(extent)}" stroke-linejoin="round"/>`
  );
}

/**
 * SVG elements showing a text in the bottom right corner of the image, on a light background.
 * The text is rendered by sharp so that the background fits its actual size.
 */
export async function attributionLabel(text, extent) {
  const { fontSize, padding, maxWidth } = attributionLayout(extent);
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${ATTRIBUTION_COLOR}">${escapeMarkup(text)}</span>`,
      font: `sans ${fontSize}`,
      width: maxWidth,
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
      const { data, info } = await sharp(pixels, source)
        .extract({ left, top, width: blockWidth, height: blockHeight })
        .composite([{ input: Buffer.from(svg) }])
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      copyPixels({ data, width: info.width, height: info.height }, pixels, left, top, width, height);
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
