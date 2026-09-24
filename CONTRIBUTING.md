# Contribuer à cartes

Merci de votre intérêt pour le projet ! Toutes les contributions sont les bienvenues : signalement de bug, idée, documentation ou code.

## Signaler un problème ou proposer une idée

Ouvrez une [issue](https://github.com/sebprunier/cartes/issues). Pour un bug, précisez la commande lancée, le résultat obtenu et le résultat attendu.

Pour une faille de sécurité, n'ouvrez pas d'issue publique : suivez la [politique de sécurité](SECURITY.md).

Les issues portent deux sortes de labels, que vous n'avez pas à choisir vous-même :

- **la partie du projet concernée**, en français : `ligne de commande`, `page web`, `application`, `données`. Une issue peut en porter plusieurs, ou aucune quand elle concerne le projet entier ;
- **la nature du travail**, avec les labels de GitHub : `bug`, `enhancement`, `documentation`, `question` pour une décision à prendre, `accessibility`.

## Préparer son environnement

Il faut Node.js 22 ou plus récent, et git.

```sh
git clone https://github.com/sebprunier/cartes.git
cd cartes
npm install
npm test
node src/node/cli.js --aide
```

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `src/core/` | cœur partagé, sans dépendance à Node ni à sharp : il doit pouvoir tourner dans un navigateur |
| `src/core/basemaps.js` | catalogue des fonds de carte |
| `src/core/maplayers.js` | catalogue des couches superposables (cadastre, argiles…) |
| `src/core/pmtiles.js` | lecture d'une archive PMTiles par plages d'octets |
| `src/core/mvt.js` | décodage des tuiles vectorielles (protobuf) |
| `src/core/vectortiles.js` | tuiles d'une couche vectorielle, et formes en pixels |
| `src/core/wms.js` | requêtes d'images à un service WMS, par blocs |
| `src/core/municipalities.js` | recherche des communes et récupération de leur contour |
| `src/core/metadata.js` | dates de mise à jour des données, lues dans le catalogue de la Géoplateforme |
| `src/core/tiles.js` | calcul des tuiles, échantillonnage et téléchargement |
| `src/core/image.js` | assemblage des tuiles décodées en pixels |
| `src/core/overlays.js` | géométrie, texte et styles du contour et de la mention des sources |
| `src/core/layers.js` | lecture des données ajoutées (GeoJSON, CSV) et conversion en formes |
| `src/core/geocoding.js` | géocodage des adresses d'un CSV par la Géoplateforme, et classement de chaque réponse |
| `src/core/print.js` | tailles d'impression et formats de papier |
| `src/core/estimates.js` | mémoire nécessaire et poids estimé des fichiers |
| `src/core/http.js` | requêtes HTTP |
| `src/node/cli.js` | point d'entrée de la ligne de commande |
| `src/node/command-line.js` | analyse des commandes et des options (noms français, alias anglais) |
| `src/node/generate.js` | génération d'une carte et estimation de son poids, partagées par la ligne de commande, l'application et l'API |
| `src/node/server.js` | API HTTP : `cartes serveur` |
| `src/node/openapi.js` | description OpenAPI 3.1 de l'API, servie par l'API elle-même |
| `src/node/api-fields.js` | champs d'une demande à l'API, en français et en anglais, lus par le serveur et décrits en OpenAPI |
| `src/node/cache.js` | cache des tuiles sur disque |
| `src/node/render.js` | rendu avec sharp : décodage des tuiles, surcouches et écriture du fichier |
| `web/` | page web : interface, moteur de rendu sur canvas, aperçu et worker |
| `web/preview.js` | aperçu avant génération : miniature de la commune et extrait à l'échelle réelle |
| `electron/` | application de bureau : processus principal, pont vers l'interface et moteur de rendu |
| `scripts/build-web.js` | construit le site dans `dist/` : la documentation à la racine, la page de génération dans `dist/generer/` (avec `--serve`, sert le tout en local) |
| `scripts/build-docs.js` | construit le site de la documentation à la racine de `dist/`, à partir de `docs/` ; lancé seul, liste les captures d'écran à venir |
| `scripts/build-electron.js` | construit l'interface de l'application dans `dist-electron/` |
| `scripts/mesure-navigateurs.js` | sert une page qui mesure le canevas d'un navigateur — taille maximale, échec au-delà, poids de ses encodeurs — à partir des tuiles de Colombiers en cache (`npm run mesure:navigateurs`) |
| `scripts/illustrations.js` | redessine les illustrations de la documentation à partir de vraies cartes de Colombiers (`npm run illustrations`, demande le réseau ou le cache des tuiles) |
| `test/` | tests unitaires (`node:test`) |

## Conventions

- **Langues** : le code (noms, commentaires) est en anglais. La documentation, les messages affichés par l'outil et les messages de commit sont en français.
- **Ligne de commande** : chaque commande et chaque option a un nom français, affiché dans l'aide, et un alias anglais.
- **Style** : modules ES, indentation de 2 espaces, guillemets simples, points-virgules, lignes de 120 caractères au plus. En cas de doute, suivez le style du code existant.
- **Cœur partagé** : `src/core/` ne doit importer ni module `node:`, ni sharp. Ce code sert aussi à la page web et à l'application Electron ; un test le vérifie.
- **Dépendances** : le moins possible. sharp est la seule dépendance d'exécution : discutez-en dans une issue avant d'en ajouter une. Les outils de construction et de test (`devDependencies`) ne partent ni dans l'application ni sur un serveur, et demandent moins de précautions — tant que les tests tournent sans réseau.
- **Documentation** : les pages du site sont écrites en Markdown dans `docs/`, et déclarées dans `scripts/build-docs.js`. Elles doivent rester lisibles telles quelles sur GitHub ; un test vérifie que chaque page est publiée et que ses liens aboutissent.
- **Données** : avant d'ajouter une source de données, vérifiez que sa licence et ses conditions d'utilisation le permettent, puis complétez [Données utilisées et licences](docs/donnees-et-licences.md).
- **Assistants de code** : si vous travaillez avec un assistant, [CLAUDE.md](CLAUDE.md) rassemble les consignes du projet et les pièges déjà rencontrés.

## Tests

`npm test` lance les tests unitaires. Ils n'appellent aucun service externe : les réponses de la Géoplateforme et des serveurs de tuiles sont simulées. Toute nouvelle fonctionnalité ou correction doit être accompagnée de tests.

Pour les essais manuels, ménagez les services publics utilisés : commencez par de petits niveaux de zoom et profitez du cache de tuiles (`.cache/tiles/`), qui évite de retélécharger.

## Proposer une modification

1. Pour un changement important, ouvrez d'abord une issue pour en discuter.
2. Forkez le dépôt et créez une branche.
3. Faites vos modifications, avec leurs tests, et vérifiez que `npm test` passe.
4. Pour une évolution notable pour les utilisateurs, ajoutez une ligne dans la section « Non publié » du [journal des modifications](CHANGELOG.md).
5. Ouvrez une pull request qui décrit le changement et sa motivation.

L'intégration continue (GitHub Actions) lance les tests sur Node.js 22, 24 et 26, et déploie la page web sur GitHub Pages à chaque push sur `main`.

Pour travailler sur la page web : `npm run web`, puis <http://localhost:8000>. Le script recopie `src/core/` à côté des fichiers de `web/`, donc relancez-le après chaque modification.

Pour l'application de bureau : `npm run electron`. Elle réutilise l'interface de `web/`, avec un moteur de rendu différent (`electron/engine.js` remplace `web/engine.js`) : la page web rend dans le navigateur, l'application rend dans son processus principal avec sharp.

## Publier une version

Le projet suit le [versionnage sémantique](https://semver.org/lang/fr/). Pour publier la version `x.y.z` :

1. Dans le [journal des modifications](CHANGELOG.md), renommez la section « Non publié » en « [x.y.z] – date », ajoutez une nouvelle section « Non publié » vide au-dessus, et mettez à jour les liens en bas du fichier.
2. Commitez ce changement, puis lancez `npm version x.y.z -m "Publie la version %s"` : la commande met à jour `package.json` et `package-lock.json`, crée le commit et le tag `vx.y.z`.
3. Poussez le commit et le tag : `git push --follow-tags`. Le workflow « Installeurs » construit alors les applications de bureau pour macOS, Windows et Linux, et les joint à la release.
4. Créez la release GitHub à partir du tag, avec la section du journal comme notes de version : `gh release create vx.y.z --title "x.y.z" --notes-file <notes>`. Si le workflow arrive avant, il crée une release provisoire : modifiez alors ses notes au lieu d'en créer une.

Le workflow « Installeurs » se lance aussi à la demande, depuis l'onglet Actions, pour vérifier que l'empaquetage fonctionne sans publier de version. Il accepte alors le nom de l'image Linux de construction (`ubuntu-24.04`, `ubuntu-26.04`…), ce qui permet d'éprouver la prochaine avant que `ubuntu-latest` n'y passe de lui-même.

## Licence

En contribuant, vous acceptez que vos contributions soient publiées sous la [licence MIT](LICENSE) du projet.

## Code de conduite

Ce projet applique un [code de conduite](CODE_OF_CONDUCT.md). En y participant, vous vous engagez à le respecter.
