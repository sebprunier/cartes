# cartes

Génère une carte détaillée d'une commune française, destinée à être imprimée en grand format.

Premier jalon : un outil en ligne de commande qui valide le principe du **recollage de tuiles** d'un fond de carte sur l'emprise d'une commune.

## Installation

Il faut Node.js 20 ou plus récent.

```sh
npm install
npm link   # facultatif : rend la commande `cartes` disponible partout
```

Sans `npm link`, remplacez `cartes` par `node src/cli.js` dans les exemples ci-dessous.

## Utilisation

```sh
# Trouver une commune (et son code INSEE)
cartes chercher colombiers -d 86

# Voir, pour chaque niveau de zoom, la taille de l'image et le format d'impression correspondant
cartes generer colombiers -d 86 --estimer

# Générer la carte (par défaut : Plan IGN en niveaux de gris, zoom 17, contour de la commune tracé)
cartes generer 86081

# Autres exemples
cartes generer 86081 -z 16 --couleur
cartes generer 86081 -z 16 -f ortho-ign -o sorties/colombiers-ortho.jpg
```

Les commandes et les options existent aussi en anglais : `search`, `basemaps`, `generate`, `--department`, `--basemap`, `--output`, `--margin`, `--color`, `--no-outline`, `--estimate`, `--max-tiles`, `--concurrency`, `--help`. Par exemple :

```sh
cartes generate 86081 -z 16 --color
```

Toutes les options : `cartes -h`. Fonds disponibles : `cartes fonds`.

Les cartes sont écrites dans `sorties/` (PNG par défaut, JPEG ou TIFF selon l'extension passée à `-o`). Les tuiles téléchargées sont conservées dans `.cache/tiles/` : relancer une commande ne retélécharge rien.

## Fonctionnement

1. **Commune** : l'[API de géocodage de la Géoplateforme](https://data.geopf.fr/geocodage/openapi) (`type=municipality`) donne le code INSEE. En cas d'homonymes, l'outil liste les candidates et demande de préciser le département.
2. **Contour** : récupéré depuis ADMIN EXPRESS via le service WFS de la Géoplateforme (couche `ADMINEXPRESS-COG.LATEST:commune`, filtre sur `code_insee`).
3. **Emprise** : la bbox du contour, élargie d'une marge (3 % par défaut), est convertie en pixels Web Mercator au niveau de zoom demandé, ce qui donne la liste des tuiles à récupérer.
4. **Téléchargement** : 6 requêtes simultanées, nouvelles tentatives en cas d'erreur (la Géoplateforme renvoie parfois des erreurs passagères), cache sur disque.
5. **Assemblage** : les tuiles sont recopiées dans une image aux dimensions exactes de l'emprise, puis le contour est superposé sous forme de calque SVG (le même mécanisme servira pour ajouter des données : points de collecte, zones de risques…).

## Ce qu'on apprend sur l'impression

Les noms de rues et de lieux sont **dessinés dans les tuiles** à une taille fixe en pixels (environ 11 px), quel que soit le zoom. Plus le zoom est élevé, plus l'image est grande. Mais si on la réduit pour la faire tenir sur une feuille, le texte devient illisible.

Pour Colombiers (environ 8 × 6 km), à 150 dpi :

| zoom | image (px)     | taille imprimée | format |
|------|----------------|-----------------|--------|
| 15   | 2 553 × 1 953  | 43 × 33 cm      | A2     |
| 16   | 5 104 × 3 904  | 86 × 66 cm      | A0     |
| 17   | 10 207 × 7 807 | 173 × 132 cm    | > A0   |

En A3, une image au zoom 17 serait réduite environ 4 fois et ses étiquettes mesureraient à peine 0,5 mm. Avec des tuiles raster, il faut donc choisir entre la finesse du détail et un petit format : `--estimate` aide à faire ce choix.

Piste pour la suite : la Géoplateforme publie aussi le Plan IGN en **tuiles vectorielles** (`https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf`, avec les styles `standard` et `gris`). Rendues avec MapLibre à l'échelle et à la résolution voulues, elles donneraient des étiquettes dimensionnées pour le papier et nettes à 300 dpi, quel que soit le format.

## Sources et conditions d'utilisation

- **IGN / Géoplateforme** (Plan IGN, photographies aériennes, ADMIN EXPRESS, géocodage) : données ouvertes, mention « © IGN » obligatoire sur les cartes produites.
- **Esri** (`esri-plan`, `esri-satellite`) : les conditions d'utilisation d'ArcGIS Online encadrent le téléchargement massif et l'usage hors ligne des fonds de carte. À vérifier avant tout usage au-delà du test, et à plus forte raison pour un service en ligne.
