import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UsageError, parseCommandLine, parseInteger } from '../src/command-line.js';

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
      '--gris', '--sans-contour', '--estimer', '--max-tuiles', '10', '--paralleles', '2',
    ]);
    const english = parseCommandLine([
      'generate', '86081', '--department', '86', '--basemap', 'ortho-ign', '--output', 'carte.jpg', '--margin', '0.1',
      '--grayscale', '--no-outline', '--estimate', '--max-tiles', '10', '--concurrency', '2',
    ]);
    assert.deepEqual(french, english);
    assert.equal(french.options.basemap, 'ortho-ign');
    assert.equal(french.options['no-outline'], true);
  });

  it('maps the French commands, with or without accent', () => {
    assert.equal(parseCommandLine(['chercher', 'x']).command, 'search');
    assert.equal(parseCommandLine(['fonds']).command, 'basemaps');
    assert.equal(parseCommandLine(['générer', 'x']).command, 'generate');
  });

  it('rejects unknown options', () => {
    assert.throws(() => parseCommandLine(['generer', '86081', '--couleur']), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' });
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
