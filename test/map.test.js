import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import sharp from 'sharp';

import {
  assembleTiles,
  attributionLabel,
  attributionText,
  boundaryOutline,
  drawOverlays,
  paperFormat,
  printSizeMm,
  saveImage,
} from '../src/map.js';
import { lonLatToPixel } from '../src/tiles.js';

let tempDir;

before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cartes-test-'));
});

after(() => rm(tempDir, { recursive: true, force: true }));

function pixelAt(pixels, width, x, y) {
  const offset = (y * width + x) * 3;
  return [...pixels.subarray(offset, offset + 3)];
}

async function solidTile(name, background) {
  const tilePath = path.join(tempDir, `${name}.png`);
  await sharp({ create: { width: 256, height: 256, channels: 4, background } }).png().toFile(tilePath);
  return tilePath;
}

describe('paperFormat', () => {
  it('returns the smallest ISO format the image fits in, in either orientation', () => {
    assert.equal(paperFormat(297, 210), 'A4');
    assert.equal(paperFormat(210, 297), 'A4');
    assert.equal(paperFormat(420, 297), 'A3');
    assert.equal(paperFormat(421, 297), 'A2');
    assert.equal(paperFormat(3000, 3000), '> 4A0');
  });
});

describe('printSizeMm', () => {
  it('converts pixels to millimeters at the given resolution', () => {
    assert.deepEqual(printSizeMm(1500, 300, 150), [254, 50.8]);
  });
});

describe('assembleTiles', () => {
  // Window straddling tiles x = 0 and x = 1 (world pixels 200 to 311), on the first tile row.
  const extent = { zoom: 5, xMin: 200, yMin: 10, xMax: 312, yMax: 20, width: 112, height: 10 };

  it('stitches the tiles at their position and crops them to the extent', async () => {
    const tiles = [
      { x: 0, y: 0, path: await solidTile('red', { r: 255, g: 0, b: 0, alpha: 1 }) },
      { x: 1, y: 0, path: await solidTile('blue', { r: 0, g: 0, b: 255, alpha: 1 }) },
    ];
    const { pixels, missing } = await assembleTiles(extent, tiles);
    assert.equal(pixels.length, 112 * 10 * 3);
    assert.equal(missing, 0);
    assert.deepEqual(pixelAt(pixels, 112, 0, 0), [255, 0, 0]);
    assert.deepEqual(pixelAt(pixels, 112, 55, 9), [255, 0, 0]);
    assert.deepEqual(pixelAt(pixels, 112, 56, 0), [0, 0, 255]);
    assert.deepEqual(pixelAt(pixels, 112, 111, 9), [0, 0, 255]);
  });

  it('leaves missing and transparent tiles white', async () => {
    const tiles = [
      { x: 0, y: 0, path: null },
      { x: 1, y: 0, path: await solidTile('transparent', { r: 0, g: 0, b: 0, alpha: 0 }) },
    ];
    const { pixels, missing } = await assembleTiles(extent, tiles);
    assert.equal(missing, 1);
    assert.ok(pixels.every((value) => value === 255));
  });

  it('converts the tiles to grayscale on three channels', async () => {
    const tiles = [{ x: 0, y: 0, path: await solidTile('red-for-gray', { r: 255, g: 0, b: 0, alpha: 1 }) }];
    const { pixels } = await assembleTiles(extent, tiles, { grayscale: true });
    assert.deepEqual(pixelAt(pixels, 112, 0, 0), [76, 76, 76]);
  });
});

describe('drawOverlays', () => {
  it('draws SVG elements across drawing blocks', async () => {
    // Wider than the 4096 px drawing blocks, so the line crosses a block boundary.
    const extent = { width: 4200, height: 4 };
    const pixels = Buffer.alloc(extent.width * extent.height * 3, 255);
    await drawOverlays(pixels, extent, ['<path d="M0,2L4200,2" stroke="rgb(0,0,255)" stroke-width="4"/>']);
    for (const x of [0, 4095, 4096, 4199]) {
      assert.deepEqual(pixelAt(pixels, extent.width, x, 1), [0, 0, 255], `pixel (${x}, 1)`);
    }
  });
});

describe('boundaryOutline', () => {
  it('draws each ring in pixel coordinates relative to the extent', () => {
    const boundary = {
      polygons: [
        [
          [
            [0.4, 46.8],
            [0.5, 46.8],
            [0.5, 46.7],
            [0.4, 46.8],
          ],
        ],
        [
          [
            [0.6, 46.8],
            [0.7, 46.8],
            [0.6, 46.7],
            [0.6, 46.8],
          ],
        ],
      ],
    };
    const [x, y] = lonLatToPixel(0.4, 46.8, 12);
    const extent = { zoom: 12, xMin: Math.floor(x) - 10, yMin: Math.floor(y) - 20, width: 1000, height: 1000 };
    const outline = boundaryOutline(boundary, extent);
    assert.match(outline, /^<path d="M/);
    assert.equal(outline.match(/M/g).length, 2);
    assert.ok(outline.includes(`M${(x - extent.xMin).toFixed(1)},${(y - extent.yMin).toFixed(1)}L`));
  });
});

describe('attributionText', () => {
  const date = new Date(2026, 8, 17);

  it('credits each source with the date of its most recent update, and the generation date', () => {
    const sources = [
      { attribution: '© IGN – Plan IGN', updateDate: '2026-08-05' },
      { attribution: '© IGN – ADMIN EXPRESS', updateDate: '2026-08-27' },
    ];
    assert.equal(
      attributionText({ sources, date }),
      'Sources : © IGN – Plan IGN (mise à jour du 05/08/2026) ; © IGN – ADMIN EXPRESS (mise à jour du 27/08/2026)' +
        ' · Carte générée le 17/09/2026',
    );
  });

  it('credits a source without its update date when it is unknown', () => {
    assert.equal(
      attributionText({ sources: [{ attribution: '© IGN – BD ORTHO' }], date }),
      'Sources : © IGN – BD ORTHO · Carte générée le 17/09/2026',
    );
  });
});

describe('attributionLabel', () => {
  const extent = { width: 3000, height: 1500 };
  const text = 'Sources : © IGN – Plan IGN & <données>';

  function labelBox(label) {
    const [, x, y, width, height] = label.match(/<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/).map(Number);
    return { x, y, width, height };
  }

  it('places the label in the bottom right corner', async () => {
    const label = await attributionLabel(text, extent);
    const box = labelBox(label);
    const padding = 10; // Half of the font size, which is the largest image side divided by 150.
    assert.equal(box.x + box.width + padding, extent.width);
    assert.equal(box.y + box.height + padding, extent.height);
    assert.ok(box.width > 2 * padding && box.height > 2 * padding);
    assert.match(label, /<image [^>]*href="data:image\/png;base64,/);
  });

  it('wraps long texts at 60 % of the image width', async () => {
    const shortLabel = labelBox(await attributionLabel('Sources : © IGN', extent));
    const longLabel = labelBox(await attributionLabel('© IGN – Plan IGN ; © IGN – ADMIN EXPRESS ; '.repeat(10), extent));
    assert.ok(longLabel.width <= extent.width * 0.6 + 20, `width ${longLabel.width}`);
    assert.ok(longLabel.height > 2 * shortLabel.height, `height ${longLabel.height}`);
  });

  it('draws a readable text on a light background', async () => {
    const pixels = Buffer.alloc(extent.width * extent.height * 3, 0);
    const label = await attributionLabel(text, extent);
    const box = labelBox(label);
    await drawOverlays(pixels, extent, [label]);

    assert.ok(pixelAt(pixels, extent.width, box.x + 1, box.y + 1).every((value) => value > 200), 'background');
    assert.deepEqual(pixelAt(pixels, extent.width, box.x - 1, box.y - 1), [0, 0, 0], 'outside the label');
    let darkPixels = 0;
    for (let y = box.y; y < box.y + box.height; y++) {
      for (let x = box.x; x < box.x + box.width; x++) {
        if (pixelAt(pixels, extent.width, x, y)[0] < 100) darkPixels++;
      }
    }
    assert.ok(darkPixels > 100, 'text');
  });
});

describe('saveImage', () => {
  const extent = { width: 20, height: 10 };
  const pixels = Buffer.alloc(20 * 10 * 3, 128);

  it('writes the image with the requested resolution', async () => {
    const outputPath = path.join(tempDir, 'sorties', 'carte.png');
    await saveImage(pixels, extent, outputPath, { dpi: 300 });
    const metadata = await sharp(outputPath).metadata();
    assert.equal(metadata.width, 20);
    assert.equal(metadata.height, 10);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.density, 300);
  });

  it('rejects unsupported formats', async () => {
    await assert.rejects(saveImage(pixels, extent, path.join(tempDir, 'carte.gif'), { dpi: 150 }), /non géré/);
  });
});
