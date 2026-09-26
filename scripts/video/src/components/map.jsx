// What draws the maps of the video: the figures prepared from cartes, a camera over an image, and the boundary.

import { getLength } from '@remotion/paths';

import figures from '../generated/figures.json';
import { COLORS } from '../theme.js';

export { figures };

const lengths = new Map();

/** Length of an SVG path, computed once. */
export function pathLength(d) {
  if (!lengths.has(d)) lengths.set(d, getLength(d));
  return lengths.get(d);
}

/** Interpolation between two scales that looks even to the eye: geometric, not linear. */
export function logLerp(from, to, t) {
  return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * t);
}

export function lerp(from, to, t) {
  return from + (to - from) * t;
}

/**
 * The transform putting the point `point` of a world — an image, in its own pixels — at the point `screen` of the
 * frame, at the scale `scale`.
 */
export function cameraTransform(point, screen, scale) {
  return `translate(${screen[0] - point[0] * scale}px, ${screen[1] - point[1] * scale}px) scale(${scale})`;
}

/**
 * The boundary of the municipality, drawn up to `drawn` (0 to 1) of its length, over a world of `width` × `height`
 * pixels, with a stroke of `strokeWidth` pixels of this world.
 */
export const Boundary = ({ d, width, height, drawn = 1, strokeWidth, color = COLORS.outline, fill, fillOpacity = 0 }) => {
  const length = pathLength(d);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
    >
      {fill ? <path d={d} fill={fill} fillOpacity={fillOpacity} stroke="none" /> : null}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={`${length} ${length}`}
        strokeDashoffset={length * (1 - drawn)}
      />
    </svg>
  );
};

/** A veil over what lies outside the boundary, to bring the eye inside it. */
export const OutsideVeil = ({ d, width, height, opacity, color = COLORS.paper, margin = 2000 }) => (
  <svg
    width={width}
    height={height}
    viewBox={`0 0 ${width} ${height}`}
    style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity }}
  >
    <path
      d={`M${-margin},${-margin}H${width + margin}V${height + margin}H${-margin}Z ${d}`}
      fill={color}
      fillRule="evenodd"
    />
  </svg>
);
