import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UsageError, parseCommandLine, parseInteger, resolveOutputPath } from '../src/command-line.js';

describe('parseCommandLine', () => {
  it('applies the default values', () => {
    const { command, argument, options } = parseCommandLine(['generer', '86081']);
    assert.equal(command, 'generate');
    assert.equal(argument, '86081');
    assert.equal(options.basemap, 'plan-ign');
    assert.equal(options.zoom, '17');
    assert.equal(options.grayscale, false);
    assert.equal(options.department, undefined);
    assert.equal(options.cache, '.cache/tiles');
  });

  it('accepts French and English names alike', () => {
    const french = parseCommandLine([
      'generer', '86081', '--departement', '86', '-f', 'ortho-ign', '--sortie', 'carte.jpg', '--marge', '0.1',
      '--gris', '--sans-contour', '--estimer', '--max-tuiles', '10', '--paralleles', '2', '--format', 'tif',
    ]);
    const english = parseCommandLine([
      'generate', '86081', '--department', '86', '--basemap', 'ortho-ign', '--output', 'carte.jpg', '--margin', '0.1',
      '--grayscale', '--no-outline', '--estimate', '--max-tiles', '10', '--concurrency', '2', '--format', 'tif',
    ]);
    assert.deepEqual(french, english);
    assert.equal(french.options.basemap, 'ortho-ign');
    assert.equal(french.options['no-outline'], true);
  });

  it('recognizes the version option', () => {
    assert.equal(parseCommandLine(['--version']).options.version, true);
    assert.equal(parseCommandLine(['-v']).options.version, true);
    assert.equal(parseCommandLine([]).options.version, false);
  });

  it('maps the French commands, with or without accent', () => {
    assert.equal(parseCommandLine(['chercher', 'x']).command, 'search');
    assert.equal(parseCommandLine(['fonds']).command, 'basemaps');
    assert.equal(parseCommandLine(['générer', 'x']).command, 'generate');
  });

  it('rejects unknown options with a message in French', () => {
    assert.throws(() => parseCommandLine(['generer', '86081', '--couleur']), {
      message: 'Option inconnue : --couleur. La liste des options est disponible avec cartes --aide.',
    });
    assert.throws(() => parseCommandLine(['generer', '86081', '-x']), /Option inconnue : -x\./);
  });

  it('rejects string options without value', () => {
    assert.throws(() => parseCommandLine(['generer', '86081', '--max-tuiles']), {
      message: "L'option --max-tuiles attend une valeur.",
    });
    assert.throws(() => parseCommandLine(['generer', '86081', '-z', '--gris']), {
      message: "L'option -z attend une valeur, et non « --gris ».",
    });
    assert.throws(() => parseCommandLine(['generer', '86081', '--marge', '-1']), {
      message: "L'option --marge attend une valeur, et non « -1 ». Pour une valeur négative, écrivez --marge=-1.",
    });
  });

  it('accepts values starting with a dash when written inline', () => {
    assert.equal(parseCommandLine(['generer', '86081', '--marge=-1']).options.margin, '-1');
  });

  it('rejects values given to boolean options', () => {
    assert.throws(() => parseCommandLine(['generer', '86081', '--gris=oui']), (error) => {
      assert.ok(error instanceof UsageError);
      assert.equal(error.message, "L'option --gris ne prend pas de valeur.");
      return true;
    });
  });
});

describe('resolveOutputPath', () => {
  const resolve = (options) => resolveOutputPath(options, 'jpg', 'sorties/86081-colombiers-ortho-ign-z17');

  it('uses the default format of the basemap for the default path', () => {
    assert.deepEqual(resolve({}), { path: 'sorties/86081-colombiers-ortho-ign-z17.jpg', format: 'jpg' });
  });

  it('uses the requested format, whatever its spelling', () => {
    assert.deepEqual(resolve({ format: 'png' }), { path: 'sorties/86081-colombiers-ortho-ign-z17.png', format: 'png' });
    assert.deepEqual(resolve({ format: 'TIFF' }), { path: 'sorties/86081-colombiers-ortho-ign-z17.tif', format: 'tif' });
  });

  it('keeps the output file given with an extension', () => {
    assert.deepEqual(resolve({ output: 'carte.png' }), { path: 'carte.png', format: 'png' });
    assert.deepEqual(resolve({ output: 'carte.jpeg', format: 'jpg' }), { path: 'carte.jpeg', format: 'jpg' });
  });

  it('adds the extension of the format to an output file without extension', () => {
    assert.deepEqual(resolve({ output: 'sorties/carte' }), { path: 'sorties/carte.jpg', format: 'jpg' });
    assert.deepEqual(resolve({ output: 'sorties/carte', format: 'tif' }), { path: 'sorties/carte.tif', format: 'tif' });
  });

  it('rejects unknown formats and extensions', () => {
    assert.throws(() => resolve({ format: 'gif' }), { message: 'Format inconnu : gif. Formats disponibles : png, jpg, tif.' });
    assert.throws(() => resolve({ output: 'carte.gif' }), UsageError);
  });

  it('rejects a format that does not match the extension of the output file', () => {
    assert.throws(() => resolve({ output: 'carte.jpg', format: 'png' }), /ne correspond pas/);
  });
});

describe('parseInteger', () => {
  it('returns integers within bounds', () => {
    assert.equal(parseInteger('17', '--zoom', 0, 19), 17);
  });

  it('rejects values out of bounds or not integers', () => {
    for (const value of ['20', '-1', '1.5', 'abc', '']) {
      assert.throws(() => parseInteger(value, '--zoom', 0, 19), UsageError, value);
    }
  });
});
