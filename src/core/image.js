// Assembles decoded tiles into a raw RGB pixel buffer. The decoding of a tile is left to the platform:
// sharp under Node, a canvas in a browser.

import { TILE_SIZE } from './tiles.js';

export const CHANNELS = 3;

/**
 * Stitches the tiles into a raw RGB pixel buffer with the exact dimensions of the extent, white where tiles
 * are missing. `decodeTile` returns the {data, width, height} pixels of a tile, or null when it cannot be read.
 */
export async function assemblePixels(extent, tiles, decodeTile) {
  const { width, height } = extent;
  const pixels = new Uint8Array(width * height * CHANNELS).fill(255);
  let missing = 0;

  for (const tile of tiles) {
    const decoded = tile.content ? await decodeTile(tile) : null;
    if (!decoded) {
      missing++;
      continue;
    }
    copyPixels(decoded, pixels, tile.x * TILE_SIZE - extent.xMin, tile.y * TILE_SIZE - extent.yMin, width, height);
  }
  return { pixels, missing };
}

/**
 * Draws raw RGBA pixels over the image at position (dx, dy), cropping whatever overflows: a layer laid over a
 * basemap keeps what shows through its transparent parts. `opacity` fades the whole layer.
 */
export function blendPixels(source, pixels, dx, dy, width, height, opacity = 1) {
  const { data, width: sourceWidth, height: sourceHeight } = source;
  if (data.length !== sourceWidth * sourceHeight * 4) {
    throw new Error(`Pixels de ${data.length} octets, ${sourceWidth * sourceHeight * 4} attendus (RGBA).`);
  }
  for (let row = Math.max(0, -dy); row < sourceHeight && dy + row < height; row++) {
    for (let column = Math.max(0, -dx); column < sourceWidth && dx + column < width; column++) {
      const alpha = (data[(row * sourceWidth + column) * 4 + 3] / 255) * opacity;
      if (alpha === 0) continue;
      const source0 = (row * sourceWidth + column) * 4;
      const target0 = ((dy + row) * width + dx + column) * CHANNELS;
      for (let channel = 0; channel < CHANNELS; channel++) {
        pixels[target0 + channel] = Math.round(
          data[source0 + channel] * alpha + pixels[target0 + channel] * (1 - alpha),
        );
      }
    }
  }
}

/** Copies raw RGB pixels at position (dx, dy) of the image, cropping whatever overflows. */
export function copyPixels(source, pixels, dx, dy, width, height) {
  const { data, width: sourceWidth, height: sourceHeight } = source;
  if (data.length !== sourceWidth * sourceHeight * CHANNELS) {
    throw new Error(`Pixels de ${data.length} octets, ${sourceWidth * sourceHeight * CHANNELS} attendus.`);
  }
  const firstColumn = Math.max(0, -dx);
  const endColumn = Math.min(sourceWidth, width - dx);
  if (endColumn <= firstColumn) return;
  for (let row = Math.max(0, -dy); row < sourceHeight && dy + row < height; row++) {
    const sourceStart = (row * sourceWidth + firstColumn) * CHANNELS;
    const sourceEnd = (row * sourceWidth + endColumn) * CHANNELS;
    pixels.set(data.subarray(sourceStart, sourceEnd), ((dy + row) * width + dx + firstColumn) * CHANNELS);
  }
}
