#!/usr/bin/env node
// Builds the user documentation into dist/documentation/: one HTML page per Markdown file of docs/, with the
// look of the web page. The Markdown stays readable on GitHub, and is the only place the text is written.

import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { marked } from 'marked';

// Order of the pages in the menu. A Markdown file of docs/ that is not listed here is not published.
export const DOCUMENTATION_PAGES = [
  { file: 'prise-en-main.md', title: 'Prise en main', page: 'index.html' },
  { file: 'zoom-et-impression.md', title: 'Zoom et impression' },
  { file: 'donnees.md', title: 'Ajouter des données' },
  { file: 'application-de-bureau.md', title: 'Application de bureau' },
  { file: 'ligne-de-commande.md', title: 'Ligne de commande' },
  { file: 'donnees-et-licences.md', title: 'Sources et licences' },
  { file: 'problemes-courants.md', title: 'Problèmes courants' },
];

const SOURCE = 'docs';

/** Writes the documentation pages into `output`, and returns how many were written. */
export async function buildDocs(output, { version, date = new Date() }) {
  const available = new Set(await readdir(SOURCE));
  const pages = DOCUMENTATION_PAGES.filter(({ file }) => available.has(file)).map((page) => ({
    ...page,
    page: page.page ?? page.file.replace(/\.md$/, '.html'),
  }));

  for (const page of pages) {
    const markdown = await readFile(path.join(SOURCE, page.file), 'utf8');
    const html = template({ page, pages, content: marked.parse(withoutTitle(markdown)), version, date });
    await writeFile(path.join(output, page.page), html);
    for (const image of imagesOf(markdown)) {
      await mkdir(path.dirname(path.join(output, image)), { recursive: true });
      await cp(path.join(SOURCE, image), path.join(output, image));
    }
  }
  return pages.length;
}

/** Images a page shows, as paths relative to docs/: only those are published, not the whole folder. */
export function imagesOf(markdown) {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(([, target]) => target);
}

// The title of the page is written by the template, from the menu: the Markdown keeps its own for GitHub.
function withoutTitle(markdown) {
  return markdown.replace(/^#\s+.*\n+/, '');
}

/** Links between pages of the documentation, written as Markdown file names, become links between its pages. */
function withPageLinks(html, pages) {
  return pages.reduce((text, { file, page }) => text.replaceAll(`href="${file}"`, `href="${page}"`), html);
}

function template({ page, pages, content, version, date }) {
  const menu = pages
    .map(({ title, page: target }) =>
      target === page.page
        ? `<li><span aria-current="page">${title}</span></li>`
        : `<li><a href="${target}">${title}</a></li>`,
    )
    .join('\n          ');

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${page.title} — documentation de cartes</title>
    <link rel="icon" href="../logo.png" />
    <link rel="stylesheet" href="../style.css" />
    <link rel="stylesheet" href="documentation.css" />
  </head>
  <body>
    <header>
      <a href="../"><img src="../logo.png" alt="" width="48" /></a>
      <div>
        <h1>Documentation</h1>
        <p class="note">
          Version ${version}, mise à jour le ${date.toLocaleDateString('fr-FR')} ·
          <a href="../">Générer une carte</a>
        </p>
      </div>
    </header>

    <div class="documentation">
      <nav>
        <ul>
          ${menu}
        </ul>
      </nav>
      <main>
        <h2>${page.title}</h2>
        ${withPageLinks(content, pages)}
      </main>
    </div>

    <footer>
      <p>
        <a href="https://github.com/sebprunier/cartes">Code source (licence MIT)</a> ·
        Données : © IGN et © BRGM, sous licence ouverte Etalab
      </p>
    </footer>
  </body>
</html>
`;
}
