#!/usr/bin/env node
// Command line interface. Commands and options are shown in French, with English aliases.

import { parseArgs } from 'node:util';

import { BASEMAPS } from './basemaps.js';
import { assembleTiles, boundaryOutline, drawOverlays, paperFormat, printSizeMm, saveImage } from './map.js';
import {
  MunicipalityNotFound,
  boundaryBbox,
  describeMunicipality,
  fetchBoundary,
  normalizeName,
  resolveMunicipality,
  searchMunicipalities,
} from './municipalities.js';
import { downloadTiles, extentFromBbox, groundResolution } from './tiles.js';

const HELP = `Génère une carte détaillée d'une commune en recollant des tuiles de fond de carte.

Usage :
  cartes chercher <nom> [-d <département>]   rechercher une commune par son nom
  cartes fonds                               lister les fonds de carte disponibles
  cartes generer <commune> [options]         générer la carte d'une commune, par nom ou code INSEE

Options de « generer » :
  -d, --departement <code>  département, pour lever une homonymie, ex. 86
  -f, --fond <id>           fond de carte, défaut : plan-ign
  -z, --zoom <n>            niveau de zoom des tuiles, défaut : 17
  -o, --sortie <fichier>    fichier .png, .jpg ou .tif, défaut : sorties/<commune>-<fond>-z<zoom>[-gris].png
      --marge <fraction>    marge autour de la commune, défaut : 0.03
      --dpi <n>             résolution d'impression visée, défaut : 150
      --couleur             garder les couleurs du fond de carte (niveaux de gris par défaut)
      --sans-contour        ne pas tracer le contour de la commune
      --estimer             afficher les tailles par niveau de zoom sans rien télécharger
      --max-tuiles <n>      garde-fou sur le nombre de tuiles, défaut : 5000
      --paralleles <n>      téléchargements simultanés, défaut : 6
      --cache <dossier>     dossier de cache des tuiles, défaut : .cache/tiles
  -h, --aide                afficher cette aide

Les commandes et options existent aussi en anglais : search, basemaps, generate, --department,
--basemap, --output, --margin, --color, --no-outline, --estimate, --max-tiles, --concurrency, --help.`;

// French command names, mapped to the English names used in code (which are accepted too).
const FRENCH_COMMANDS = { chercher: 'search', fonds: 'basemaps', generer: 'generate', générer: 'generate' };

// Options are keyed by their English name (used in code), with their French name shown to users.
const OPTIONS = {
  department: { type: 'string', short: 'd', french: 'departement' },
  basemap: { type: 'string', short: 'f', french: 'fond', default: 'plan-ign' },
  zoom: { type: 'string', short: 'z', default: '17' },
  output: { type: 'string', short: 'o', french: 'sortie' },
  margin: { type: 'string', french: 'marge', default: '0.03' },
  dpi: { type: 'string', default: '150' },
  color: { type: 'boolean', french: 'couleur', default: false },
  'no-outline': { type: 'boolean', french: 'sans-contour', default: false },
  estimate: { type: 'boolean', french: 'estimer', default: false },
  'max-tiles': { type: 'string', french: 'max-tuiles', default: '5000' },
  concurrency: { type: 'string', french: 'paralleles', default: '6' },
  cache: { type: 'string', default: '.cache/tiles' },
  help: { type: 'boolean', short: 'h', french: 'aide', default: false },
};

class UsageError extends Error {}

// True while the progress line has not been terminated by a line break.
let progressLineOpen = false;

async function main() {
  const { command, argument, options } = parseCommandLine();

  if (options.help || !command) {
    console.log(HELP);
  } else if (command === 'search' && argument) {
    await search(argument, options);
  } else if (command === 'basemaps') {
    listBasemaps();
  } else if (command === 'generate' && argument) {
    await generate(argument, options);
  } else {
    throw new UsageError(`Commande invalide.\n\n${HELP}`);
  }
}

/** Parses the command line, resolving French names to the English names used in code. */
function parseCommandLine() {
  const config = {};
  for (const [name, { type, short, french }] of Object.entries(OPTIONS)) {
    config[name] = short ? { type, short } : { type };
    if (french) config[french] = { type };
  }
  const { values, positionals } = parseArgs({ options: config, allowPositionals: true });

  const options = {};
  for (const [name, { french, default: defaultValue }] of Object.entries(OPTIONS)) {
    options[name] = values[name] ?? (french && values[french]) ?? defaultValue;
  }
  const [command, argument] = positionals;
  return { command: FRENCH_COMMANDS[command] ?? command, argument, options };
}

async function search(name, options) {
  const municipalities = await searchMunicipalities(name, options.department);
  if (municipalities.length === 0) throw new MunicipalityNotFound(`Aucune commune trouvée pour « ${name} ».`);
  for (const municipality of municipalities) console.log(describeMunicipality(municipality));
}

function listBasemaps() {
  for (const basemap of Object.values(BASEMAPS)) {
    console.log(`${basemap.id.padEnd(16)} ${basemap.name} (zoom max ${basemap.maxZoom}) — ${basemap.attribution}`);
  }
}

async function generate(input, options) {
  const basemap = BASEMAPS[options.basemap];
  if (!basemap) {
    throw new UsageError(`Fond inconnu : ${options.basemap}. Fonds disponibles : ${Object.keys(BASEMAPS).join(', ')}`);
  }
  const zoom = parseInteger(options.zoom, '--zoom', 0, basemap.maxZoom);
  const dpi = parseInteger(options.dpi, '--dpi', 1);
  const maxTiles = parseInteger(options['max-tiles'], '--max-tuiles', 1);
  const concurrency = parseInteger(options.concurrency, '--paralleles', 1);
  const margin = Number(options.margin);
  if (!(margin >= 0)) throw new UsageError('--marge doit être un nombre positif.');

  const inseeCode = await resolveMunicipality(input, options.department);
  const boundary = await fetchBoundary(inseeCode);
  const bbox = boundaryBbox(boundary);
  const extent = extentFromBbox(bbox, zoom, margin);

  console.log(`Commune       : ${boundary.name} (${boundary.inseeCode})`);
  console.log(`Fond de carte : ${basemap.name} — ${basemap.attribution}\n`);
  printEstimates(bbox, margin, basemap.maxZoom, zoom, dpi);
  console.log();
  if (options.estimate) return;

  if (extent.tileCount > maxTiles) {
    throw new UsageError(
      `${extent.tileCount} tuiles à télécharger, au-delà du garde-fou de ${maxTiles}. ` +
        'Baissez le zoom ou augmentez --max-tuiles.',
    );
  }

  const start = performance.now();
  console.log(`Téléchargement de ${extent.tileCount} tuiles (zoom ${zoom})…`);
  const tiles = await downloadTiles(basemap, extent, options.cache, concurrency, printProgress);
  const failedTiles = tiles.filter((tile) => tile.error);
  if (failedTiles.length > 0) {
    console.log(
      `  ${failedTiles.length} tuile(s) en échec malgré plusieurs tentatives, par exemple : ${failedTiles[0].error.message}`,
    );
  }

  console.log(`Assemblage d'une image de ${extent.width} × ${extent.height} px…`);
  const grayscale = !options.color;
  const { pixels, missing } = await assembleTiles(extent, tiles, { grayscale });
  if (missing > 0) {
    console.log(
      `  Attention : ${missing} tuile(s) indisponible(s), laissée(s) en blanc. ` +
        'Relancez la commande pour réessayer (les tuiles déjà téléchargées sont en cache).',
    );
  }

  const outputPath =
    options.output ??
    `sorties/${boundary.inseeCode}-${normalizeName(boundary.name).replaceAll(' ', '-')}-${basemap.id}-z${zoom}` +
      `${grayscale ? '-gris' : ''}.png`;
  if (!options['no-outline']) {
    console.log('Tracé du contour…');
    await drawOverlays(pixels, extent, [boundaryOutline(boundary, extent)]);
  }
  console.log(`Enregistrement dans ${outputPath}…`);
  await saveImage(pixels, extent, outputPath, { dpi });
  console.log(`Terminé en ${Math.round((performance.now() - start) / 1000)} s.`);
}

function printEstimates(bbox, margin, maxZoom, selectedZoom, dpi) {
  const latitude = (bbox[1] + bbox[3]) / 2;
  console.log(`   zoom   m/pixel           image (px)    tuiles   impression à ${dpi} dpi`);
  for (let zoom = Math.max(0, Math.min(selectedZoom, maxZoom - 6)); zoom <= maxZoom; zoom++) {
    const { width, height, tileCount } = extentFromBbox(bbox, zoom, margin);
    const [widthMm, heightMm] = printSizeMm(width, height, dpi);
    console.log(
      ` ${zoom === selectedZoom ? '→' : ' '} ${String(zoom).padStart(4)}   ${groundResolution(latitude, zoom).toFixed(2).padStart(7)}` +
        `   ${String(width).padStart(8)} × ${String(height).padEnd(8)} ${String(tileCount).padStart(7)}` +
        `   ${widthMm.toFixed(0).padStart(5)} × ${heightMm.toFixed(0).padEnd(5)} mm (${paperFormat(widthMm, heightMm)})`,
    );
  }
}

function printProgress(done, total) {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\r  ${done}/${total} tuiles (${Math.floor((done * 100) / total)} %)`);
  progressLineOpen = done < total;
  if (!progressLineOpen) process.stdout.write('\n');
}

function parseInteger(value, name, min, max = Infinity) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    const bounds = max === Infinity ? `supérieur ou égal à ${min}` : `compris entre ${min} et ${max}`;
    throw new UsageError(`${name} doit être un entier ${bounds}.`);
  }
  return number;
}

main().catch((error) => {
  if (progressLineOpen) process.stdout.write('\n');
  if (error instanceof MunicipalityNotFound || error instanceof UsageError) {
    console.error(error.message);
  } else {
    console.error(`Erreur : ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ''}`);
  }
  process.exitCode = 1;
});
