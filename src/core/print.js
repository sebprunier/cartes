// Print sizes and paper formats.

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

export function printSizeMm(widthPx, heightPx, dpi) {
  return [(widthPx / dpi) * 25.4, (heightPx / dpi) * 25.4];
}

/** Smallest ISO format the image fits in (portrait or landscape). */
export function paperFormat(widthMm, heightMm) {
  const [shortSide, longSide] = [widthMm, heightMm].sort((a, b) => a - b);
  const format = PAPER_FORMATS.find(([, maxShort, maxLong]) => shortSide <= maxShort && longSide <= maxLong);
  return format ? format[0] : '> 4A0';
}
