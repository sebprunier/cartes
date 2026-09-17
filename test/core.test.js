import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

// The shared core also runs in a browser (web page) and in Electron: it must not depend on Node or on sharp.
describe('src/core', () => {
  it('imports neither node: modules nor sharp', async () => {
    const files = await readdir('src/core');
    for (const file of files) {
      const source = await readFile(path.join('src/core', file), 'utf8');
      const imports = [...source.matchAll(/^import .*? from '([^']+)';$/gm)].map(([, module]) => module);
      for (const module of imports) {
        assert.ok(!module.startsWith('node:'), `${file} importe ${module}`);
        assert.ok(!module.startsWith('sharp'), `${file} importe ${module}`);
        assert.ok(module.startsWith('./'), `${file} importe ${module}`);
      }
    }
  });
});
