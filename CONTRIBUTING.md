# Contribuer à cartes

Merci de votre intérêt pour le projet ! Toutes les contributions sont les bienvenues : signalement de bug, idée, documentation ou code.

## Signaler un problème ou proposer une idée

Ouvrez une [issue](https://github.com/sebprunier/cartes/issues). Pour un bug, précisez la commande lancée, le résultat obtenu et le résultat attendu.

Pour une faille de sécurité, n'ouvrez pas d'issue publique : suivez la [politique de sécurité](SECURITY.md).

## Préparer son environnement

Il faut Node.js 22 ou plus récent, et git.

```sh
git clone https://github.com/sebprunier/cartes.git
cd cartes
npm install
npm test
node src/cli.js --aide
```

## Organisation du code

| Fichier                 | Rôle                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `src/cli.js`            | point d'entrée de la ligne de commande                                |
| `src/command-line.js`   | analyse des commandes et des options (noms français, alias anglais)   |
| `src/municipalities.js` | recherche des communes et récupération de leur contour                |
| `src/basemaps.js`       | catalogue des fonds de carte                                          |
| `src/tiles.js`          | calcul des tuiles à récupérer, téléchargement et cache                |
| `src/map.js`            | assemblage de l'image, surcouches SVG et formats d'impression         |
| `src/estimates.js`      | estimation de la mémoire nécessaire et du poids des fichiers          |
| `src/metadata.js`       | dates de mise à jour des données, lues dans le catalogue de la Géoplateforme |
| `src/http.js`           | requêtes HTTP                                                         |
| `test/`                 | tests unitaires (`node:test`)                                         |

## Conventions

- **Langues** : le code (noms, commentaires) est en anglais. La documentation, les messages affichés par l'outil et les messages de commit sont en français.
- **Ligne de commande** : chaque commande et chaque option a un nom français, affiché dans l'aide, et un alias anglais.
- **Style** : modules ES, indentation de 2 espaces, guillemets simples, points-virgules, lignes de 120 caractères au plus. En cas de doute, suivez le style du code existant.
- **Dépendances** : le moins possible. Discutez-en dans une issue avant d'en ajouter une.
- **Données** : avant d'ajouter une source de données, vérifiez que sa licence et ses conditions d'utilisation le permettent, puis complétez [Données utilisées et licences](docs/donnees-et-licences.md).

## Tests

`npm test` lance les tests unitaires. Ils n'appellent aucun service externe : les réponses de la Géoplateforme et des serveurs de tuiles sont simulées. Toute nouvelle fonctionnalité ou correction doit être accompagnée de tests.

Pour les essais manuels, ménagez les services publics utilisés : commencez par de petits niveaux de zoom et profitez du cache de tuiles (`.cache/tiles/`), qui évite de retélécharger.

## Proposer une modification

1. Pour un changement important, ouvrez d'abord une issue pour en discuter.
2. Forkez le dépôt et créez une branche.
3. Faites vos modifications, avec leurs tests, et vérifiez que `npm test` passe.
4. Pour une évolution notable pour les utilisateurs, ajoutez une ligne dans la section « Non publié » du [journal des modifications](CHANGELOG.md).
5. Ouvrez une pull request qui décrit le changement et sa motivation.

L'intégration continue (GitHub Actions) lance les tests sur Node.js 22, 24 et 26.

## Publier une version

Le projet suit le [versionnage sémantique](https://semver.org/lang/fr/). Pour publier la version `x.y.z` :

1. Dans le [journal des modifications](CHANGELOG.md), renommez la section « Non publié » en « [x.y.z] – date », ajoutez une nouvelle section « Non publié » vide au-dessus, et mettez à jour les liens en bas du fichier.
2. Commitez ce changement, puis lancez `npm version x.y.z -m "Publie la version %s"` : la commande met à jour `package.json` et `package-lock.json`, crée le commit et le tag `vx.y.z`.
3. Poussez le commit et le tag : `git push --follow-tags`.
4. Créez la release GitHub à partir du tag, avec la section du journal comme notes de version : `gh release create vx.y.z --title "x.y.z" --notes-file <notes>`.

## Licence

En contribuant, vous acceptez que vos contributions soient publiées sous la [licence MIT](LICENSE) du projet.

## Code de conduite

Ce projet applique un [code de conduite](CODE_OF_CONDUCT.md). En y participant, vous vous engagez à le respecter.
