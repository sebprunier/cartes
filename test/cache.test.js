import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { tileSizes } from '../src/node/cache.js';

describe('tileSizes', () => {
  let tempDir;

  before(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'cartes-test-'));
  });

  after(() => rm(tempDir, { recursive: true, force: true }));

  it('reads the size of the cached tiles, ignoring the missing ones', async () => {
    const tiles = [{ content: null }];
    for (const [name, size] of [['a', 1000], ['b', 3000]]) {
      const tilePath = path.join(tempDir, `${name}.tile`);
      await writeFile(tilePath, Buffer.alloc(size));
      tiles.push({ content: tilePath });
    }
    assert.deepEqual(await tileSizes(tiles), [1000, 3000]);
  });
});
