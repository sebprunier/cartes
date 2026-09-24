// Rendering of the map with sharp: tile decoding, overlays and image file.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { CHANNELS, assemblePixels, blendPixels, copyPixels } from '../core/image.js';
import { layersShapes } from '../core/layers.js';
import { legendEntries, legendTitle } from '../core/layers.js';
import {
  ATTRIBUTION_COLOR,
  OUTLINE_COLOR,
  attributionLayout,
  boundaryPath,
  box,
  boxesOverlap,
  legendBoxLayout,
  legendLayout,
  mergeBoxes,
  outlineStrokeWidth,
} from '../core/overlays.js';
import { TILE_SIZE } from '../core/tiles.js';
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

/**
 * Draws the tiles of a layer over the assembled image, keeping what shows through their transparent parts.
 * A layer keeps its colors over a grayscale basemap, as the boundary and the added data do: `--gris` turns
 * the basemap gray so that what is laid over it stands out. Returns the number of tiles that could not be
 * drawn, which leave the basemap visible, and whether any tile had something to show — a layer that draws
 * nothing on the map gets no line in the legend.
 */
export async function drawMapLayer(pixels, extent, tiles, { opacity = 1 } = {}) {
  let missing = 0;
  let drawn = false;
  for (const tile of tiles) {
    if (!tile.content) {
      missing++;
      continue;
    }
    try {
      const { data, info } = await sharp(tile.content).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      drawn ||= hasVisiblePixel(data);
      blendPixels(
        { data, width: info.width, height: info.height },
        pixels,
        tile.x * TILE_SIZE - extent.xMin,
        tile.y * TILE_SIZE - extent.yMin,
        extent.width,
        extent.height,
        opacity,
      );
    } catch {
      // Corrupted cache file: delete it so that it gets downloaded again.
      await removeTile(tile.content);
      missing++;
    }
  }
  return { missing, drawn };
}

/** Whether RGBA pixels hold anything visible, or are all transparent. */
export function hasVisiblePixel(data) {
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
  return false;
}

/** A legend published by a map service, as an entry the legend can draw: its bytes and its natural size. */
export async function legendImageEntry(bytes) {
  // A Buffer, and not any bytes: the image is written into the SVG as base64.
  const image = Buffer.from(bytes);
  const { width, height } = await sharp(image).metadata();
  return { image, width, height };
}

/**
 * Draws the images of a WMS layer over the assembled image, each at its place, scaled when it was asked for
 * at a lower resolution than the map. Returns the number of blocks that could not be drawn.
 */
export async function drawWmsLayer(pixels, extent, blocks, { opacity = 1 } = {}) {
  let missing = 0;
  for (const block of blocks) {
    if (!block.content) {
      missing++;
      continue;
    }
    let image = sharp(block.content).ensureAlpha();
    if (block.pixelWidth !== block.width || block.pixelHeight !== block.height) {
      image = image.resize(block.width, block.height);
    }
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    blendPixels({ data, width: info.width, height: info.height }, pixels, block.x, block.y, extent.width, extent.height, opacity);
  }
  return missing;
}

/**
 * Overlay drawing the municipality boundary. Like every overlay, it carries the area it covers, so that
 * `drawOverlays` gives it only to the blocks of the image where it falls.
 */
export function boundaryOutline(boundary, extent) {
  const { path, box: area } = boundaryPath(boundary, extent);
  return {
    svg:
      `<path d="${path}" fill="none" stroke="${OUTLINE_COLOR}" ` +
      `stroke-width="${outlineStrokeWidth(extent)}" stroke-linejoin="round"/>`,
    box: area,
  };
}

/**
 * Overlays drawing the data layers: polygons and lines, then points and their labels. One overlay per shape,
 * each with the area it covers: a file of thousands of objects is then drawn block by block, and not entirely
 * for every block of the image. The layers are shaped together, so that their labels do not write over
 * each other.
 */
export function layerOverlays(layers, extent) {
  return layersShapes(layers, extent).flatMap(layerElements);
}

/** Overlays drawing the shapes of a vector layer: one per shape, each with the area it covers. */
export function vectorOverlays(shapes) {
  return shapes.map(pathOverlay);
}

function pathOverlay({ path, box: area, color, strokeWidth, fill, fillOpacity, fillRule = 'nonzero', dash }) {
  const dashes = dash ? ` stroke-dasharray="${dash.join(' ')}"` : '';
  const stroke =
    color && strokeWidth > 0 ? `stroke="${color}" stroke-width="${strokeWidth}"${dashes}` : 'stroke="none"';
  return {
    svg:
      `<path d="${path}" fill="${fill ?? 'none'}" fill-opacity="${fill ? fillOpacity : 0}" fill-rule="${fillRule}" ` +
      `${stroke} stroke-linejoin="round" stroke-linecap="round"/>`,
    box: area,
  };
}

/** Overlays writing labels centred on their point, in bold over a white halo: the codes of the zones of a PLU. */
export function labelOverlays(labels) {
  return labels.map(({ text, x, y, fontSize, color, box: area }) => {
    const position = `x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle"`;
    const font = `font-family="sans-serif" font-size="${fontSize}" font-weight="bold"`;
    return {
      svg:
        `<text ${position} ${font} stroke="#ffffff" stroke-width="${Math.max(2, Math.round(fontSize / 4))}" ` +
        `stroke-linejoin="round" fill="none">${escapeXml(text)}</text>` +
        `<text ${position} ${font} fill="${color}">${escapeXml(text)}</text>`,
      box: area,
    };
  });
}

function layerElements({ points, paths, fontSize }) {
  const overlays = paths.map(pathOverlay);

  for (const { x, y, radius: pointRadius, color, label, labelX, labelY, labelAlign, box: area, labelBox } of points) {
    const elements = [
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${pointRadius}" fill="${color}" ` +
        `stroke="#ffffff" stroke-width="${Math.max(1, Math.round(pointRadius / 3))}"/>`,
    ];
    if (label) {
      // The white outline keeps the label readable over a busy map.
      const position = `x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${labelAlign}"`;
      const font = `font-family="sans-serif" font-size="${fontSize}"`;
      elements.push(
        `<text ${position} ${font} stroke="#ffffff" stroke-width="${Math.max(2, Math.round(fontSize / 4))}" ` +
          `stroke-linejoin="round" fill="none">${escapeXml(label)}</text>`,
        `<text ${position} ${font} fill="${color}">${escapeXml(label)}</text>`,
      );
    }
    overlays.push({ svg: elements.join(''), box: label ? mergeBoxes(area, labelBox) : area });
  }
  return overlays;
}

function escapeXml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * SVG elements showing a text in the bottom right corner of the image, on a light background.
 * The text is rendered by sharp so that the background fits its actual size.
 */
export async function attributionLabel(text, extent) {
  const { fontSize, padding, maxWidth } = attributionLayout(extent);
  const { data, info } = await textImage(text, fontSize, maxWidth);

  const boxWidth = info.width + 2 * padding;
  const boxHeight = info.height + 2 * padding;
  const x = extent.width - boxWidth - padding;
  const y = extent.height - boxHeight - padding;
  return {
    svg:
      `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" fill="white" fill-opacity="0.85"/>` +
      `<image x="${x + padding}" y="${y + padding}" width="${info.width}" height="${info.height}" ` +
      `href="data:image/png;base64,${data.toString('base64')}"/>`,
    box: box(x, y, boxWidth, boxHeight),
  };
}

/** Text rendered by sharp into an image, which also gives its exact size. */
function textImage(text, fontSize, maxWidth, { bold = false } = {}) {
  const markup = bold ? `<b>${escapeMarkup(text)}</b>` : escapeMarkup(text);
  return sharp({
    text: {
      text: `<span foreground="${ATTRIBUTION_COLOR}">${markup}</span>`,
      font: `sans ${fontSize}`,
      ...(maxWidth && { width: maxWidth, wrap: 'word' }),
      dpi: 72,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

/** SVG elements showing the legend of the data layers, in the bottom left corner of the image. */
export async function legendOverlay(layers, extent, extra = []) {
  const entries = legendEntries(layers, extent, extra);
  if (entries.length === 0) return undefined;

  const layout = legendLayout(extent);
  const { fontSize, padding, symbolSize, lineHeight } = layout;
  const title = await textImage(legendTitle(layers, extra), fontSize, undefined, { bold: true });
  const labels = await Promise.all(entries.map((entry) => (entry.image ? undefined : textImage(entry.label, fontSize))));
  const { rows, boxWidth, boxHeight } = legendBoxLayout({
    entries,
    titleWidth: title.info.width,
    labelWidths: labels.map((label) => label?.info.width ?? 0),
    layout,
    extent,
  });

  const x = padding;
  const y = extent.height - boxHeight - padding;
  const elements = [
    `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" fill="white" fill-opacity="0.85"/>`,
    image(title, x + padding, y + padding + lineHeight / 2),
  ];

  let top = y + padding + lineHeight;
  rows.forEach(({ entry, height, scale }, index) => {
    if (entry.image) {
      elements.push(
        `<image x="${x + padding}" y="${top.toFixed(1)}" width="${(entry.width * scale).toFixed(1)}" ` +
          `height="${(entry.height * scale).toFixed(1)}" ` +
          `href="data:image/png;base64,${entry.image.toString('base64')}"/>`,
      );
    } else {
      const middle = top + height / 2;
      elements.push(legendSymbol(entry, x + padding, middle, symbolSize));
      elements.push(image(labels[index], x + 2 * padding + symbolSize, middle));
    }
    top += height;
  });
  return { svg: elements.join(''), box: box(x, y, boxWidth, boxHeight) };
}

/** A text rendered by sharp, placed with its middle on the given line. */
function image({ data, info }, x, middle) {
  return (
    `<image x="${x}" y="${(middle - info.height / 2).toFixed(1)}" width="${info.width}" ` +
    `height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>`
  );
}

function legendSymbol({ shape, color }, x, middle, size) {
  const stroke = Math.max(2, Math.round(size / 5));
  if (shape === 'point') {
    return `<circle cx="${x + size / 2}" cy="${middle}" r="${size / 2.4}" fill="${color}" stroke="#ffffff" stroke-width="${Math.max(1, Math.round(size / 8))}"/>`;
  }
  if (shape === 'line') {
    return `<path d="M${x},${middle}L${x + size},${middle}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  }
  return (
    `<rect x="${x}" y="${middle - size / 2}" width="${size}" height="${size}" fill="${color}" fill-opacity="0.35" ` +
    `stroke="${color}" stroke-width="${Math.max(1, Math.round(size / 8))}"/>`
  );
}

function escapeMarkup(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Draws SVG elements (in image pixels) directly into the pixels, block by block. */
export async function drawOverlays(pixels, extent, overlays) {
  const { width, height } = extent;
  const source = { raw: { width, height, channels: CHANNELS }, limitInputPixels: false };
  const drawn = overlays.filter(Boolean);
  for (let top = 0; top < height; top += BLOCK_SIZE) {
    for (let left = 0; left < width; left += BLOCK_SIZE) {
      const blockWidth = Math.min(BLOCK_SIZE, width - left);
      const blockHeight = Math.min(BLOCK_SIZE, height - top);
      // Only what falls in this block is handed to the renderer, which parses everything it is given.
      const block = box(left, top, blockWidth, blockHeight);
      const elements = drawn.filter((overlay) => boxesOverlap(overlay.box, block)).map(({ svg }) => svg);
      if (elements.length === 0) continue;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${blockWidth}" height="${blockHeight}" ` +
        `viewBox="${left} ${top} ${blockWidth} ${blockHeight}">${elements.join('')}</svg>`;
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
export async function saveImage(pixels, extent, outputPath, { dpi, palette = false }) {
  let image = sharp(pixels, {
    raw: { width: extent.width, height: extent.height, channels: CHANNELS },
    limitInputPixels: false,
  });

  const extension = path.extname(outputPath).toLowerCase();
  if (extension === '.png') image = image.png({ palette });
  else if (extension === '.jpg' || extension === '.jpeg') image = image.jpeg({ quality: 92 });
  else if (extension === '.tif' || extension === '.tiff') image = image.tiff({ compression: 'lzw' });
  else throw new Error(`Format de sortie non géré : ${extension} (utilisez .png, .jpg ou .tif)`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await image.withDensity(dpi).toFile(outputPath);
}
