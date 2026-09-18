// Command line parsing. Commands and options are shown in French, with English aliases.

import path from 'node:path';
import { parseArgs } from 'node:util';

export const HELP = `Génère une carte détaillée d'une commune en recollant des tuiles de fond de carte.

Usage :
  cartes chercher <nom> [-d <département>]   rechercher une commune par son nom
  cartes fonds                               lister les fonds de carte disponibles
  cartes generer <commune> [options]         générer la carte d'une commune, par nom ou code INSEE

Options de « generer » :
  -d, --departement <code>  département, pour lever une homonymie, ex. 86
  -f, --fond <id>           fond de carte, défaut : plan-ign
  -z, --zoom <n>            niveau de zoom des tuiles, défaut : 17
      --donnees <fichier>   données à ajouter sur la carte (.geojson ou .csv), répétable
      --donnees-categorie <propriete>
                            propriété qui porte la catégorie des objets : une entrée de légende et une couleur
                            par catégorie ; par défaut : categorie, catégorie, category, type, groupe
      --donnees-couleur <propriete>
                            propriété qui porte la couleur des objets ; par défaut : couleur, color
                            (les styles écrits dans le fichier sont toujours respectés)
  -o, --sortie <fichier>    fichier de sortie, défaut : sorties/<commune>-<fond>-z<zoom>[-gris].<format>
      --format <format>     png, jpg ou tif ; défaut : jpg pour les photographies aériennes (ortho-ign), png sinon
      --marge <fraction>    marge autour de la commune, défaut : 0.03
      --dpi <n>             résolution d'impression visée, défaut : 150
      --gris                fond de carte en niveaux de gris
      --sans-contour        ne pas tracer le contour de la commune
      --sans-legende        ne pas afficher la légende des données ajoutées
      --estimer             afficher, par niveau de zoom, les dimensions, la mémoire et le poids estimé du fichier,
                            sans générer la carte (un échantillon de tuiles est téléchargé)
      --max-tuiles <n>      garde-fou sur le nombre de tuiles, défaut : 5000
      --paralleles <n>      téléchargements simultanés, défaut : 6
      --cache <dossier>     dossier de cache des tuiles, défaut : .cache/tiles
  -h, --aide                afficher cette aide
  -v, --version             afficher la version de cartes

Les commandes et options existent aussi en anglais : search, basemaps, generate, --department, --basemap,
--data, --data-category, --data-color, --output, --margin, --grayscale, --no-outline, --no-legend,
--estimate, --max-tiles, --concurrency, --help.`;

// French command names, mapped to the English names used in code (which are accepted too).
export const FRENCH_COMMANDS = { chercher: 'search', fonds: 'basemaps', generer: 'generate', générer: 'generate' };

// Options are keyed by their English name (used in code), with their French name shown to users.
export const OPTIONS = {
  department: { type: 'string', short: 'd', french: 'departement' },
  basemap: { type: 'string', short: 'f', french: 'fond', default: 'plan-ign' },
  zoom: { type: 'string', short: 'z', default: '17' },
  data: { type: 'string', french: 'donnees', multiple: true, default: [] },
  'data-category': { type: 'string', french: 'donnees-categorie' },
  'data-color': { type: 'string', french: 'donnees-couleur' },
  output: { type: 'string', short: 'o', french: 'sortie' },
  format: { type: 'string' },
  margin: { type: 'string', french: 'marge', default: '0.03' },
  dpi: { type: 'string', default: '150' },
  grayscale: { type: 'boolean', french: 'gris', default: false },
  'no-outline': { type: 'boolean', french: 'sans-contour', default: false },
  'no-legend': { type: 'boolean', french: 'sans-legende', default: false },
  estimate: { type: 'boolean', french: 'estimer', default: false },
  'max-tiles': { type: 'string', french: 'max-tuiles', default: '5000' },
  concurrency: { type: 'string', french: 'paralleles', default: '6' },
  cache: { type: 'string', default: '.cache/tiles' },
  help: { type: 'boolean', short: 'h', french: 'aide', default: false },
  version: { type: 'boolean', short: 'v', default: false },
};

export class UsageError extends Error {}

/** Parses the command line, resolving French names to the English names used in code. */
export function parseCommandLine(args = process.argv.slice(2)) {
  const config = {};
  for (const [name, { type, short, french, multiple }] of Object.entries(OPTIONS)) {
    config[name] = { type, ...(short && { short }), ...(multiple && { multiple }) };
    if (french) config[french] = { type, ...(multiple && { multiple }) };
  }
  // Parsed in non strict mode so that option errors are reported in French by checkOptions.
  const { values, positionals, tokens } = parseArgs({
    args,
    options: config,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  checkOptions(tokens, config);

  const options = {};
  for (const [name, { french, multiple, default: defaultValue }] of Object.entries(OPTIONS)) {
    options[name] = multiple
      ? [...(values[name] ?? []), ...((french && values[french]) ?? [])]
      : (values[name] ?? (french && values[french]) ?? defaultValue);
  }
  const [command, argument] = positionals;
  return { command: FRENCH_COMMANDS[command] ?? command, argument, options };
}

/** Reports, in French, the option errors that parseArgs reports in strict mode. */
function checkOptions(tokens, config) {
  for (const { kind, name, rawName, value, inlineValue } of tokens) {
    if (kind !== 'option') continue;
    const option = config[name];
    if (!option) {
      throw new UsageError(`Option inconnue : ${rawName}. La liste des options est disponible avec cartes --aide.`);
    }
    if (option.type === 'boolean' && value !== undefined) {
      throw new UsageError(`L'option ${rawName} ne prend pas de valeur.`);
    }
    if (option.type === 'string' && value === undefined) {
      throw new UsageError(`L'option ${rawName} attend une valeur.`);
    }
    if (option.type === 'string' && !inlineValue && value.startsWith('-')) {
      // The value looks like another option: most likely a forgotten value, or a negative number.
      const hint = /^-\d/.test(value) ? ` Pour une valeur négative, écrivez ${rawName}=${value}.` : '';
      throw new UsageError(`L'option ${rawName} attend une valeur, et non « ${value} ».${hint}`);
    }
  }
}

// Output formats, by name or file extension.
const OUTPUT_FORMATS = { png: 'png', jpg: 'jpg', jpeg: 'jpg', tif: 'tif', tiff: 'tif' };

/**
 * Path and format of the output file. The format comes from --format, else from the extension of --sortie, else from the
 * default format; the extension of the format is added to a --sortie without extension and to the default path.
 */
export function resolveOutputPath({ output, format }, defaultFormat, defaultPathWithoutExtension) {
  const requestedFormat = format === undefined ? undefined : OUTPUT_FORMATS[format.toLowerCase()];
  if (format !== undefined && !requestedFormat) {
    throw new UsageError(`Format inconnu : ${format}. Formats disponibles : png, jpg, tif.`);
  }
  if (output === undefined) {
    const chosenFormat = requestedFormat ?? defaultFormat;
    return { path: `${defaultPathWithoutExtension}.${chosenFormat}`, format: chosenFormat };
  }

  const extension = path.extname(output).slice(1);
  if (!extension) {
    const chosenFormat = requestedFormat ?? defaultFormat;
    return { path: `${output}.${chosenFormat}`, format: chosenFormat };
  }
  const extensionFormat = OUTPUT_FORMATS[extension.toLowerCase()];
  if (!extensionFormat) {
    throw new UsageError(`Extension non gérée pour le fichier de sortie : .${extension} (utilisez .png, .jpg ou .tif).`);
  }
  if (requestedFormat && requestedFormat !== extensionFormat) {
    throw new UsageError(`Le format demandé (${format}) ne correspond pas à l'extension du fichier de sortie : ${output}.`);
  }
  return { path: output, format: extensionFormat };
}

/** Parses an integer option value, checking its bounds. */
export function parseInteger(value, name, min, max = Infinity) {
  // Number('') is 0: an empty value must not be read as zero.
  const number = value.trim() === '' ? NaN : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    const bounds = max === Infinity ? `supérieur ou égal à ${min}` : `compris entre ${min} et ${max}`;
    throw new UsageError(`${name} doit être un entier ${bounds}.`);
  }
  return number;
}
