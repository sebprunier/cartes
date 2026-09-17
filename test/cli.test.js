import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const run = (...args) => promisify(execFile)(process.execPath, ['src/cli.js', ...args]);

// These tests run the command line itself, for the commands that do not call any external service.
describe('cartes', () => {
  it('prints the version of package.json', async () => {
    const { version } = JSON.parse(await readFile('package.json', 'utf8'));
    for (const option of ['--version', '-v']) {
      const { stdout } = await run(option);
      assert.equal(stdout, `${version}\n`);
    }
  });

  it('prints the help', async () => {
    const { stdout } = await run('--aide');
    assert.match(stdout, /^Génère une carte détaillée d'une commune/);
  });

  it('exits with code 1 and a French message on an unknown option', async () => {
    await assert.rejects(run('generer', '86081', '--inconnue'), (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr, 'Option inconnue : --inconnue. La liste des options est disponible avec cartes --aide.\n');
      return true;
    });
  });
});
