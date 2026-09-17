// Overlays drawn on top of the map: the municipality outline and the attribution of the data sources.
// This module only computes their geometry, text and style: the drawing is left to the platform.

import { lonLatToPixel } from './tiles.js';

export const OUTLINE_COLOR = 'rgb(200, 30, 90)';
export const ATTRIBUTION_COLOR = '#333333';
export const ATTRIBUTION_BACKGROUND = 'rgba(255, 255, 255, 0.85)';

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
 * Path of the municipality boundary in image pixels, as SVG path data: usable as the `d` attribute of an SVG
 * path, or to build a Path2D on a canvas.
 */
export function boundaryPath(boundary, extent) {
  return boundary.polygons
    .flat()
    .map((ring) => {
      const points = ring.map(([lon, lat]) => {
        const [px, py] = lonLatToPixel(lon, lat, extent.zoom);
        return `${(px - extent.xMin).toFixed(1)},${(py - extent.yMin).toFixed(1)}`;
      });
      return `M${points.join('L')}Z`;
    })
    .join('');
}

/** Stroke width of the outline, proportional to the image size so that it prints the same at any zoom level. */
export function outlineStrokeWidth(extent) {
  return Math.max(3, Math.round(Math.max(extent.width, extent.height) / 800));
}

/**
 * Size of the attribution label, proportional to the image size so that it stays readable wherever the image
 * is scaled to when printed. Long texts wrap at 60 % of the image width.
 */
export function attributionLayout(extent) {
  const fontSize = Math.max(12, Math.round(Math.max(extent.width, extent.height) / 150));
  return { fontSize, padding: Math.round(fontSize / 2), maxWidth: Math.round(extent.width * 0.6) };
}
