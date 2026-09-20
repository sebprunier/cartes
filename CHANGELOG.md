# Journal des modifications

Les évolutions notables du projet sont consignées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/). Tant que la version est en 0.x, les commandes et les options peuvent encore changer.

## [Non publié]

### Ajouté

- Ajouter sa propre couche, par l'adresse de ses tuiles : un gabarit en `{z}/{x}/{y}` servant des images ou des tuiles vectorielles, que l'outil dessine alors lui-même, avec les couleurs et les libellés que les tuiles portent. En ligne de commande, `--couche-perso`, `--couche-perso-nom` et `--couche-perso-source`. La source est obligatoire : elle est écrite sur la carte, comme celles de l'IGN.

### Corrigé

- La page « Ligne de commande » de la documentation annonçait « les trois commandes » et en listait quatre depuis l'arrivée de `cartes couches`. Le titre ne compte plus, et un test vérifie que chaque commande de l'outil figure bien sur cette page.

## [0.3.0] – 2026-09-19

Les cartes portent enfin des données : celles que la commune fournit elle-même, et six couches de services publics à superposer au fond de carte. Un aperçu montre le résultat avant de lancer la génération, et une documentation en ligne accompagne les trois outils.

### Ajouté

- Ajout des données de la commune sur les cartes : fichiers GeoJSON (uMap, QGIS) ou CSV avec des colonnes de latitude et de longitude, avec leurs étiquettes, leurs couleurs et une légende. Disponible dans les trois outils : option `--donnees` en ligne de commande, glisser-déposer sur la page web et dans l'application de bureau.
- Catégories : les objets d'un même fichier sont regroupés par une propriété (`categorie`, `category`, `type`, `groupe` par défaut), avec une couleur et une ligne de légende par catégorie. Les options `--donnees-categorie` et `--donnees-couleur` désignent les propriétés à utiliser ; la page web et l'application les proposent dans une liste déroulante.
- Titre de la légende : le nom du jeu de données quand un seul fichier est ajouté, « Légende » sinon. Ce nom, repris dans la mention des sources, se choisit avec `--donnees-titre` ou dans le champ prévu sur la page web et dans l'application.
- Placement des étiquettes : une étiquette qui en recouvrirait une autre, ou un autre point, est déplacée autour de son point, et abandonnée s'il n'y a pas la place. Les étiquettes de tous les fichiers ajoutés sont placées en une seule passe, dans l'ordre des fichiers, pour que deux fichiers ne se recouvrent pas.
- Avertissement sur les fichiers de données volumineux : au-delà de 5 000 objets, la ligne de commande et l'interface préviennent que le dessin demandera quelques secondes de plus, et que beaucoup d'étiquettes ne seront pas écrites faute de place.
- Exemple de données réelles : les points d'apport volontaire de Colombiers, dans [`exemples/`](exemples/), en GeoJSON et en CSV.
- Couches superposables au fond de carte, choisies dans un catalogue : la première est le cadastre (Parcellaire Express de l'IGN), en semi-transparence et citée dans la mention des sources. Option `--couches` et commande `cartes couches` en ligne de commande, cases à cocher sur la page web et dans l'application. L'opacité, 0,6 par défaut, se règle avec `--couches-opacite` ou avec un curseur dans l'interface.
- Couche de l'aléa retrait-gonflement des argiles (millésime 2026, BRGM via la DINUM), dessinée par l'outil à partir de tuiles vectorielles : les zones restent nettes à l'impression et leurs niveaux figurent dans la légende. L'archive n'est lue que par morceaux, quelques kilooctets suffisant pour une commune.
- Couche du zonage réglementaire des PPR inondation (Géorisques), servie par un WMS : l'outil lui demande deux ou trois grandes images plutôt que des centaines de tuiles. Sous l'échelle où le service accepte de dessiner, l'image est demandée plus grande puis réduite, pour que l'aperçu la montre quand même.
- Trois couches de plus, servies par Géorisques comme les PPR inondation : zonage des PPR mouvements de terrain, cavités souterraines abandonnées, et canalisations de matières dangereuses.
- La légende d'une couche servie par un WMS est celle que le service publie : elle est ajoutée telle quelle à la légende de la carte, à la taille du texte qui l'entoure.
- Aperçu avant génération, sur la page web et dans l'application : la commune entière réduite (contour, données, légende et mention des sources comprises) et un extrait à l'échelle réelle, pour juger de la lisibilité des étiquettes à l'impression. Un clic sur la miniature déplace l'extrait. L'aperçu emprunte le code de rendu de la carte finale et ne télécharge qu'une vingtaine de tuiles.
- Avancement du téléchargement détaillé par source : une ligne par fond de carte et par couche, avec son propre décompte, au lieu d'un total unique qui ne disait pas ce qui était en cours.
- Documentation utilisateur en ligne, sur <https://sebprunier.github.io/cartes/documentation/> : prise en main, choix du zoom et du format papier, ajout de données, application de bureau, ligne de commande, sources et licences, problèmes courants. Les pages sont écrites en Markdown dans `docs/` et restent lisibles telles quelles sur GitHub.
- Chaque réglage de l'interface peut s'expliquer : un « ? » à côté du libellé ouvre une phrase qui dit ce que le champ change sur la carte imprimée, et renvoie à la documentation quand il y a plus à dire.
- L'aide de la ligne de commande se termine par des exemples, et un test vérifie qu'aucune option n'y manque.

### Modifié

- La page web propose tous les niveaux de zoom, et non plus jusqu'au 17 : une petite commune tient dans un navigateur au zoom 18 ou 19. Quand l'image demandée dépasse ce que le navigateur sait dessiner, la page le dit avant de télécharger la moindre tuile et renvoie vers la ligne de commande ou l'application de bureau.
- Le PNG d'un plan est écrit avec une palette de 256 couleurs en ligne de commande et dans l'application : le fichier pèse environ moitié moins (2,7 Mo au lieu de 5,9 pour Colombiers au zoom 16), sans perte visible sur les étiquettes. L'estimation de poids en tient compte.
- L'estimation du poids rejoint l'aperçu dans une étape « Vérifier avant de générer », après le choix des données : elle en dépend désormais. Un seul bouton donne les deux, l'estimation portant sur le seul niveau de zoom choisi, et le tableau des réglages ne montre plus que les dimensions.
- Le poids estimé tient compte des couches superposées, qui pèsent autant que le fond de carte : il annonçait 2,9 Mo pour un fichier de 5,3 Mo dès que le cadastre était coché.
- Le choix des couches ne liste plus tout le catalogue : l'étape n'affiche que les couches choisies, avec leur opacité et de quoi les retirer, et un bouton « Ajouter une couche » ouvre le catalogue avec une recherche. Les deux moitiés de l'étape se ressemblent enfin : ajouter une couche ou déposer un fichier se lisent de la même façon.
- L'aperçu s'efface quand un réglage change, comme le poids estimé : une image qui ne correspond plus aux réglages induit en erreur, même accompagnée d'un avertissement.
- Les surcouches ne sont plus dessinées entièrement dans chaque bloc de l'image, mais seulement dans ceux où elles tombent. Une carte au zoom 17 portant 5 000 objets ajoutés passe de 8,9 à 2,5 secondes de tracé, et une carte sans données ajoutées y gagne aussi : la légende et la mention des sources n'étaient analysées que pour être ignorées dans la plupart des blocs.

### Corrigé

- L'estimation du poids échouait dès qu'une couche dessinée par l'outil, comme l'aléa argiles, était cochée : elle cherchait à en télécharger les tuiles, qui n'existent pas. Une telle couche n'entre plus dans le calcul, la mesure montrant qu'elle allège même légèrement le fichier.
- Les messages d'erreur s'affichent à l'endroit de l'action qui les provoque, et non plus tous au bas de la page.

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

[Non publié]: https://github.com/sebprunier/cartes/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/sebprunier/cartes/releases/tag/v0.3.0
[0.2.0]: https://github.com/sebprunier/cartes/releases/tag/v0.2.0
[0.1.0]: https://github.com/sebprunier/cartes/releases/tag/v0.1.0
