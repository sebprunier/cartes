// Rendering of the map on a canvas, in the browser: tiles, outline and attribution.

import {
  ATTRIBUTION_BACKGROUND,
  ATTRIBUTION_COLOR,
  OUTLINE_COLOR,
  attributionLayout,
  boundaryPath,
  outlineStrokeWidth,
} from './core/overlays.js';
import { TILE_SIZE } from './core/tiles.js';

/** White canvas of the size of the extent, with its 2D context. */
export function createCanvas(width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Le navigateur refuse une image de ${width} × ${height} px.`);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

/**
 * Whether the browser can really draw an image of this size: canvases have a maximum size, which varies with
 * the browser and the machine, and which is reached silently.
 */
export function canRender(width, height) {
  try {
    const { canvas, context } = createCanvas(width, height);
    context.fillStyle = '#000000';
    context.fillRect(width - 1, height - 1, 1, 1);
    const drawn = context.getImageData(width - 1, height - 1, 1, 1).data;
    canvas.width = canvas.height = 0; // Frees the memory right away.
    return drawn[0] === 0 && drawn[3] === 255;
  } catch {
    return false;
  }
}

/** Draws a downloaded tile at its place in the image. */
export async function drawTile(context, extent, tile, { grayscale = false } = {}) {
  const bitmap = await createImageBitmap(new Blob([tile.content]));
  context.save();
  if (grayscale) context.filter = 'grayscale(1)';
  context.drawImage(bitmap, tile.x * TILE_SIZE - extent.xMin, tile.y * TILE_SIZE - extent.yMin);
  context.restore();
  bitmap.close();
}

/** Draws the municipality boundary, from the same path as the one used by the command line. */
export function drawBoundary(context, boundary, extent) {
  context.save();
  context.strokeStyle = OUTLINE_COLOR;
  context.lineWidth = outlineStrokeWidth(extent);
  context.lineJoin = 'round';
  context.stroke(new Path2D(boundaryPath(boundary, extent)));
  context.restore();
}

/** Draws the attribution of the data sources in the bottom right corner, on a light background. */
export function drawAttribution(context, text, extent) {
  const { fontSize, padding, maxWidth } = attributionLayout(extent);
  context.save();
  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = 'top';

  const lines = wrapText(context, text, maxWidth);
  const lineHeight = Math.round(fontSize * 1.25);
  const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
  const boxWidth = Math.ceil(textWidth) + 2 * padding;
  const boxHeight = lines.length * lineHeight + 2 * padding;
  const x = extent.width - boxWidth - padding;
  const y = extent.height - boxHeight - padding;

  context.fillStyle = ATTRIBUTION_BACKGROUND;
  context.fillRect(x, y, boxWidth, boxHeight);
  context.fillStyle = ATTRIBUTION_COLOR;
  lines.forEach((line, index) => context.fillText(line, x + padding, y + padding + index * lineHeight));
  context.restore();
}

/** Splits the text into lines no wider than maxWidth, at word boundaries. */
function wrapText(context, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Encodes the canvas in the requested format (png or jpg). */
export function toBlob(canvas, format) {
  return canvas.convertToBlob(format === 'jpg' ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' });
}
