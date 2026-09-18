// Rendering of the map on a canvas, in the browser: tiles, outline and attribution.

import { layersShapes, legendEntries, legendTitle } from './core/layers.js';
import {
  ATTRIBUTION_BACKGROUND,
  ATTRIBUTION_COLOR,
  OUTLINE_COLOR,
  attributionLayout,
  boundaryPath,
  legendLayout,
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

/** Draws a downloaded tile at its place in the image, with the opacity of its layer. */
export async function drawTile(context, extent, tile, { grayscale = false, opacity = 1 } = {}) {
  const bitmap = await createImageBitmap(new Blob([tile.content]));
  context.save();
  if (grayscale) context.filter = 'grayscale(1)';
  context.globalAlpha = opacity;
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
  context.stroke(new Path2D(boundaryPath(boundary, extent).path));
  context.restore();
}

/**
 * Draws the data layers: zones and lines, then points and their labels. They are shaped together, so that the
 * labels of two layers do not write over each other.
 */
export function drawLayers(context, layers, extent) {
  for (const shapes of layersShapes(layers, extent)) drawShapes(context, shapes);
}

function drawShapes(context, { points, paths, fontSize }) {
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';

  for (const { path, color, strokeWidth, fill, fillOpacity } of paths) {
    const shape = new Path2D(path);
    if (fill) {
      context.globalAlpha = fillOpacity;
      context.fillStyle = fill;
      context.fill(shape);
      context.globalAlpha = 1;
    }
    context.strokeStyle = color;
    context.lineWidth = strokeWidth;
    context.stroke(shape);
  }

  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = 'alphabetic';
  for (const point of points) {
    context.beginPath();
    context.arc(point.x, point.y, point.radius, 0, 2 * Math.PI);
    context.fillStyle = point.color;
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(1, Math.round(point.radius / 3));
    context.stroke();
    if (!point.label) continue;
    // The white outline keeps the label readable over a busy map.
    context.textAlign = { start: 'left', end: 'right', middle: 'center' }[point.labelAlign];
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(2, Math.round(fontSize / 4));
    context.strokeText(point.label, point.labelX, point.labelY);
    context.fillStyle = point.color;
    context.fillText(point.label, point.labelX, point.labelY);
  }
  context.restore();
}

/** Draws the legend of the data layers in the bottom left corner. */
export function drawLegend(context, layers, extent) {
  const entries = legendEntries(layers, extent);
  if (entries.length === 0) return;

  const { fontSize, padding, symbolSize, lineHeight } = legendLayout(extent);
  const title = legendTitle(layers);
  context.save();
  context.textBaseline = 'middle';
  context.textAlign = 'left';

  context.font = `bold ${fontSize}px sans-serif`;
  const titleWidth = context.measureText(title).width;
  context.font = `${fontSize}px sans-serif`;
  const labelWidth = Math.max(...entries.map(({ label }) => context.measureText(label).width));
  const boxWidth = padding + Math.max(2 * padding + symbolSize + labelWidth, titleWidth + padding);
  const boxHeight = 2 * padding + (entries.length + 1) * lineHeight;
  const x = padding;
  const y = extent.height - boxHeight - padding;
  context.fillStyle = ATTRIBUTION_BACKGROUND;
  context.fillRect(x, y, boxWidth, boxHeight);

  context.font = `bold ${fontSize}px sans-serif`;
  context.fillStyle = ATTRIBUTION_COLOR;
  context.fillText(title, x + padding, y + padding + lineHeight / 2);

  context.font = `${fontSize}px sans-serif`;
  entries.forEach((entry, index) => {
    const middle = y + padding + (index + 1) * lineHeight + lineHeight / 2;
    drawLegendSymbol(context, entry, x + padding, middle, symbolSize);
    context.fillStyle = ATTRIBUTION_COLOR;
    context.fillText(entry.label, x + 2 * padding + symbolSize, middle);
  });
  context.restore();
}

function drawLegendSymbol(context, { shape, color }, x, middle, size) {
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, Math.round(size / 5));
  if (shape === 'point') {
    context.beginPath();
    context.arc(x + size / 2, middle, size / 2.4, 0, 2 * Math.PI);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(1, Math.round(size / 8));
    context.stroke();
    return;
  }
  if (shape === 'line') {
    context.beginPath();
    context.moveTo(x, middle);
    context.lineTo(x + size, middle);
    context.stroke();
    return;
  }
  context.globalAlpha = 0.35;
  context.fillRect(x, middle - size / 2, size, size);
  context.globalAlpha = 1;
  context.lineWidth = Math.max(1, Math.round(size / 8));
  context.strokeRect(x, middle - size / 2, size, size);
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
