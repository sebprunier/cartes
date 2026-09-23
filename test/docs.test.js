import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  DOCUMENTATION_PAGES,
  GENERATOR_PATH,
  REDIRECTIONS,
  buildDocs,
  imagesOf,
  pendingCaptures,
} from '../scripts/build-docs.js';
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

  // A missing image is a screenshot to come, and only screenshots may be missing: anything else is a mistake.
  it('shows only images that exist, apart from screenshots still to take', async () => {
    for (const { file } of DOCUMENTATION_PAGES) {
      const markdown = await readFile(path.join(SOURCE, file), 'utf8');
      for (const image of imagesOf(markdown)) {
        if (image.startsWith('images/captures/')) continue;
        await assert.doesNotReject(readFile(path.join(SOURCE, image)), `${file} → ${image}`);
      }
    }
  });

  it('describes each screenshot to take, under a single name whichever pages show it', async () => {
    for (const { file, description, pages } of await pendingCaptures()) {
      assert.match(file, /^images\/captures\/[a-z0-9-]+\.png$/, file);
      assert.ok(description.length > 40, `${file} : décrivez ce que la capture doit montrer`);
      assert.ok(pages.length > 0, file);
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

describe('documentation site', () => {
  let output;

  before(async () => {
    output = await mkdtemp(path.join(tmpdir(), 'cartes-docs-'));
    await buildDocs(output, { version: '9.9.9', date: new Date('2026-09-23') });
  });

  after(() => rm(output, { recursive: true, force: true }));

  it('writes the home page and every page of the menu', () => {
    for (const { page } of DOCUMENTATION_PAGES) assert.ok(existsSync(path.join(output, page)), page);
    assert.ok(existsSync(path.join(output, '404.html')));
  });

  // Links of the pages lead to a page, an image or the stylesheet of the site — or to the page that generates
  // the maps, built next to them.
  it('links its pages only to files the site has', async () => {
    for (const { page } of DOCUMENTATION_PAGES) {
      const html = await readFile(path.join(output, page), 'utf8');
      for (const [, target] of html.matchAll(/(?:href|src)="(?!https?:|mailto:|#)([^"#]+)/g)) {
        if (target === GENERATOR_PATH) continue;
        assert.ok(existsSync(path.join(output, target)), `${page} → ${target}`);
      }
    }
  });

  it('leads each former address of the documentation to where its page lives now', async () => {
    for (const [from, to] of Object.entries(REDIRECTIONS)) {
      const html = await readFile(path.join(output, from), 'utf8');
      const target = html.match(/url=([^"]+)"/)[1];
      const reached = path.posix.join(path.posix.dirname(from), target);
      assert.equal(reached.replace(/\/$/, ''), to.replace(/\/$/, ''), from);
      if (to !== GENERATOR_PATH) assert.ok(existsSync(path.join(output, to)), to);
    }
    for (const page of ['index.html', 'donnees.html', 'api.html', 'zoom-et-impression.html']) {
      assert.ok(`documentation/${page}` in REDIRECTIONS, page);
    }
  });

  it('shows what a screenshot still to take should hold, in its place', async () => {
    const pending = await pendingCaptures();
    assert.ok(pending.length > 0, 'plus aucune capture à venir : ce test peut s’appuyer sur un autre exemple');
    const [{ file, pages }] = pending;
    const page = DOCUMENTATION_PAGES.find(({ title }) => title === pages[0]).page;
    const html = await readFile(path.join(output, page), 'utf8');
    assert.match(html, new RegExp(`class="capture-pending"[\\s\\S]*?<code>${file}</code>`));
  });
});
