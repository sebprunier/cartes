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

> **État du projet** : utilisable, en version 0.x. Trois façons de générer une carte : la [page web](https://sebprunier.github.io/cartes/generer/), l'application de bureau et la ligne de commande — et une API, pour l'intégrer à d'autres logiciels. Les commandes, les options et l'interface peuvent encore évoluer.

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
5. **Fait** : un catalogue de couches ouvertes à superposer — cadastre, zonage et prescriptions des PLU, courbes de niveau, bandes tampons des cours d'eau, artificialisation des sols, PPR inondation et mouvements de terrain, cavités souterraines, canalisations de matières dangereuses, aléa retrait-gonflement des argiles.
6. **Fait** : une documentation utilisateur en ligne, et une aide dans les outils eux-mêmes.
7. **Fait** : ouvrir le catalogue aux couches que la commune fournit elle-même, par l'adresse de leurs tuiles.
8. **Fait** : une API HTTP, pour intégrer cartes à d'autres logiciels, et son déploiement sur Clever Cloud.
9. **Fait** : géocoder une liste d'adresses, pour placer sur la carte les données qu'une mairie a sans coordonnées.

## Documentation

La documentation est en ligne : **<https://sebprunier.github.io/cartes/>**

- [Prise en main](https://sebprunier.github.io/cartes/prise-en-main.html) — une première carte en cinq minutes
- [Zoom et impression](https://sebprunier.github.io/cartes/zoom-et-impression.html) — pourquoi le zoom maximal n'est pas le bon choix
- [Ajouter des données](https://sebprunier.github.io/cartes/donnees.html) — couches publiques et fichiers de la commune
- [Application de bureau](https://sebprunier.github.io/cartes/application-de-bureau.html) et [ligne de commande](https://sebprunier.github.io/cartes/ligne-de-commande.html)
- [API](https://sebprunier.github.io/cartes/api.html) — intégrer cartes à un autre logiciel, et la déployer sur Clever Cloud
- [Sources et licences](docs/donnees-et-licences.md) — ce que les données permettent, et ce qu'elles imposent
- [Problèmes courants](https://sebprunier.github.io/cartes/problemes-courants.html)

Les pages sont écrites en Markdown dans [`docs/`](docs/) : elles se lisent aussi bien ici que sur le site.

## Fonctionnement

La page [Comment ça marche](docs/comment-ca-marche.md) raconte ces étapes en images : les tuiles et le zoom, l'assemblage, les calques, la mémoire.

1. **Commune** : l'[API de géocodage de la Géoplateforme](https://data.geopf.fr/geocodage/openapi) (`type=municipality`) donne le code INSEE. En cas d'homonymes, l'outil liste les candidates et demande de préciser le département.
2. **Contour** : récupéré depuis ADMIN EXPRESS via le service WFS de la Géoplateforme (couche `ADMINEXPRESS-COG.LATEST:commune`, filtre sur `code_insee`).
3. **Emprise** : la bbox du contour, élargie d'une marge (3 % par défaut), est convertie en pixels Web Mercator au niveau de zoom demandé, ce qui donne la liste des tuiles à récupérer.
4. **Téléchargement** : 6 requêtes simultanées, nouvelles tentatives en cas d'erreur (la Géoplateforme renvoie parfois des erreurs passagères), cache sur disque.
5. **Assemblage** : les tuiles sont recopiées dans une image aux dimensions exactes de l'emprise, puis les couches, le contour, les données ajoutées, la légende et la mention des sources sont superposés — en images pour les couches servies comme telles, en calques SVG pour ce que l'outil dessine lui-même.

## Versions

Les évolutions de chaque version sont décrites dans le [journal des modifications](CHANGELOG.md). La version installée s'affiche avec `cartes --version`.

## Contribuer

Les contributions sont les bienvenues ! Le [guide de contribution](CONTRIBUTING.md) explique comment préparer son environnement, lancer les tests et proposer une modification. Les participants s'engagent à respecter le [code de conduite](CODE_OF_CONDUCT.md).

Pour signaler une faille de sécurité, suivez la [politique de sécurité](SECURITY.md).

## Licence

Code publié sous [licence MIT](LICENSE).
