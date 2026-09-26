// Colors, fonts and motion of the video: those of the page and of the logo of cartes, on a paper background.

import { loadFont } from '@remotion/fonts';
import { Easing, interpolate, staticFile } from 'remotion';

export const COLORS = {
  paper: '#f7f6f1',
  paperDeep: '#eceae2',
  card: '#ffffff',
  ink: '#17232f',
  text: '#2c3a47',
  muted: '#5d6b79',
  line: '#e2e7ec',
  lineStrong: '#cfd7df',
  soft: '#f5f7f9',
  brand: '#0e4777',
  brandSoft: '#eaf1f8',
  accent: '#15814f',
  accentDark: '#0f6a40',
  accentSoft: '#e8f4ee',
  accentLine: '#cfe5d9',
  warning: '#8a4b00',
  warningSoft: '#fdf4e7',
  warningLine: '#f3dcb8',
  // The boundary of the municipality, in the color the tool draws it.
  outline: 'rgb(200, 30, 90)',
};

export const FONT = 'Inter, system-ui, sans-serif';
export const MONO = '"JetBrains Mono", Menlo, monospace';
// The font of what the tool writes on the map itself: its legend and its sources.
export const MAP_FONT = 'Helvetica, Arial, sans-serif';

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, ' +
  'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, ' +
  'U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

for (const [family, file] of [
  ['Inter', 'inter'],
  ['JetBrains Mono', 'jetbrains-mono'],
]) {
  loadFont({ family, url: staticFile(`fonts/${file}-latin-wght-normal.woff2`), weight: '100 900', unicodeRange: LATIN });
  loadFont({
    family,
    url: staticFile(`fonts/${file}-latin-ext-wght-normal.woff2`),
    weight: '100 900',
    unicodeRange: LATIN_EXT,
  });
}

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
// Left margin of the titles, and top of the content below them.
export const MARGIN = 96;
export const CONTENT_TOP = 330;

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** Progress from 0 to 1 between `start` and `start + duration` frames, eased. */
export function progress(frame, start, duration, easing = EASE_OUT) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}


/** A number written the French way: 5 104, with a narrow no-break space. */
export function frenchNumber(value, digits = 0) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export const SHADOW = '0 1px 2px rgba(23, 35, 47, 0.06), 0 14px 36px rgba(23, 35, 47, 0.09)';
export const SHADOW_LARGE = '0 2px 4px rgba(23, 35, 47, 0.06), 0 30px 70px rgba(23, 35, 47, 0.16)';
