#!/usr/bin/env node
// Interface en ligne de commande.

import { parseArgs } from 'node:util';

import { assembler, dessinerSurcouches, enregistrer, formatPapier, tailleImpressionMm, traceContour } from './carte.js';
import {
  CommuneIntrouvable,
  bbox,
  choisirCommune,
  decrire,
  normaliser,
  rechercherCommunes,
  recupererContour,
} from './communes.js';
import { FONDS } from './fonds.js';
import { empriseDepuisBbox, resolutionSol, telechargerTuiles } from './tuiles.js';

const AIDE = `Génère une carte détaillée d'une commune en recollant des tuiles de fond de carte.

Usage :
  cartes chercher <nom> [-d <département>]   rechercher une commune par son nom
  cartes fonds                                lister les fonds de carte disponibles
  cartes generer <commune> [options]          générer la carte d'une commune (nom ou code INSEE)

Options de « generer » :
  -d, --departement <code>  département, pour lever une homonymie (ex. 86)
  -f, --fond <id>           fond de carte (défaut : plan-ign)
  -z, --zoom <n>            niveau de zoom des tuiles (défaut : 17)
  -o, --sortie <fichier>    fichier .png, .jpg ou .tif (défaut : sorties/<commune>-<fond>-z<zoom>.png)
      --marge <fraction>    marge autour de la commune (défaut : 0.03)
      --dpi <n>             résolution d'impression visée (défaut : 150)
      --gris                fond de carte en niveaux de gris
      --sans-contour        ne pas tracer le contour de la commune
      --estimer             afficher les tailles par niveau de zoom sans rien télécharger
      --max-tuiles <n>      garde-fou sur le nombre de tuiles (défaut : 5000)
      --paralleles <n>      téléchargements simultanés (défaut : 6)
      --cache <dossier>     dossier de cache des tuiles (défaut : .cache/tuiles)`;

const OPTIONS = {
  departement: { type: 'string', short: 'd' },
  fond: { type: 'string', short: 'f', default: 'plan-ign' },
  zoom: { type: 'string', short: 'z', default: '17' },
  sortie: { type: 'string', short: 'o' },
  marge: { type: 'string', default: '0.03' },
  dpi: { type: 'string', default: '150' },
  gris: { type: 'boolean', default: false },
  'sans-contour': { type: 'boolean', default: false },
  estimer: { type: 'boolean', default: false },
  'max-tuiles': { type: 'string', default: '5000' },
  paralleles: { type: 'string', default: '6' },
  cache: { type: 'string', default: '.cache/tuiles' },
  aide: { type: 'boolean', short: 'h', default: false },
};

class ErreurUtilisation extends Error {}

async function main() {
  const { values: options, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true });
  const [commande, argument] = positionals;

  if (options.aide || !commande) {
    console.log(AIDE);
  } else if (commande === 'chercher' && argument) {
    await chercher(argument, options);
  } else if (commande === 'fonds') {
    fonds();
  } else if (commande === 'generer' && argument) {
    await generer(argument, options);
  } else {
    throw new ErreurUtilisation(`Commande invalide.\n\n${AIDE}`);
  }
}

async function chercher(nom, options) {
  const communes = await rechercherCommunes(nom, options.departement);
  if (communes.length === 0) throw new CommuneIntrouvable(`Aucune commune trouvée pour « ${nom} ».`);
  for (const commune of communes) console.log(decrire(commune));
}

function fonds() {
  for (const fond of Object.values(FONDS)) {
    console.log(`${fond.identifiant.padEnd(16)} ${fond.nom} (zoom max ${fond.zoomMax}) — ${fond.attribution}`);
  }
}

async function generer(saisie, options) {
  const fond = FONDS[options.fond];
  if (!fond) throw new ErreurUtilisation(`Fond inconnu : ${options.fond}. Fonds disponibles : ${Object.keys(FONDS).join(', ')}`);
  const zoom = entier(options.zoom, '--zoom', 0, fond.zoomMax);
  const dpi = entier(options.dpi, '--dpi', 1);
  const maxTuiles = entier(options['max-tuiles'], '--max-tuiles', 1);
  const paralleles = entier(options.paralleles, '--paralleles', 1);
  const marge = Number(options.marge);
  if (!(marge >= 0)) throw new ErreurUtilisation('--marge doit être un nombre positif.');

  const codeInsee = await choisirCommune(saisie, options.departement);
  const contour = await recupererContour(codeInsee);
  const bboxCommune = bbox(contour);
  const emprise = empriseDepuisBbox(bboxCommune, zoom, marge);

  console.log(`Commune       : ${contour.nom} (${contour.codeInsee})`);
  console.log(`Fond de carte : ${fond.nom} — ${fond.attribution}\n`);
  afficherEstimations(bboxCommune, marge, fond.zoomMax, zoom, dpi);
  console.log();
  if (options.estimer) return;

  if (emprise.nombreTuiles > maxTuiles) {
    throw new ErreurUtilisation(
      `${emprise.nombreTuiles} tuiles à télécharger, au-delà du garde-fou de ${maxTuiles}. ` +
        'Baissez le zoom ou augmentez --max-tuiles.',
    );
  }

  const debut = performance.now();
  console.log(`Téléchargement de ${emprise.nombreTuiles} tuiles (zoom ${zoom})…`);
  const tuiles = await telechargerTuiles(fond, emprise, options.cache, paralleles, afficherProgression);
  const enErreur = tuiles.filter((tuile) => tuile.erreur);
  if (enErreur.length > 0) {
    console.log(`  ${enErreur.length} tuile(s) en échec malgré plusieurs tentatives, par exemple : ${enErreur[0].erreur.message}`);
  }

  console.log(`Assemblage d'une image de ${emprise.largeur} × ${emprise.hauteur} px…`);
  const { pixels, manquantes } = await assembler(emprise, tuiles, { gris: options.gris });
  if (manquantes > 0) {
    console.log(
      `  Attention : ${manquantes} tuile(s) indisponible(s), laissée(s) en blanc. ` +
        'Relancez la commande pour réessayer (les tuiles déjà téléchargées sont en cache).',
    );
  }

  const sortie =
    options.sortie ??
    `sorties/${contour.codeInsee}-${normaliser(contour.nom).replaceAll(' ', '-')}-${fond.identifiant}-z${zoom}${options.gris ? '-gris' : ''}.png`;
  if (!options['sans-contour']) {
    console.log('Tracé du contour…');
    await dessinerSurcouches(pixels, emprise, [traceContour(contour, emprise)]);
  }
  console.log(`Enregistrement dans ${sortie}…`);
  await enregistrer(pixels, emprise, sortie, { dpi });
  console.log(`Terminé en ${Math.round((performance.now() - debut) / 1000)} s.`);
}

function afficherEstimations(bboxCommune, marge, zoomMax, zoomChoisi, dpi) {
  const latitude = (bboxCommune[1] + bboxCommune[3]) / 2;
  console.log(`   zoom   m/pixel           image (px)    tuiles   impression à ${dpi} dpi`);
  for (let zoom = Math.max(0, Math.min(zoomChoisi, zoomMax - 6)); zoom <= zoomMax; zoom++) {
    const { largeur, hauteur, nombreTuiles } = empriseDepuisBbox(bboxCommune, zoom, marge);
    const [largeurMm, hauteurMm] = tailleImpressionMm(largeur, hauteur, dpi);
    console.log(
      ` ${zoom === zoomChoisi ? '→' : ' '} ${String(zoom).padStart(4)}   ${resolutionSol(latitude, zoom).toFixed(2).padStart(7)}` +
        `   ${String(largeur).padStart(8)} × ${String(hauteur).padEnd(8)} ${String(nombreTuiles).padStart(7)}` +
        `   ${largeurMm.toFixed(0).padStart(5)} × ${hauteurMm.toFixed(0).padEnd(5)} mm (${formatPapier(largeurMm, hauteurMm)})`,
    );
  }
}

// Vrai tant que la ligne de progression n'est pas terminée par un retour à la ligne.
let progressionEnCours = false;

function afficherProgression(faites, total) {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\r  ${faites}/${total} tuiles (${Math.floor((faites * 100) / total)} %)`);
  progressionEnCours = faites < total;
  if (!progressionEnCours) process.stdout.write('\n');
}

function entier(valeur, nom, min, max = Infinity) {
  const nombre = Number(valeur);
  if (!Number.isInteger(nombre) || nombre < min || nombre > max) {
    const bornes = max === Infinity ? `supérieur ou égal à ${min}` : `compris entre ${min} et ${max}`;
    throw new ErreurUtilisation(`${nom} doit être un entier ${bornes}.`);
  }
  return nombre;
}

main().catch((erreur) => {
  if (progressionEnCours) process.stdout.write('\n');
  if (erreur instanceof CommuneIntrouvable || erreur instanceof ErreurUtilisation) {
    console.error(erreur.message);
  } else {
    console.error(`Erreur : ${erreur.message}${erreur.cause ? ` (${erreur.cause.message ?? erreur.cause})` : ''}`);
  }
  process.exitCode = 1;
});
