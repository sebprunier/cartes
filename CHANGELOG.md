# Journal des modifications

Les évolutions notables du projet sont consignées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/). Tant que la version est en 0.x, les commandes et les options peuvent encore changer.

## [Non publié]

### Ajouté

- Une couche « Bandes tampons des cours d'eau » : les cours d'eau le long desquels la PAC impose une bande enherbée (BCAE 4), dans leur dernière édition, que la date de la mention des sources situe. Une ligne de légende dit ce que sont ces traits bleus, qu'on prendrait sinon pour des rivières ; elle n'apparaît que si la commune en a. En ligne de commande : `--couches bcae`.
- Une couche « Courbes de niveau », de l'IGN, dans un nouveau thème « Territoire et environnement ». Le service ne les publie que jusqu'au zoom 18 : au-delà, la carte est générée sans elles, et l'outil le dit — dans le catalogue, un badge « Jusqu'au zoom 18 » l'annonce. En ligne de commande : `--couches courbes`.
- Une page « État des services » sur le site : elle interroge en direct, depuis le navigateur, chaque service dont dépendent les cartes — fonds, contours, géocodage, catalogue, et le service de chaque couche — et dit lequel fonctionne, lequel est lent, lequel est en panne et pourquoi. Dans la page de génération et l'application, une couche dont le service est en panne porte un badge « Service en panne » dans le catalogue, et un avertissement une fois ajoutée ; les messages d'erreur d'une couche renvoient vers cette page. En ligne de commande : `cartes etat`, qui se termine en erreur si un service est en panne.
- Une couche « Prescriptions du PLU », à superposer au zonage : emplacements réservés avec leur numéro, espaces boisés classés, patrimoine bâti et éléments de paysage protégés — surfaces, haies, arbres —, bâtiments pouvant changer de destination, reculs imposés. Les autres types du standard national sont regroupés sous « Autre prescription ». Le document n'est cité qu'une fois quand les deux couches du PLU sont sur la carte. En ligne de commande : `--couches plu-prescriptions`.
- Une couche « Zonage du PLU » : les zones urbaines, à urbaniser, agricoles et naturelles du document d'urbanisme de la commune — PLU, PLU intercommunal ou carte communale —, lues sur le Géoportail de l'urbanisme. L'outil les dessine lui-même, remplies et nettes à tous les zooms, avec le code de chaque zone (« Ub », « 1AU », « Np »), leur légende, et la date d'approbation du document dans la mention des sources. Une commune sans document d'urbanisme est signalée, et sa carte générée sans zonage. En ligne de commande : `--couches plu`.
- Géocoder un fichier d'adresses : un CSV avec une colonne d'adresse — ou des colonnes de numéro, de voie, de code postal et de commune — mais sans coordonnées est placé par le service de géocodage de l'IGN, la recherche restreinte à la commune de la carte. Chaque adresse est classée trouvée, à vérifier ou introuvable, d'après des seuils mesurés sur 430 adresses : seules les trouvées sont dessinées, les secondes sur demande, et le bilan dit quelles lignes corriger. Le fichier géocodé s'enregistre, pour ne pas recommencer. En ligne de commande : `cartes geocoder lieux.csv --commune 86081`, puis `--donnees` et `--donnees-a-verifier`. La carte cite alors la Base Adresse Nationale, d'où viennent les positions.
- Une page « Comment ça marche » explique en images ce que fait l'outil : les tuiles et le zoom, le passage de la commune aux tuiles, l'assemblage, les calques, le passage du pixel au papier, la mémoire et ses limites. Elle se termine par un glossaire. Ses illustrations sont de vraies cartes de Colombiers, et `npm run illustrations` les redessine.

### Modifié

- La fenêtre des couches disponibles est rangée par thème — foncier et urbanisme, risques, puis vos couches ajoutées par leur adresse — avec une icône par thème. Chaque couche est une carte cliquable en entier, qui dit qui la publie et, s'il le faut, le zoom à partir duquel elle se dessine. Ce badge passe en orange quand le zoom choisi est trop petit, avant même d'ajouter la couche. La recherche trouve aussi un thème ou un fournisseur. `cartes couches` range la liste de la même façon, et l'API donne le thème, le fournisseur et le zoom minimum de chaque couche. Le bouton « Ajouter une couche par son adresse » devient « Ajouter une couche personnalisée ».
- Sur la page de génération et dans l'application, la promesse « aucune donnée n'est envoyée ailleurs » quitte l'en-tête pour la zone de dépôt des fichiers, où elle compte, et devient exacte : vos fichiers ne quittent pas votre ordinateur, seules les adresses que vous choisissez de géocoder sont envoyées. Rien ne part sans confirmation.
- Les fichiers CSV sont lus en UTF-8, ou à défaut en Windows-1252, celui de bien des tableurs : leurs accents ne se perdent plus.

### Corrigé

- Sur la page de génération et dans l'application, changer un réglage efface la carte générée avec les précédents : son lien « Télécharger » restait affiché, et donnait l'ancienne carte, facile à prendre pour la nouvelle. Une carte garde aussi le nom des réglages avec lesquels elle a été demandée, même si on en change pendant qu'elle se dessine.
- La recherche d'une commune et la lecture de son contour réessaient quand la Géoplateforme tarde ou refuse un instant, et disent en français qu'elle ne répond pas, au lieu de « The operation was aborted due to timeout », qui arrêtait toute une carte.
- La génération ne reste plus « en attente » avant de télécharger les tuiles : elle attendait les dates des données dans le catalogue de la Géoplateforme, qui mettait de 5 à 22 secondes à répondre. Ces dates sont maintenant demandées pendant le téléchargement, et gardées une heure pour l'aperçu et les cartes suivantes. Sur la page web, les tuiles de Colombiers démarrent au bout de 3 secondes au lieu de 15.
- La recherche d'une commune n'affiche plus « Recherche impossible : HTTP 400 » quand on a saisi moins de trois lettres : le service de géocodage refuse ces recherches. Les 14 communes au nom d'une ou deux lettres — Y, Eu, By, Bû, Oô, Us… — sont désormais trouvées, dès la première lettre, et `cartes generer Y` fonctionne.
- Quand le service d'une couche est en panne, l'outil le dit en clair — « Géorisques ne répond pas pour la couche « PPR mouvements de terrain » (il renvoie une page d'erreur au lieu d'une image) » — plutôt que d'afficher une adresse. Et il le dit au début de la génération, avant de télécharger le fond de carte, plutôt qu'à la fin.
- Sur une page courte — la page de génération à son ouverture, dans l'application comme dans le navigateur — le pied de page reste en bas de la fenêtre, au lieu de laisser une bande vide sous lui.
- Sur un téléphone, la page Ajouter des données débordait de l'écran, à cause d'une adresse trop longue pour passer à la ligne, et l'accueil aussi sur les plus petits écrans. Plus aucune page ne déborde, de 320 à 1 440 pixels de large.
- La documentation de l'application de bureau donne les deux commandes qui lancent l'AppImage sous Linux, plutôt qu'un simple « lancez-le », et ne présente plus ce lancement comme un avertissement à contourner : c'est seulement le cas sur macOS et Windows.

## [0.6.0] – 2026-09-23

Une présentation neuve pour la documentation, qui a désormais son propre site, et pour la page de génération comme pour l'application de bureau qui la partage.

### Modifié

- La documentation a son propre site, à l'adresse de l'outil (<https://sebprunier.github.io/cartes/>) : une page d'accueil, un menu par thème, un sommaire pour chaque page, des blocs de code à copier, des illustrations tirées de vraies cartes, et des captures d'écran de chaque étape de l'outil. La page qui génère les cartes passe à <https://sebprunier.github.io/cartes/generer/>, aussi joignable par `/try-it/`. Les anciennes adresses de la documentation mènent à leur nouvelle page.
- La page de génération, et l'application de bureau qui la partage, adoptent la présentation du site : des étapes numérotées, des champs, des boutons et un tableau des dimensions plus lisibles, l'aperçu en deux vues côte à côte, et la carte terminée offerte par un vrai bouton de téléchargement. Les aides des réglages s'ouvrent dans une bulle, sous leur point d'interrogation, et se ferment d'un clic ailleurs ou avec Échap. La liste des communes trouvées défile au-delà d'une dizaine de lignes, au lieu de repousser toute la page.

## [0.5.0] – 2026-09-23

cartes s'intègre désormais à d'autres logiciels : une API HTTP, que chacun héberge où il veut, rend les services de la ligne de commande.

### Ajouté

- Une API HTTP, pour intégrer cartes à d'autres logiciels : `cartes serveur` (ou `npm start`) rend les services de la ligne de commande — chercher une commune, lister les fonds et les couches, estimer, générer. Une carte se demande, se suit puis se télécharge. Rien n'est bridé par défaut ; une clé d'API, un zoom maximal, le nombre de générations simultanées et la durée de conservation des cartes se règlent par des variables d'environnement. La documentation décrit l'API et son déploiement sur Clever Cloud, seule ou derrière une passerelle d'API comme Otoroshi, avec les tailles d'instance mesurées pour chaque zoom. L'API se décrit elle-même en OpenAPI 3.1, sur `/openapi.json`.

### Modifié

- Annuler une génération l'arrête à l'étape suivante, et non plus seulement pendant le téléchargement des tuiles : dans l'application de bureau, une carte annulée une fois ses tuiles téléchargées n'est plus dessinée jusqu'au bout pour rien.

### Corrigé

- La documentation de l'application de bureau décrivait, pour ouvrir l'application sur macOS, un clic droit puis « Ouvrir » qui n'a plus d'effet depuis macOS Sequoia. Elle détaille maintenant le passage par Confidentialité et sécurité, étape par étape et avec les captures d'écran des dialogues.

## [0.4.1] – 2026-09-23

L'application macOS téléchargée s'ouvre de nouveau.

### Corrigé

- Sur macOS, l'application téléchargée était déclarée « endommagée » et ne pouvait pas être ouverte, sans autre choix que de la mettre à la corbeille. Elle est désormais signée pour elle-même, sans certificat : macOS affiche l'avertissement habituel d'une application non vérifiée, que l'on peut passer depuis les réglages.

## [0.4.0] – 2026-09-23

Chacun peut ajouter sa propre couche par son adresse, et l'application de bureau gagne un menu en français et un glisser-déposer plus sûr.

### Ajouté

- Ajouter sa propre couche, par l'adresse de ses tuiles, dans les trois outils : un gabarit en `{z}/{x}/{y}` servant des images ou des tuiles vectorielles, que l'outil dessine alors lui-même avec les couleurs et les libellés que les tuiles portent. La source est obligatoire, puisqu'elle est écrite sur la carte à côté de celles de l'IGN. L'adresse est essayée sur une tuile avant d'être acceptée, et l'outil distingue une adresse inexacte d'une couche qui ne couvre pas la commune. En ligne de commande : `--couche-perso`, `--couche-perso-nom`, `--couche-perso-source` et `--couche-perso-opacite`.
- L'application de bureau a un menu en français, avec un « À propos » qui donne la version et des liens vers la documentation et le code source. L'entrée de menu Linux porte désormais une description.
- Les couches ajoutées par leur adresse sont retenues d'une carte à l'autre, dans le navigateur ou sur l'ordinateur, et proposées dans le catalogue à côté des couches connues.

### Corrigé

- Un fichier de données lâché à côté de la zone prévue ouvrait le fichier à la place de l'interface. Dans l'application, sans bouton Retour ni barre d'adresse, il fallait quitter et relancer en perdant tous ses réglages : le dépôt est maintenant ignoré partout ailleurs que sur la zone.
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

[Non publié]: https://github.com/sebprunier/cartes/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/sebprunier/cartes/releases/tag/v0.6.0
[0.5.0]: https://github.com/sebprunier/cartes/releases/tag/v0.5.0
[0.4.1]: https://github.com/sebprunier/cartes/releases/tag/v0.4.1
[0.4.0]: https://github.com/sebprunier/cartes/releases/tag/v0.4.0
[0.3.0]: https://github.com/sebprunier/cartes/releases/tag/v0.3.0
[0.2.0]: https://github.com/sebprunier/cartes/releases/tag/v0.2.0
[0.1.0]: https://github.com/sebprunier/cartes/releases/tag/v0.1.0
