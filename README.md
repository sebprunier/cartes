# cartes

[![CI](https://github.com/sebprunier/cartes/actions/workflows/ci.yml/badge.svg)](https://github.com/sebprunier/cartes/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Des outils libres pour aider les communes de France à créer des cartes détaillées de leur territoire, prêtes à imprimer en grand format.

> **État du projet** : prototype. L'outil en ligne de commande valide le principe, mais ses commandes et options peuvent encore évoluer.

## Pourquoi ce projet

Une commune a souvent besoin d'une carte de son territoire :

- assez détaillée pour y lire le nom de toutes les rues ;
- enrichie de ses propres données : points de collecte des déchets, zones de risques (inondation, retrait-gonflement des argiles…) ;
- imprimable en grand format (A3 ou plus) pour l'afficher en mairie ou la présenter en réunion.

Le projet est né de ce besoin à Colombiers, dans la Vienne. L'idée : partir du contour officiel de la commune, récupérer les tuiles de fonds de carte ouverts au niveau de détail le plus fin, puis les recoller en une seule image.

## Feuille de route

1. **Fait** : un outil en ligne de commande qui valide le recollage de tuiles sur l'emprise d'une commune.
2. Ajouter des données géographiques complémentaires (points, zones).
3. Proposer un service en ligne, avec une interface graphique.

## Installation

Il faut Node.js 22 ou plus récent.

```sh
npm install
npm link   # facultatif : rend la commande `cartes` disponible partout
```

Sans `npm link`, remplacez `cartes` par `node src/cli.js` dans les exemples ci-dessous.

## Utilisation

```sh
# Trouver une commune (et son code INSEE)
cartes chercher colombiers -d 86

# Voir, pour chaque niveau de zoom, la taille de l'image, le format d'impression, la mémoire nécessaire
# et le poids estimé du fichier
cartes generer colombiers -d 86 --estimer

# Générer la carte (par défaut : Plan IGN, zoom 17, contour de la commune tracé)
cartes generer 86081

# Autres exemples
cartes generer 86081 -z 16 --gris
cartes generer 86081 -z 16 -f ortho-ign
cartes generer 86081 -z 16 --format tif -o sorties/colombiers
```

Les commandes et les options existent aussi en anglais : `search`, `basemaps`, `generate`, `--department`, `--basemap`, `--output`, `--margin`, `--grayscale`, `--no-outline`, `--estimate`, `--max-tiles`, `--concurrency`, `--help`. Par exemple :

```sh
cartes generate 86081 -z 16 --grayscale
```

Toutes les options : `cartes -h`. Fonds disponibles : `cartes fonds`.

Les cartes sont écrites dans `sorties/`, en PNG pour les plans et en JPEG pour les photographies aériennes, que le PNG compresse mal (une photo pèse environ 8 fois plus lourd en PNG). L'option `--format` (`png`, `jpg` ou `tif`) ou l'extension du fichier passé à `-o` permettent de choisir un autre format.

Avec `--estimer`, l'outil indique pour chaque niveau de zoom la mémoire nécessaire (l'image non compressée, à prévoir en RAM pendant la génération) et le poids estimé du fichier. Cette estimation, à ±30 % environ, s'appuie sur un échantillon de 36 tuiles téléchargées par niveau de zoom, qui restent ensuite en cache. Les tuiles téléchargées sont conservées dans `.cache/tiles/` : relancer une commande ne retélécharge rien.

## Fonctionnement

1. **Commune** : l'[API de géocodage de la Géoplateforme](https://data.geopf.fr/geocodage/openapi) (`type=municipality`) donne le code INSEE. En cas d'homonymes, l'outil liste les candidates et demande de préciser le département.
2. **Contour** : récupéré depuis ADMIN EXPRESS via le service WFS de la Géoplateforme (couche `ADMINEXPRESS-COG.LATEST:commune`, filtre sur `code_insee`).
3. **Emprise** : la bbox du contour, élargie d'une marge (3 % par défaut), est convertie en pixels Web Mercator au niveau de zoom demandé, ce qui donne la liste des tuiles à récupérer.
4. **Téléchargement** : 6 requêtes simultanées, nouvelles tentatives en cas d'erreur (la Géoplateforme renvoie parfois des erreurs passagères), cache sur disque.
5. **Assemblage** : les tuiles sont recopiées dans une image aux dimensions exactes de l'emprise, puis le contour et la mention des sources sont superposés sous forme de calques SVG (le même mécanisme servira pour ajouter des données : points de collecte, zones de risques…).

## Ce qu'on apprend sur l'impression

Les noms de rues et de lieux sont **dessinés dans les tuiles** à une taille fixe en pixels (environ 11 px), quel que soit le zoom. Plus le zoom est élevé, plus l'image est grande. Mais si on la réduit pour la faire tenir sur une feuille, le texte devient illisible.

Pour Colombiers (environ 8 × 6 km), à 150 dpi :

| zoom | image (px)     | taille imprimée | format |
|------|----------------|-----------------|--------|
| 15   | 2 553 × 1 953  | 43 × 33 cm      | A2     |
| 16   | 5 104 × 3 904  | 86 × 66 cm      | A0     |
| 17   | 10 207 × 7 807 | 173 × 132 cm    | > A0   |

En A3, une image au zoom 17 serait réduite environ 4 fois et ses étiquettes mesureraient à peine 0,5 mm. Avec des tuiles raster, il faut donc choisir entre la finesse du détail et un petit format : `--estimer` aide à faire ce choix.

Piste pour la suite : la Géoplateforme publie aussi le Plan IGN en **tuiles vectorielles** (`https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf`, avec les styles `standard` et `gris`). Rendues avec MapLibre à l'échelle et à la résolution voulues, elles donneraient des étiquettes dimensionnées pour le papier et nettes à 300 dpi, quel que soit le format.

## Sources des données et conditions d'utilisation

- **IGN / Géoplateforme** (Plan IGN, photographies aériennes, ADMIN EXPRESS, géocodage) : données ouvertes sous licence ouverte Etalab 2.0. Leur réutilisation est libre, y compris pour un usage commercial, à condition de mentionner la source et la date de dernière mise à jour des données, sans laisser penser que l'IGN cautionne la carte.

Chaque carte générée porte en bas à droite la mention des sources utilisées, avec la date de dernière mise à jour de chaque donnée, lue dans le catalogue de la Géoplateforme, et la date de génération de la carte. Par exemple : « Sources : © IGN – Plan IGN (mise à jour du 05/08/2026) ; © IGN – ADMIN EXPRESS (mise à jour du 27/08/2026) · Carte générée le 17/09/2026 ». Si le catalogue ne répond pas, la carte est générée sans ces dates et un avertissement s'affiche.

La licence du projet porte sur son code : les cartes produites restent soumises aux conditions des fournisseurs de données ci-dessus.

## Contribuer

Les contributions sont les bienvenues ! Le [guide de contribution](CONTRIBUTING.md) explique comment préparer son environnement, lancer les tests et proposer une modification. Les participants s'engagent à respecter le [code de conduite](CODE_OF_CONDUCT.md).

Pour signaler une faille de sécurité, suivez la [politique de sécurité](SECURITY.md).

## Licence

Code publié sous [licence MIT](LICENSE).
