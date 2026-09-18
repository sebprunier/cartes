import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHANNELS, blendPixels } from '../src/core/image.js';

// A white image of 4 × 2 pixels, on which layers are laid.
const whiteImage = () => new Uint8Array(4 * 2 * CHANNELS).fill(255);
const pixelAt = (pixels, x, y) => [...pixels.subarray((y * 4 + x) * CHANNELS, (y * 4 + x + 1) * CHANNELS)];

/** A tile of `width` × `height` pixels of a single RGBA color. */
function tile(width, height, [r, g, b, a]) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) data.set([r, g, b, a], index);
  return { data, width, height };
}

describe('blendPixels', () => {
  it('lets the image show through the transparent parts of a layer', () => {
    const pixels = whiteImage();
    blendPixels(tile(2, 1, [0, 0, 0, 0]), pixels, 0, 0, 4, 2);
    assert.deepEqual(pixelAt(pixels, 0, 0), [255, 255, 255]);
  });

  it('draws the opaque parts, and mixes the half transparent ones', () => {
    const pixels = whiteImage();
    blendPixels(tile(1, 1, [0, 0, 0, 255]), pixels, 0, 0, 4, 2);
    blendPixels(tile(1, 1, [0, 0, 0, 128]), pixels, 1, 0, 4, 2);
    assert.deepEqual(pixelAt(pixels, 0, 0), [0, 0, 0]);
    const [gray] = pixelAt(pixels, 1, 0);
    assert.ok(gray > 100 && gray < 160, `gris ${gray}`);
  });

  it('fades the whole layer with its opacity', () => {
    const pixels = whiteImage();
    blendPixels(tile(1, 1, [0, 0, 0, 255]), pixels, 0, 0, 4, 2, 0.5);
    const [gray] = pixelAt(pixels, 0, 0);
    assert.ok(gray > 100 && gray < 160, `gris ${gray}`);
  });

  it('crops what falls outside the image, on either side', () => {
    const pixels = whiteImage();
    blendPixels(tile(2, 2, [255, 0, 0, 255]), pixels, -1, -1, 4, 2);
    blendPixels(tile(2, 2, [0, 0, 255, 255]), pixels, 3, 1, 4, 2);
    assert.deepEqual(pixelAt(pixels, 0, 0), [255, 0, 0]);
    assert.deepEqual(pixelAt(pixels, 3, 1), [0, 0, 255]);
    assert.deepEqual(pixelAt(pixels, 2, 0), [255, 255, 255]);
  });

  it('refuses pixels that are not RGBA', () => {
    assert.throws(() => blendPixels({ data: new Uint8Array(3), width: 1, height: 1 }, whiteImage(), 0, 0, 4, 2), /RGBA/);
  });
});
