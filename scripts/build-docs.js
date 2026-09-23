#!/usr/bin/env node
// Builds the documentation site into the root of dist/: one HTML page per Markdown file of docs/, the home page
// from docs/README.md, and redirections from the addresses the documentation had before. The Markdown stays
// readable on GitHub, and is the only place the text is written.
//
// An image of a page whose file does not exist yet is a screenshot to come: the site shows in its place what
// the screenshot should hold, and the image itself as soon as its file is added — nothing else to change.

import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Marked } from 'marked';

export const SITE_URL = 'https://sebprunier.github.io/cartes/';
export const GENERATOR_PATH = 'generer/';
const REPOSITORY = 'https://github.com/sebprunier/cartes';
const SOURCE = 'docs';

// The pages, in the order of the menu, by section. A Markdown file of docs/ that is not listed is not published.
export const DOCUMENTATION_SECTIONS = [
  {
    title: 'Premiers pas',
    pages: [
      { file: 'prise-en-main.md', title: 'Prise en main' },
      { file: 'zoom-et-impression.md', title: 'Zoom et impression' },
      { file: 'donnees.md', title: 'Ajouter des données' },
    ],
  },
  {
    title: 'Les outils',
    pages: [
      { href: GENERATOR_PATH, title: 'Page web' },
      { file: 'application-de-bureau.md', title: 'Application de bureau' },
      { file: 'ligne-de-commande.md', title: 'Ligne de commande' },
      { file: 'api.md', title: 'API' },
    ],
  },
  {
    title: 'Référence',
    pages: [
      { file: 'donnees-et-licences.md', title: 'Sources et licences' },
      { file: 'problemes-courants.md', title: 'Problèmes courants' },
    ],
  },
];

const HOME = { file: 'README.md', title: 'Accueil', page: 'index.html', home: true };

/** Every page written in Markdown, home included, with the name of its HTML page. */
export const DOCUMENTATION_PAGES = [
  HOME,
  ...DOCUMENTATION_SECTIONS.flatMap(({ title: section, pages }) =>
    pages.filter(({ file }) => file).map((page) => ({ ...page, section, page: page.file.replace(/\.md$/, '.html') })),
  ),
];

// Addresses the site had before, still written in released applications, in the help of the command line and
// in messages here and there: each one leads to where its page lives now.
export const REDIRECTIONS = {
  'documentation/index.html': 'prise-en-main.html',
  ...Object.fromEntries(
    DOCUMENTATION_PAGES.filter(({ home, file }) => !home && file !== 'prise-en-main.md').map(({ page }) => [
      `documentation/${page}`,
      page,
    ]),
  ),
  'try-it/index.html': GENERATOR_PATH,
};

/** Images a page shows, as paths relative to docs/. */
export function imagesOf(markdown) {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(([, target]) => target);
}

/**
 * Screenshots still to take: images of the pages whose file does not exist yet, with what they should show and
 * the pages that show them — one screenshot may serve several pages.
 */
export async function pendingCaptures() {
  const pending = new Map();
  for (const { file, title } of DOCUMENTATION_PAGES) {
    const markdown = await readFile(path.join(SOURCE, file), 'utf8');
    for (const [, description, image] of markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (existsSync(path.join(SOURCE, image))) continue;
      const capture = pending.get(image) ?? { file: image, description, pages: [] };
      if (!capture.pages.includes(title)) capture.pages.push(title);
      pending.set(image, capture);
    }
  }
  return [...pending.values()];
}

/** Writes the documentation site into `output`, and returns how many pages were written. */
export async function buildDocs(output, { version, date = new Date() }) {
  await mkdir(output, { recursive: true });
  await cp(path.join(SOURCE, 'documentation.css'), path.join(output, 'documentation.css'));
  await cp(path.join(SOURCE, 'images', 'logo.png'), path.join(output, 'logo.png'));
  await cp(path.join(SOURCE, 'images', 'social-preview.png'), path.join(output, 'social-preview.png'));

  const pages = DOCUMENTATION_PAGES.filter(({ file }) => existsSync(path.join(SOURCE, file)));
  for (const [index, page] of pages.entries()) {
    const markdown = await readFile(path.join(SOURCE, page.file), 'utf8');
    const rendered = render(markdown, page);
    const neighbours = page.home ? {} : { previous: pages[index - 1], next: pages[index + 1] };
    const html = page.home
      ? homeTemplate({ page, rendered, version, date })
      : pageTemplate({ page, rendered, version, date, ...neighbours });
    await writeFile(path.join(output, page.page), html);
    for (const image of imagesOf(markdown).filter((image) => existsSync(path.join(SOURCE, image)))) {
      await mkdir(path.dirname(path.join(output, image)), { recursive: true });
      await cp(path.join(SOURCE, image), path.join(output, image));
    }
  }

  for (const [from, to] of Object.entries(REDIRECTIONS)) {
    await mkdir(path.dirname(path.join(output, from)), { recursive: true });
    await writeFile(path.join(output, from), redirection(from, to));
  }
  await writeFile(path.join(output, '404.html'), notFoundTemplate({ version, date }));
  return pages.length;
}

/**
 * Renders the Markdown of a page: anchored headings, figures for images, screenshots to come in place of the
 * missing ones, code blocks with a copy button, tables that scroll on a narrow screen. Returns the HTML, the
 * headings for the table of contents, and the pieces the home page lays out on its own.
 */
function render(markdown, page) {
  const headings = [];
  const slugs = new Map();
  const slugOf = (text) => {
    const base =
      text
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z]+;|&#\d+;/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'section';
    const count = slugs.get(base) ?? 0;
    slugs.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        if (depth === 1) return `<h1>${text}</h1>\n`;
        const id = slugOf(text);
        if (depth <= 3) headings.push({ depth, id, text: text.replace(/<[^>]+>/g, '') });
        return `<h${depth} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Lien vers cette section">#</a></h${depth}>\n`;
      },
      paragraph({ tokens }) {
        const content = tokens.filter((token) => !(token.type === 'text' && !token.text.trim()));
        if (content.length === 1 && content[0].type === 'image') return figure(content[0]);
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      image({ href, text }) {
        return `<img src="${href}" alt="${escapeHtml(text)}" />`;
      },
      code({ text, lang }) {
        const language = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        return (
          `<div class="code"><button type="button" class="copy" aria-label="Copier le code">Copier</button>` +
          `<pre><code${language}>${escapeHtml(text)}</code></pre></div>\n`
        );
      },
      blockquote({ tokens }) {
        return `<aside class="note">${this.parser.parse(tokens)}</aside>\n`;
      },
    },
  });

  // A wide table scrolls within its frame instead of widening the page.
  const html = withSiteLinks(marked.parse(markdown))
    .replaceAll('<table>', '<div class="table"><table>')
    .replaceAll('</table>', '</table></div>');
  return { html, headings, title: page.title };
}

/** An image of the page, or the frame of a screenshot still to take when its file is not there yet. */
function figure({ href, title, text }) {
  const alt = escapeHtml(text);
  const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : '';
  if (/^https?:/.test(href) || existsSync(path.join(SOURCE, href))) {
    const size = /^https?:/.test(href) ? undefined : imageSize(href);
    const dimensions = size ? ` width="${size.width}" height="${size.height}"` : '';
    return `<figure><img src="${href}" alt="${alt}"${dimensions} loading="lazy" />${caption}</figure>\n`;
  }
  return (
    `<figure class="capture-pending" role="img" aria-label="Capture d'écran à venir : ${alt}">` +
    `<div><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>` +
    `<strong>Capture d'écran à venir</strong><span>${alt}</span><code>${escapeHtml(href)}</code></div>` +
    `${caption}</figure>\n`
  );
}

/** Size of a PNG or JPEG image, read from its header, so that the page does not jump while it loads. */
function imageSize(href) {
  const bytes = readFileSync(path.join(SOURCE, href));
  if (href.endsWith('.png')) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (!/\.jpe?g$/.test(href)) return undefined;
  // The size of a JPEG is in its frame header, one of the segments that follow the start of the image.
  for (let offset = 2; offset < bytes.length; offset += 2 + bytes.readUInt16BE(offset + 2)) {
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
  }
  return undefined;
}

/**
 * Links between pages, written as Markdown file names, become links between HTML pages; links to the site
 * itself, written in full to work on GitHub, become relative, to work on a local copy too; links to the rest of
 * the repository lead to GitHub.
 */
function withSiteLinks(html) {
  const relative = html
    .replaceAll(`href="${SITE_URL}"`, 'href="index.html"')
    .replaceAll(`href="${SITE_URL}`, 'href="')
    // A file of the repository outside docs/, reached from docs/ on GitHub, is not on the site: it links there.
    .replace(/href="\.\.\/([^"]*)"/g, (link, target) => `href="${REPOSITORY}/${/\.\w+$/.test(target) ? 'blob' : 'tree'}/main/${target}"`);
  return DOCUMENTATION_PAGES.reduce((text, { file, page }) => text.replaceAll(`href="${file}`, `href="${page}`), relative);
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** First paragraph of a page, as plain text, for search engines and link previews. */
function summaryOf(html) {
  const paragraph = html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '';
  const text = paragraph.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 197).replace(/\s+\S*$/, '')}…` : text;
}

function head({ title, description, canonical, root = '' }) {
  return `<meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="cartes" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${SITE_URL}social-preview.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="${root}logo.png" />
    <link rel="stylesheet" href="${root}documentation.css" />`;
}

/**
 * The bar at the top of every page. On a narrow screen, where its links and the menu at the side do not fit,
 * a menu button opens both — a <details>, which needs no script.
 */
function topbar({ root = '', current, page = {}, version }) {
  const link = (href, label, key) =>
    `<a href="${root}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="${root}index.html"><img src="${root}logo.png" alt="" width="32" height="32" /><span>cartes</span></a>
        <nav class="topnav" aria-label="Navigation principale">
          ${link('prise-en-main.html', 'Documentation', 'documentation')}
          ${link(GENERATOR_PATH, 'Générer une carte', 'generator')}
          ${link('application-de-bureau.html', 'Application de bureau', 'desktop')}
          ${link('api.html', 'API', 'api')}
          <a href="${REPOSITORY}">GitHub</a>
          <a class="version" href="${REPOSITORY}/releases" title="Versions publiées">v${version}</a>
        </nav>
        <details class="menu">
          <summary aria-label="Menu"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg></summary>
          <nav class="menu-panel" aria-label="Menu">
            <div class="sidebar-section">
              <ul>
                <li><a href="${root}index.html"${page.home ? ' aria-current="page"' : ''}>Accueil</a></li>
                <li><a href="${root}${GENERATOR_PATH}">Générer une carte</a></li>
                <li><a href="${REPOSITORY}">Code source sur GitHub</a></li>
                <li><a href="${REPOSITORY}/releases">Versions publiées · v${version}</a></li>
              </ul>
            </div>
            ${sidebar(page, root)}
          </nav>
        </details>
      </div>
    </header>`;
}

function footer({ root = '', version, date }) {
  return `<footer class="site-footer">
      <div class="footer-inner">
        <div>
          <a class="brand" href="${root}index.html"><img src="${root}logo.png" alt="" width="24" height="24" /><span>cartes</span></a>
          <p>Des outils libres pour aider les communes de France à créer des cartes détaillées de leur territoire.</p>
        </div>
        <div>
          <p>
            Code source sous <a href="${REPOSITORY}/blob/main/LICENSE">licence MIT</a> ·
            Données © IGN et © BRGM, sous <a href="${root}donnees-et-licences.html">licence ouverte Etalab</a>
          </p>
          <p class="muted">Version ${version}, documentation mise à jour le ${date.toLocaleDateString('fr-FR')}.</p>
        </div>
      </div>
    </footer>`;
}

// Copies a code block on a click: the only script of the site, which reads fine without it.
const COPY_SCRIPT = `<script>
      for (const button of document.querySelectorAll('.code .copy')) {
        button.addEventListener('click', async () => {
          await navigator.clipboard.writeText(button.nextElementSibling.textContent);
          button.textContent = 'Copié';
          setTimeout(() => (button.textContent = 'Copier'), 1500);
        });
      }
    </script>`;

function sidebar(current, root = '') {
  return DOCUMENTATION_SECTIONS.map(
    ({ title, pages }) => `<div class="sidebar-section">
            <p class="sidebar-title">${title}</p>
            <ul>
              ${pages
                .map(({ file, href, title: label }) => {
                  const target = href ?? file.replace(/\.md$/, '.html');
                  const here = file === current.file ? ' aria-current="page"' : '';
                  return `<li><a href="${root}${target}"${here}>${label}</a></li>`;
                })
                .join('\n              ')}
            </ul>
          </div>`,
  ).join('\n          ');
}

function pageTemplate({ page, rendered, version, date, previous, next }) {
  const { html, headings } = rendered;
  const content = html.replace(/<h1>[\s\S]*?<\/h1>\n?/, '');
  const toc = headings.filter(({ depth }) => depth === 2);
  const pager = (neighbour, label, className) =>
    neighbour && !neighbour.home
      ? `<a class="${className}" href="${neighbour.page}"><span>${label}</span>${neighbour.title}</a>`
      : '<span></span>';

  return `<!doctype html>
<html lang="fr">
  <head>
    ${head({
      title: `${page.title} — cartes`,
      description: summaryOf(content),
      canonical: `${SITE_URL}${page.page}`,
    })}
  </head>
  <body>
    <a class="skip" href="#contenu">Aller au contenu</a>
    ${topbar({ current: { 'api.md': 'api', 'application-de-bureau.md': 'desktop' }[page.file] ?? 'documentation', page, version })}
    <div class="layout">
      <nav class="sidebar" aria-label="Pages de la documentation">
        ${sidebar(page)}
      </nav>
      <main id="contenu" class="content">
        <p class="eyebrow">${page.section}</p>
        <h1>${page.title}</h1>
        ${content}
        <div class="edit"><a href="${REPOSITORY}/edit/main/docs/${page.file}">Proposer une modification de cette page</a></div>
        <nav class="pager" aria-label="Pages voisines">
          ${pager(previous, 'Précédent', 'previous')}
          ${pager(next, 'Suivant', 'next')}
        </nav>
      </main>
      ${
        toc.length > 1
          ? `<aside class="toc" aria-label="Sur cette page">
        <p class="toc-title">Sur cette page</p>
        <ul>
          ${toc.map(({ id, text }) => `<li><a href="#${id}">${text}</a></li>`).join('\n          ')}
        </ul>
      </aside>`
          : ''
      }
    </div>
    ${footer({ version, date })}
    ${COPY_SCRIPT}
  </body>
</html>
`;
}

/**
 * The home page: its title, first paragraph and first image make the opening, and each list whose items all
 * start with a bold text becomes a grid of cards — of links when that text is one.
 */
function homeTemplate({ page, rendered, version, date }) {
  let { html } = rendered;
  const title = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? '';
  html = html.replace(/<h1>[\s\S]*?<\/h1>\n?/, '');
  const lead = html.match(/<p>([\s\S]*?)<\/p>\n?/);
  html = html.replace(lead[0], '');
  const illustration = html.match(/<figure>[\s\S]*?<\/figure>\n?/)?.[0] ?? '';
  html = html.replace(illustration, '');

  html = html.replace(/<ul>\n([\s\S]*?)<\/ul>/g, (list, items) => {
    const entries = [...items.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, item]) => item.trim());
    if (!entries.every((item) => item.startsWith('<strong>'))) return list;
    const cards = entries.map((item) => {
      const [, strong, rest] = item.match(/^<strong>([\s\S]*?)<\/strong>\s*(?:—\s*)?([\s\S]*)$/);
      const link = strong.match(/^<a href="([^"]+)">([\s\S]*?)<\/a>$/);
      return link
        ? `<a class="card" href="${link[1]}"><strong>${link[2]}</strong><span>${rest}</span></a>`
        : `<div class="card"><strong>${strong}</strong><span>${rest}</span></div>`;
    });
    const plain = cards.every((card) => card.startsWith('<div'));
    return `<div class="cards${plain ? ' cards-plain' : ''}">\n${cards.join('\n')}\n</div>`;
  });

  return `<!doctype html>
<html lang="fr">
  <head>
    ${head({
      title: 'cartes — cartes détaillées des communes de France, prêtes à imprimer',
      description: lead[1].replace(/<[^>]+>/g, ''),
      canonical: SITE_URL,
    })}
  </head>
  <body class="home">
    <a class="skip" href="#contenu">Aller au contenu</a>
    ${topbar({ current: 'home', page, version })}
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-text">
          <h1>${title}</h1>
          <p class="lead">${lead[1]}</p>
          <p class="actions">
            <a class="button button-large" href="${GENERATOR_PATH}">Générer une carte</a>
            <a class="button button-large button-secondary" href="prise-en-main.html">Prise en main</a>
          </p>
        </div>
        <div class="hero-image">${illustration}</div>
      </div>
    </section>
    <main id="contenu" class="home-content">
      ${html}
    </main>
    ${footer({ version, date })}
  </body>
</html>
`;
}

function notFoundTemplate({ version, date }) {
  return `<!doctype html>
<html lang="fr">
  <head>
    ${head({
      title: 'Page introuvable — cartes',
      description: 'Cette page n’existe pas, ou plus.',
      canonical: SITE_URL,
      root: SITE_URL,
    })}
    <meta name="robots" content="noindex" />
  </head>
  <body>
    ${topbar({ root: SITE_URL, version })}
    <main class="not-found">
      <p class="eyebrow">Erreur 404</p>
      <h1>Cette page n’existe pas, ou plus</h1>
      <p>Elle a peut-être déménagé lors d’une refonte du site. Repartez de l’accueil, ou allez directement à ce que vous cherchiez :</p>
      <p class="actions">
        <a class="button" href="${SITE_URL}${GENERATOR_PATH}">Générer une carte</a>
        <a class="button button-secondary" href="${SITE_URL}prise-en-main.html">Prise en main</a>
        <a class="button button-secondary" href="${SITE_URL}">Accueil</a>
      </p>
    </main>
    ${footer({ root: SITE_URL, version, date })}
  </body>
</html>
`;
}

function redirection(from, to) {
  const target = `${'../'.repeat(from.split('/').length - 1)}${to}`;
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Page déplacée — cartes</title>
    <link rel="canonical" href="${SITE_URL}${to}" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <script>location.replace(${JSON.stringify(target)} + location.hash);</script>
  </head>
  <body>
    <p>Cette page a déménagé : <a href="${target}">${SITE_URL}${to}</a>.</p>
  </body>
</html>
`;
}

// Run directly, lists the screenshots still to take.
if (import.meta.url === `file://${process.argv[1]}`) {
  const pending = await pendingCaptures();
  console.log(`${pending.length} capture(s) d'écran à venir :\n`);
  for (const { file, pages, description } of pending) console.log(`- ${file} (${pages.join(', ')}) : ${description}`);
}
