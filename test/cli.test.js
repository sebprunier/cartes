import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const run = (...args) => promisify(execFile)(process.execPath, ['src/node/cli.js', ...args]);

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

  it('asks for the layer of a WMS given by its address alone, before calling anything', async () => {
    await assert.rejects(
      run('generer', '86081', '--couche-perso', 'https://exemple.fr/wms', '--couche-perso-nom', 'Zonage', '--couche-perso-source', '© Exemple'),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /^https:\/\/exemple\.fr\/wms n'est pas un gabarit de tuiles .* --couche-perso-couche\./);
        return true;
      },
    );
  });

  describe('geocoder', () => {
    const withFile = async (content, test) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'cartes-cli-'));
      const file = path.join(dir, 'lieux.csv');
      await writeFile(file, content);
      try {
        await test(file);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    };
    const failsWith = (promise, message) =>
      assert.rejects(promise, (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, message);
        return true;
      });

    it('asks for the municipality the search is kept to', () =>
      withFile('nom;adresse\nMairie;Place de Manderen\n', (file) =>
        failsWith(run('geocoder', file), /^Précisez la commune des adresses : --commune/),
      ));

    it('says at once, before asking the network, that a file has no address', () =>
      withFile('nom;commentaire\nMairie;ouverte le lundi\n', (file) =>
        failsWith(run('geocoder', file, '--commune', '86081'), /aucune colonne d’adresse/),
      ));

    it('points generer, given a file of addresses, to the command that geocodes it', () =>
      withFile('nom;adresse\nMairie;Place de Manderen\n', (file) =>
        failsWith(
          run('generer', '86081', '--donnees', file),
          new RegExp(`pas de coordonnées[\\s\\S]*Pour le géocoder : cartes geocoder ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} --commune 86081`),
        ),
      ));
  });
});
