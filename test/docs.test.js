import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import { DOCUMENTATION_PAGES } from '../scripts/build-docs.js';

const SOURCE = 'docs';

describe('documentation', () => {
  it('lists pages that all exist', async () => {
    const available = await readdir(SOURCE);
    for (const { file } of DOCUMENTATION_PAGES) assert.ok(available.includes(file), file);
  });

  it('publishes every page written, so that none is forgotten in the menu', async () => {
    const listed = new Set(DOCUMENTATION_PAGES.map(({ file }) => file));
    const written = (await readdir(SOURCE)).filter((name) => name.endsWith('.md'));
    for (const file of written) assert.ok(listed.has(file), `${file} n’est dans aucune page du menu`);
  });

  it('links only to pages that exist, inside the documentation as well as in the repository', async () => {
    const available = new Set(await readdir(SOURCE));
    for (const { file } of DOCUMENTATION_PAGES) {
      const markdown = await readFile(path.join(SOURCE, file), 'utf8');
      for (const [, target] of markdown.matchAll(/\]\(([^)#]+\.md)\)/g)) {
        assert.ok(available.has(path.basename(target)), `${file} → ${target}`);
      }
    }
  });

  it('gives every page a title, which the template writes', async () => {
    for (const { file, title } of DOCUMENTATION_PAGES) {
      assert.ok(title, file);
      const markdown = await readFile(path.join(SOURCE, file), 'utf8');
      assert.match(markdown, /^# .+/, file);
    }
  });
});
