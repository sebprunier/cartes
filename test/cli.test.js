import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
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

  describe('serveur', () => {
    // The variables of the instance are those of the test, whatever the environment that runs it.
    const settings = { CARTES_CLE_API: '', CARTES_COUCHES_PERSO: undefined, CARTES_HOTE: undefined };

    /** Starts `cartes serveur` on a free port, for the time of a test. */
    async function startServer(t, env = {}) {
      const child = spawn(process.execPath, ['src/node/cli.js', 'serveur', '--port', '0'], {
        env: { ...process.env, ...settings, ...env },
      });
      t.after(() => child.kill());
      let output = '';
      const port = await new Promise((resolve, reject) => {
        child.stdout.on('data', (chunk) => {
          output += chunk;
          // The port is on the first line, but the instance has said everything once it names its cache.
          const found = output.match(/sur le port (\d+)/);
          if (found && /Cache +:/.test(output)) resolve(Number(found[1]));
        });
        child.on('exit', (code) => reject(new Error(`cartes serveur s’est arrêté (${code}).`)));
      });
      const post = async (route, body) => {
        const response = await fetch(`http://127.0.0.1:${port}${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      };
      return { port, post, output: () => output };
    }

    // The service of a layer is read before the municipality is looked for: refused, it calls nothing at all.
    const internalWms = {
      commune: '86081',
      couchesPerso: [{ adresse: 'http://127.0.0.1:9/wms', couche: 'x', nom: 'Interne', source: '©' }],
    };

    it('refuses the layers whose address is on the network of the instance', async (t) => {
      const { post, output } = await startServer(t);
      assert.match(output(), /Couches perso : acceptées, sur le réseau public seulement/);
      const { status, body } = await post('/estimations', internalWms);
      assert.equal(status, 400);
      assert.match(body.erreur, /127\.0\.0\.1 est une adresse privée, que l’API ne consulte pas/);
    });

    it('refuses every layer added by its address with CARTES_COUCHES_PERSO=non', async (t) => {
      const { post } = await startServer(t, { CARTES_COUCHES_PERSO: 'non' });
      const { status, body } = await post('/estimations', internalWms);
      assert.equal(status, 400);
      assert.match(body.erreur, /^Cette instance n’accepte pas les couches ajoutées par leur adresse/);
    });

    it('listens to this machine only, unless asked to open to the network', async (t) => {
      const local = await startServer(t);
      assert.match(local.output(), /à l'écoute sur 127\.0\.0\.1, sur le port \d+\.\n  Réseau +: cette machine seulement/);
      const open = await startServer(t, { CARTES_HOTE: '0.0.0.0' });
      assert.match(open.output(), /à l'écoute sur 0\.0\.0\.0, sur le port \d+\.\n  Réseau +: ouvert/);
    });

    it('says in French that the address to listen to is not on this machine', async () => {
      await assert.rejects(
        promisify(execFile)(process.execPath, ['src/node/cli.js', 'serveur', '--port', '0', '--hote', '999.1.1.1']),
        (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stderr, /^Adresse d'écoute introuvable sur cette machine : 999\.1\.1\.1/);
          return true;
        },
      );
    });

    it('says in French that a setting is neither oui nor non', async () => {
      await assert.rejects(
        promisify(execFile)(process.execPath, ['src/node/cli.js', 'serveur', '--port', '0'], {
          env: { ...process.env, ...settings, CARTES_COUCHES_PERSO: 'peut-être' },
        }),
        (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stderr, /^CARTES_COUCHES_PERSO vaut oui ou non\./);
          return true;
        },
      );
    });
  });
});
