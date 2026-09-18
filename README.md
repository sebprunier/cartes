<p align="center">
  <img src="docs/images/logo.png" alt="Logo de cartes : une carte dépliée montrant le contour d'une commune" width="160">
</p>

<h1 align="center">cartes</h1>

<p align="center">
  <a href="https://github.com/sebprunier/cartes/actions/workflows/ci.yml"><img src="https://github.com/sebprunier/cartes/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue.svg" alt="Licence MIT"></a>
</p>

<p align="center">
  Des outils libres pour aider les communes de France à créer des cartes détaillées de leur territoire, prêtes à imprimer en grand format.
</p>

> **État du projet** : utilisable, en version 0.x. Trois façons de générer une carte : la [page web](https://sebprunier.github.io/cartes/), l'application de bureau et la ligne de commande. Les commandes, les options et l'interface peuvent encore évoluer.

## Pourquoi ce projet

Une commune a souvent besoin d'une carte de son territoire :

- assez détaillée pour y lire le nom de toutes les rues ;
- enrichie de ses propres données : points de collecte des déchets, zones de risques (inondation, retrait-gonflement des argiles…) ;
- imprimable en grand format (A3 ou plus) pour l'afficher en mairie ou la présenter en réunion.

Le projet est né de ce besoin à Colombiers, dans la Vienne. L'idée : partir du contour officiel de la commune, récupérer les tuiles de fonds de carte ouverts au niveau de détail le plus fin, puis les recoller en une seule image.

## Co-construit avec Claude

Avoir une idée est une chose, la réaliser en est une autre. Ce projet a été écrit en binôme avec [Claude Code](https://claude.com/claude-code) : le besoin, les arbitrages et les choix de conception viennent de son auteur, élu d'une commune de 1 400 habitants ; l'assistant écrit le code, mesure, teste et documente.

Ce que cela change pour qui veut s'y fier : les décisions de rendu s'appuient sur des mesures reproductibles plutôt que sur des intuitions, le comportement est couvert par des tests lancés à chaque modification, et les conditions d'utilisation des données affichées ont été vérifiées une à une ([Données utilisées et licences](docs/donnees-et-licences.md)). Les consignes données à l'assistant sont publiques, dans [CLAUDE.md](CLAUDE.md).

## Feuille de route

1. **Fait** : un outil en ligne de commande qui valide le recollage de tuiles sur l'emprise d'une commune.
2. **Fait** : une page web pour générer une carte sans rien installer.
3. **Fait** : une application de bureau, pour les cartes que le navigateur ne sait pas produire, avec ses installeurs pour macOS, Windows et Linux.
4. **Fait** : ajouter les données de la commune sur les cartes (points, zones, tracés), avec leurs catégories, leur légende et un aperçu avant génération.
5. **Prochaine étape** : proposer un catalogue de couches ouvertes à superposer, comme le cadastre, les zones inondables ou l'aléa retrait-gonflement des argiles.

## Page web

Une page web permet de générer une carte sans rien installer : <https://sebprunier.github.io/cartes/>. Tout s'y passe dans le navigateur, qui télécharge lui-même les tuiles ; aucune donnée ne transite par un serveur tiers.

Elle a deux limites par rapport à la ligne de commande : la taille des images est bornée par le navigateur (environ 268 millions de pixels sur Chrome, soit le zoom 17 pour une commune de la taille de Colombiers, davantage pour une petite commune) et le format TIFF n'est pas disponible. Tous les niveaux de zoom sont proposés : si l'image demandée dépasse ce que le navigateur sait dessiner, la page le dit avant de télécharger quoi que ce soit et renvoie vers la ligne de commande ou l'application de bureau.

Avant de générer, un aperçu montre la carte telle qu'elle sera : la commune entière réduite, avec son contour, les données ajoutées, la légende et la mention des sources, et un extrait à l'échelle réelle, qui dit si les étiquettes seront lisibles une fois imprimées. Un clic sur la miniature déplace l'extrait. L'aperçu est dessiné par le même code que la carte finale, et ne télécharge qu'une vingtaine de tuiles.

Pour la faire tourner en local : `npm run web`, puis <http://localhost:8000>.

## Application de bureau

Une application de bureau (Electron) reprend l'interface de la page web, mais génère les cartes avec le même moteur que la ligne de commande : les zooms 18 et 19, le format TIFF et le cache des tuiles sur disque y sont disponibles, et la carte est écrite directement dans le fichier choisi.

Les installeurs pour macOS (Apple Silicon), Windows et Linux sont joints à chaque [version publiée](https://github.com/sebprunier/cartes/releases). Sur un Mac Intel, utilisez pour l'instant la page web ou la ligne de commande.

Ces applications ne sont pas signées, faute de certificat, ce qui demande une manipulation au premier lancement :

- **macOS** : faites un clic droit sur l'application, puis « Ouvrir », et confirmez. Si le système refuse toujours, lancez `xattr -dr com.apple.quarantine /Applications/cartes.app`.
- **Windows** : SmartScreen affiche un avertissement ; cliquez sur « Informations complémentaires », puis « Exécuter quand même ».
- **Linux** : rendez le fichier exécutable avec `chmod +x cartes-*.AppImage`.

Pour la lancer depuis les sources : `npm run electron`.

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

# Ajouter ses propres données (points de collecte, zones…)
cartes generer 86081 --donnees exemples/colombiers-apport-volontaire.geojson

# Une entrée de légende et une couleur par catégorie, lues dans une propriété des objets
cartes generer 86081 --donnees exemples/colombiers-apport-volontaire.geojson --donnees-categorie dechets

# Autres exemples
cartes generer 86081 -z 16 --gris
cartes generer 86081 -z 16 -f ortho-ign
cartes generer 86081 -z 16 --format tif -o sorties/colombiers
```

Les commandes et les options existent aussi en anglais : `search`, `basemaps`, `generate`, `--department`, `--basemap`, `--data`, `--data-category`, `--data-color`, `--output`, `--margin`, `--grayscale`, `--no-outline`, `--estimate`, `--max-tiles`, `--concurrency`, `--help`. Par exemple :

```sh
cartes generate 86081 -z 16 --grayscale
```

Toutes les options : `cartes -h`. Fonds disponibles : `cartes fonds`.

Les cartes sont écrites dans `sorties/`, en PNG pour les plans et en JPEG pour les photographies aériennes, que le PNG compresse mal (une photo pèse environ 8 fois plus lourd en PNG). L'option `--format` (`png`, `jpg` ou `tif`) ou l'extension du fichier passé à `-o` permettent de choisir un autre format.

Le PNG d'un plan est écrit avec une palette de 256 couleurs, invisible à l'œil sur une carte qui en utilise peu : le fichier pèse environ moitié moins, et reste plus léger qu'un JPEG sans en flouter les étiquettes (Colombiers au zoom 16 : 2,7 Mo en PNG palettisé, 3,2 Mo en JPEG, 5,9 Mo en PNG classique). La page web ne sait pas produire de palette, le navigateur ne le permettant pas.

Avec `--estimer`, l'outil indique pour chaque niveau de zoom la mémoire nécessaire (l'image non compressée, à prévoir en RAM pendant la génération) et le poids estimé du fichier. Cette estimation, à ±30 % environ, s'appuie sur un échantillon de 36 tuiles téléchargées par niveau de zoom, qui restent ensuite en cache. Les tuiles téléchargées sont conservées dans `.cache/tiles/` : relancer une commande ne retélécharge rien.

## Superposer des couches

Des couches d'information peuvent être ajoutées par-dessus le fond de carte, sans fournir de fichier. La liste s'obtient avec `cartes couches` ; sur la page web et dans l'application, ce sont des cases à cocher.

| Couche | Contenu | Source |
| --- | --- | --- |
| `cadastre` | limites et numéros des parcelles, à partir du zoom 16 | IGN – Parcellaire Express (PCI) |

```sh
cartes generer 86081 -z 16 --couches cadastre

# Une couche plus discrète : 25 % au lieu des 60 % par défaut
cartes generer 86081 -z 16 --couches cadastre --couches-opacite 0.25
```

Une couche est dessinée en semi-transparence pour laisser lire le fond de carte, et sa source est citée dans la mention des sources avec sa date de mise à jour. L'opacité par défaut vient du catalogue ; `--couches-opacite` la remplace (répétable, dans l'ordre des couches), et l'interface propose un curseur sous chaque couche cochée. Comme le contour de la commune et les données ajoutées, une couche garde ses couleurs quand le fond passe en niveaux de gris : `--gris` sert justement à faire ressortir ce qui est posé dessus. Une couche qui montre moins de choses au niveau de zoom demandé le signale avant de télécharger quoi que ce soit.

Le poids annoncé par `--estimer` ne tient pas compte des couches superposées : une carte avec le cadastre pèse sensiblement plus lourd.

## Ajouter ses propres données

Un fichier de la commune peut être superposé à la carte : points de collecte, défibrillateurs, zones de travaux, circuits de randonnée. En ligne de commande, l'option `--donnees` est répétable pour superposer plusieurs fichiers ; sur la page web et dans l'application, les fichiers se glissent dans la zone prévue.

- **Formats** : GeoJSON, tel qu'exporté par uMap, QGIS ou geojson.io, et CSV avec des colonnes de latitude et de longitude (les noms usuels sont reconnus, le point-virgule et la virgule décimale aussi).
- **Étiquettes** : le contenu d'une colonne ou d'une propriété `nom`, `name`, `libelle` ou `title`, écrit à côté du point avec un contour blanc pour rester lisible. Une étiquette qui recouvrirait une autre étiquette ou un autre point est déplacée autour de son point, et abandonnée s'il n'y a vraiment pas la place : son point reste dessiné. Le placement tient compte de tous les fichiers ajoutés à la fois, dans leur ordre.
- **Fichiers volumineux** : au-delà de 5 000 objets, l'outil prévient que le dessin demandera quelques secondes de plus, et que beaucoup d'étiquettes ne seront pas écrites faute de place autour de leur point.
- **Nom du jeu de données** : il titre la légende et apparaît dans la mention des sources. Par défaut le nom du fichier, remplaçable par `--donnees-titre "Points d'apport volontaire"` (répétable, dans l'ordre des fichiers) ou, sur la page web et dans l'application, en écrivant directement dans le champ du nom.
- **Catégories** : une propriété `categorie`, `category`, `type` ou `groupe` regroupe les objets. Chaque catégorie reçoit sa couleur et sa ligne dans la légende, ce qui permet de tout garder dans un seul fichier. `--donnees-categorie <propriété>` désigne une autre propriété, par exemple `--donnees-categorie dechets`.
- **Couleurs** : celles du fichier quand elles y sont (`marker-color`, `fill`, `stroke-width`… comme dans uMap, ou une propriété `couleur`), sinon une couleur par catégorie, et à défaut une par fichier. `--donnees-couleur <propriété>` désigne la propriété qui porte la couleur.
- **Coordonnées** : en longitude/latitude (WGS 84). Un fichier projeté, par exemple en Lambert 93, est refusé avec un message qui l'explique.
- **Légende** : ajoutée en bas à gauche, titrée du nom du fichier quand un seul est ajouté, avec une ligne par catégorie, ou une ligne par fichier en l'absence de catégorie. `--sans-legende` la retire.
- **Mention des sources** : les fichiers ajoutés y sont cités, pour ne pas laisser croire qu'ils viennent de l'IGN.

Sur la page web et dans l'application, les propriétés utilisées pour la légende et pour les couleurs se choisissent dans une liste déroulante, sous chaque fichier ajouté.

Le dossier [`exemples/`](exemples/) contient les points d'apport volontaire de Colombiers (source : Grand Châtellerault), avec leurs catégories, dans les deux formats acceptés : [GeoJSON](exemples/colombiers-apport-volontaire.geojson) et [CSV](exemples/colombiers-apport-volontaire.csv).

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

Toutes les données affichées sur les cartes viennent de l'IGN (Plan IGN, photographies aériennes, ADMIN EXPRESS), via la Géoplateforme. Elles sont diffusées sous la licence ouverte 2.0 d'Etalab : leur réutilisation est libre, y compris pour un usage commercial, à condition de mentionner la source et la date de dernière mise à jour des données, sans laisser penser que l'IGN cautionne la carte.

Chaque carte générée porte en bas à droite la mention des sources utilisées, avec la date de dernière mise à jour de chaque donnée, lue dans le catalogue de la Géoplateforme, et la date de génération de la carte. Par exemple : « Sources : © IGN – Plan IGN (mise à jour du 05/08/2026) ; © IGN – ADMIN EXPRESS (mise à jour du 27/08/2026) · Carte générée le 17/09/2026 ». Si le catalogue ne répond pas, la carte est générée sans ces dates et un avertissement s'affiche.

La licence du projet porte sur son code : les cartes produites restent soumises aux conditions des fournisseurs de données.

L'analyse détaillée des licences, des conditions d'accès aux services et des raisons du retrait des fonds de carte Esri est dans [Données utilisées et licences](docs/donnees-et-licences.md).

## Versions

Les évolutions de chaque version sont décrites dans le [journal des modifications](CHANGELOG.md). La version installée s'affiche avec `cartes --version`.

## Contribuer

Les contributions sont les bienvenues ! Le [guide de contribution](CONTRIBUTING.md) explique comment préparer son environnement, lancer les tests et proposer une modification. Les participants s'engagent à respecter le [code de conduite](CODE_OF_CONDUCT.md).

Pour signaler une faille de sécurité, suivez la [politique de sécurité](SECURITY.md).

## Licence

Code publié sous [licence MIT](LICENSE).
