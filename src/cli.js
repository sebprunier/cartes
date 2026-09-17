#!/usr/bin/env node
// Command line interface.

import { BASEMAPS, withCurrentAttribution } from './basemaps.js';
import { HELP, UsageError, parseCommandLine, parseInteger } from './command-line.js';
import {
  assembleTiles,
  attributionLabel,
  attributionText,
  boundaryOutline,
  drawOverlays,
  paperFormat,
  printSizeMm,
  saveImage,
} from './map.js';
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
  const tiles = await downloadTiles(basemap, extent, { cacheDir: options.cache, concurrency, onProgress: printProgress });
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
  const outline = !options['no-outline'];
  const overlays = outline ? [boundaryOutline(boundary, extent)] : [];
  const attribution = attributionText({ basemap: await withCurrentAttribution(basemap), outline });
  overlays.push(await attributionLabel(attribution, extent));
  console.log(outline ? 'Tracé du contour et ajout de la mention des sources…' : 'Ajout de la mention des sources…');
  await drawOverlays(pixels, extent, overlays);
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

main().catch((error) => {
  if (progressLineOpen) process.stdout.write('\n');
  if (error instanceof MunicipalityNotFound || error instanceof UsageError) {
    console.error(error.message);
  } else {
    console.error(`Erreur : ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ''}`);
  }
  process.exitCode = 1;
});
