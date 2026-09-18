# Journal des modifications

Les évolutions notables du projet sont consignées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/). Tant que la version est en 0.x, les commandes et les options peuvent encore changer.

## [Non publié]

### Ajouté

- Ajout des données de la commune sur les cartes : fichiers GeoJSON (uMap, QGIS) ou CSV avec des colonnes de latitude et de longitude, avec leurs étiquettes, leurs couleurs et une légende. Disponible dans les trois outils : option `--donnees` en ligne de commande, glisser-déposer sur la page web et dans l'application de bureau.

## [0.2.0] – 2026-09-17

Deux nouvelles façons de générer une carte, sans passer par la ligne de commande : une page web et une application de bureau. Toutes deux partagent le même code de génération que la ligne de commande.

### Ajouté

- Application de bureau (Electron) qui reprend l'interface de la page web et génère les cartes avec le même moteur que la ligne de commande : zooms 18 et 19, format TIFF, cache des tuiles sur disque et enregistrement direct dans le fichier choisi. Les installeurs macOS (Apple Silicon), Windows et Linux sont joints aux versions publiées.
- Page web pour générer une carte sans rien installer, publiée sur <https://sebprunier.github.io/cartes/> : la recherche de commune, le téléchargement des tuiles et le rendu se font dans le navigateur, sans serveur intermédiaire. Elle propose les niveaux de zoom jusqu'à 17, au-delà desquels l'image dépasse ce qu'un navigateur sait produire, et renvoie alors vers la ligne de commande.
- Logo du projet, affiché dans le README et sur la page web.

## [0.1.0] – 2026-09-17

Première version : un outil en ligne de commande qui génère la carte détaillée d'une commune française en recollant des tuiles de fond de carte, prête à imprimer en grand format.

### Ajouté

- Commande `chercher` : recherche d'une commune par son nom, avec filtre par département.
- Commande `fonds` : liste des fonds de carte disponibles.
- Commande `generer` : carte d'une commune, désignée par son nom ou son code INSEE, recadrée sur son contour avec une marge.
- Fonds de carte de l'IGN, via la Géoplateforme : Plan IGN (`plan-ign`) et photographies aériennes (`ortho-ign`), jusqu'au zoom 19.
- Tracé du contour de la commune (ADMIN EXPRESS), y compris sur les très grandes images.
- Option `--gris` : fond de carte en niveaux de gris.
- Formats PNG, JPEG et TIFF, choisis avec `--format` ou l'extension du fichier de sortie : JPEG par défaut pour les photographies aériennes, PNG pour les plans. La résolution d'impression (`--dpi`) est enregistrée dans le fichier.
- Mention des sources en bas à droite de chaque carte, avec la date de mise à jour des données, lue dans le catalogue de la Géoplateforme, et la date de génération de la carte.
- Option `--estimer` : pour chaque niveau de zoom, dimensions de l'image, format papier à la résolution choisie, mémoire nécessaire et poids estimé du fichier.
- Cache des tuiles téléchargées, téléchargements simultanés (`--paralleles`), nouvelles tentatives en cas d'erreur passagère de la Géoplateforme et garde-fou sur le nombre de tuiles (`--max-tuiles`).
- Commandes, options et messages en français, avec des alias anglais pour les commandes et les options.
- Option `--version`.
- Documentation des données utilisées et de leurs licences.

[Non publié]: https://github.com/sebprunier/cartes/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sebprunier/cartes/releases/tag/v0.2.0
[0.1.0]: https://github.com/sebprunier/cartes/releases/tag/v0.1.0
