# Consignes pour les assistants de code

Ce fichier s'adresse à Claude Code et aux autres assistants qui travaillent sur ce dépôt. Les règles du projet sont dans [CONTRIBUTING.md](CONTRIBUTING.md) : lisez-le d'abord. Ce fichier ne répète que ce qui se perd le plus souvent, et ajoute ce qui ne s'y trouve pas.

## Ce qui n'est pas négociable

- **Langues** : le code — identifiants et commentaires — est en anglais. La documentation, les messages affichés par l'outil et les messages de commit sont en français. Les commandes et les options de la ligne de commande portent un nom français, avec un alias anglais.
- **Cœur partagé** : `src/core/` n'importe ni module `node:`, ni sharp. Ce code tourne aussi dans un navigateur et dans un worker ; un test le vérifie.
- **Dépendances** : sharp est la seule dépendance d'exécution. N'en ajoutez pas sans en discuter dans une issue.
- **Tests** : `npm test` (`node:test`, aucun appel réseau). Toute modification du comportement vient avec ses tests.
- **Journal** : une évolution visible par l'utilisateur ajoute une ligne à la section « Non publié » du [CHANGELOG](CHANGELOG.md).

## Commandes utiles

| Commande | Effet |
| --- | --- |
| `npm test` | tests unitaires |
| `node src/node/cli.js generer 86081 -z 14` | une carte de Colombiers à petit zoom, pour un essai rapide |
| `node src/node/cli.js generer 86081 --estimer` | tailles, mémoire et poids estimé par niveau de zoom |
| `npm run web` | construit `dist/` et sert la documentation sur <http://localhost:8000>, la page de génération sur <http://localhost:8000/generer/> |
| `npm run electron` | construit l'interface et lance l'application de bureau |
| `npm start` | sert l'API HTTP sur <http://localhost:8080> |

## Pièges déjà rencontrés

- **`web/core/` n'existe pas dans les sources** : les scripts de construction y recopient `src/core/`. Un module de `web/` qui importe `./core/…` ne peut donc pas être chargé par un test unitaire — c'est la raison pour laquelle `web/engine.js` n'importe rien du cœur.
- **Les services publics renvoient des erreurs passagères** : la Géoplateforme répond parfois 400 ou 404 sur une tuile qui existe. Le téléchargement réessaie et isole la tuile fautive ; ne « simplifiez » pas ce mécanisme. Pour les essais manuels, restez à de petits niveaux de zoom et laissez jouer le cache `.cache/tiles/`.
- **librsvg refuse les images de plus de 32 767 px** : les surcouches SVG sont dessinées par blocs de 4 096 px dans `src/node/render.js`. Une carte au zoom 19 dépasse largement cette limite.
- **Le texte de l'interface est partagé** entre la page web et l'application : une phrase qui parle de « navigateur » serait fausse dans l'application. Ce qui diffère passe par `engine.privacyNote` et `engine.zoomNote`.
- **Les formulations du cœur sont vues par l'utilisateur** : les messages d'erreur de `src/core/` s'affichent tels quels dans les trois outils, et l'API les renvoie aux logiciels qui l'appellent.

## Mesurer plutôt que supposer

Les choix de rendu du projet reposent sur des mesures, pas sur des intuitions : format par défaut, coefficients de poids des fichiers, niveau de zoom lisible à l'impression, limites du canevas des navigateurs. Quand une question de ce genre se pose, refaites la mesure et écrivez le résultat dans l'issue ou dans le message de commit, plutôt que d'y substituer une opinion.

## Ce que ce fichier ne dit pas

Le mode de travail du mainteneur — rythme des commits, usage des branches, moment où l'on pousse — lui est propre et ne s'impose pas aux contributeurs, dont le parcours est décrit dans [CONTRIBUTING.md](CONTRIBUTING.md).
