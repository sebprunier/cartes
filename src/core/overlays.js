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
  const credits = sources.map(({ attribution, updateDate, datedByConsultation }) => {
    if (updateDate) return `${attribution} (mise à jour du ${frenchDate(updateDate)})`;
    // A service that publishes no update date is credited with the day it was read, as the licence asks for
    // the freshness of the data one way or another.
    if (datedByConsultation) return `${attribution} (consulté le ${date.toLocaleDateString('fr-FR')})`;
    return attribution;
  });
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
  let box;
  const path = boundary.polygons
    .flat()
    .map((ring) => {
      const points = ring.map(([lon, lat]) => {
        const [px, py] = lonLatToPixel(lon, lat, extent.zoom);
        const [x, y] = [px - extent.xMin, py - extent.yMin];
        box = growBox(box, x, y);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      return `M${points.join('L')}Z`;
    })
    .join('');
  return { path, box: expandBox(box ?? box0(), outlineStrokeWidth(extent)) };
}

/** SVG path data of rings of pixels, usable by an SVG overlay as well as by a canvas (Path2D). */
export function pathData(rings, closed) {
  return rings
    .map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`)
    .join('');
}

/** Rectangle in image pixels, used to place labels and to know which block of the image an overlay falls in. */
export function box(x, y, width, height) {
  return { x, y, width, height };
}

const box0 = () => box(0, 0, 0, 0);

export function boxesOverlap(one, other) {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  );
}

/** The box enlarged in every direction, to account for the width of a stroke or for a gap between labels. */
export function expandBox({ x, y, width, height }, margin) {
  return box(x - margin, y - margin, width + 2 * margin, height + 2 * margin);
}

export function mergeBoxes(one, other) {
  if (!one) return other;
  if (!other) return one;
  const x = Math.min(one.x, other.x);
  const y = Math.min(one.y, other.y);
  return box(x, y, Math.max(one.x + one.width, other.x + other.width) - x, Math.max(one.y + one.height, other.y + other.height) - y);
}

/** The box extended to hold one more point. */
function growBox(current, x, y) {
  return mergeBoxes(current, box(x, y, 0, 0));
}

/** Stroke width of the outline, proportional to the image size so that it prints the same at any zoom level. */
export function outlineStrokeWidth(extent) {
  return Math.max(3, Math.round(Math.max(extent.width, extent.height) / 800));
}

/** Size of the legend, proportional to the image, like the attribution. */
export function legendLayout(extent) {
  const { fontSize, padding } = attributionLayout(extent);
  return { fontSize, padding, symbolSize: Math.round(fontSize * 1.1), lineHeight: Math.round(fontSize * 1.6) };
}

/**
 * Size of the attribution label, proportional to the image size so that it stays readable wherever the image
 * is scaled to when printed. Long texts wrap at 60 % of the image width.
 */
export function attributionLayout(extent) {
  const fontSize = Math.max(12, Math.round(Math.max(extent.width, extent.height) / 150));
  return { fontSize, padding: Math.round(fontSize / 2), maxWidth: Math.round(extent.width * 0.6) };
}
