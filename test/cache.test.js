import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { customMapLayer } from '../src/core/maplayers.js';
import { cacheFolder, tileSizes } from '../src/node/cache.js';

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

describe('cacheFolder', () => {
  it('keeps a layer of the catalog under its id, and its vintage', () => {
    assert.equal(cacheFolder({ id: 'plan-ign' }), 'plan-ign');
    assert.equal(cacheFolder({ id: 'artificialisation', vintage: '2021-2023' }), 'artificialisation-2021-2023');
  });

  it('separates two layers added under the same name at two addresses', () => {
    const at = (url) => cacheFolder(customMapLayer({ url, name: 'Zones humides', attribution: '© Exemple' }));
    const first = at('https://un.exemple/{z}/{x}/{y}.png');
    assert.match(first, /^perso-zones-humides-[0-9a-f]{16}$/);
    assert.notEqual(first, at('https://autre.exemple/{z}/{x}/{y}.png'));
    assert.equal(first, at('https://un.exemple/{z}/{x}/{y}.png'));
  });
});
