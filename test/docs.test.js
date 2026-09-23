import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import { DOCUMENTATION_PAGES, imagesOf } from '../scripts/build-docs.js';
import { FRENCH_COMMANDS } from '../src/node/command-line.js';

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

  it('shows only images that exist, which the build copies next to the pages', async () => {
    for (const { file } of DOCUMENTATION_PAGES) {
      const markdown = await readFile(path.join(SOURCE, file), 'utf8');
      for (const image of imagesOf(markdown)) {
        await assert.doesNotReject(readFile(path.join(SOURCE, image)), `${file} → ${image}`);
      }
    }
  });

  it('finds the images of a page, and not its links', () => {
    const markdown = 'Voir [la page](donnees.md).\n\n![Le dialogue](images/dialogue.png)\n';
    assert.deepEqual(imagesOf(markdown), ['images/dialogue.png']);
  });

  // A command added to the tool and forgotten in its page is a command nobody discovers.
  it('shows every command of the tool on the command line page', async () => {
    const markdown = await readFile(path.join(SOURCE, 'ligne-de-commande.md'), 'utf8');
    const names = new Map();
    for (const [french, english] of Object.entries(FRENCH_COMMANDS)) {
      names.set(english, [...(names.get(english) ?? []), french]);
    }
    for (const [english, french] of names) {
      const shown = french.some((name) => markdown.includes(`cartes ${name}`));
      assert.ok(shown, `la commande ${english} (${french.join(', ')}) n’est pas dans ligne-de-commande.md`);
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
