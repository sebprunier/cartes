// Command line parsing. Commands and options are shown in French, with English aliases.

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
  -o, --sortie <fichier>    fichier .png, .jpg ou .tif, défaut : sorties/<commune>-<fond>-z<zoom>[-gris].png
      --marge <fraction>    marge autour de la commune, défaut : 0.03
      --dpi <n>             résolution d'impression visée, défaut : 150
      --gris                fond de carte en niveaux de gris
      --sans-contour        ne pas tracer le contour de la commune
      --estimer             afficher les tailles par niveau de zoom sans rien télécharger
      --max-tuiles <n>      garde-fou sur le nombre de tuiles, défaut : 5000
      --paralleles <n>      téléchargements simultanés, défaut : 6
      --cache <dossier>     dossier de cache des tuiles, défaut : .cache/tiles
  -h, --aide                afficher cette aide

Les commandes et options existent aussi en anglais : search, basemaps, generate, --department,
--basemap, --output, --margin, --grayscale, --no-outline, --estimate, --max-tiles, --concurrency, --help.`;

// French command names, mapped to the English names used in code (which are accepted too).
export const FRENCH_COMMANDS = { chercher: 'search', fonds: 'basemaps', generer: 'generate', générer: 'generate' };

// Options are keyed by their English name (used in code), with their French name shown to users.
export const OPTIONS = {
  department: { type: 'string', short: 'd', french: 'departement' },
  basemap: { type: 'string', short: 'f', french: 'fond', default: 'plan-ign' },
  zoom: { type: 'string', short: 'z', default: '17' },
  output: { type: 'string', short: 'o', french: 'sortie' },
  margin: { type: 'string', french: 'marge', default: '0.03' },
  dpi: { type: 'string', default: '150' },
  grayscale: { type: 'boolean', french: 'gris', default: false },
  'no-outline': { type: 'boolean', french: 'sans-contour', default: false },
  estimate: { type: 'boolean', french: 'estimer', default: false },
  'max-tiles': { type: 'string', french: 'max-tuiles', default: '5000' },
  concurrency: { type: 'string', french: 'paralleles', default: '6' },
  cache: { type: 'string', default: '.cache/tiles' },
  help: { type: 'boolean', short: 'h', french: 'aide', default: false },
};

export class UsageError extends Error {}

/** Parses the command line, resolving French names to the English names used in code. */
export function parseCommandLine(args = process.argv.slice(2)) {
  const config = {};
  for (const [name, { type, short, french }] of Object.entries(OPTIONS)) {
    config[name] = short ? { type, short } : { type };
    if (french) config[french] = { type };
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
  for (const [name, { french, default: defaultValue }] of Object.entries(OPTIONS)) {
    options[name] = values[name] ?? (french && values[french]) ?? defaultValue;
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
