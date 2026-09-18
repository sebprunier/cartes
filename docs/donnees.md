# Ajouter des données

Deux façons d'ajouter des informations sur une carte, qui se combinent : cocher des **données publiques** déjà en ligne, ou fournir **vos propres fichiers**.

Dans les deux cas, ce que vous ajoutez est cité dans la mention des sources en bas de la carte : personne ne pourra croire que ces données viennent de l'IGN.

## Données publiques

Elles ne demandent aucun fichier : elles sont téléchargées au moment de la génération. Dans l'interface, le bouton « Ajouter une couche » ouvre le catalogue ; en ligne de commande, `cartes couches` en donne la liste.

| Couche | Ce qu'elle montre |
| --- | --- |
| Parcelles cadastrales | limites et numéros des parcelles, à partir du zoom 16 |
| PPR inondation | zonage réglementaire des plans de prévention du risque inondation |
| PPR mouvements de terrain | zonage réglementaire, pour les glissements et effondrements |
| Cavités souterraines | carrières, caves et ouvrages souterrains abandonnés |
| Canalisations de matières dangereuses | gaz, hydrocarbures et produits chimiques |
| Retrait-gonflement des argiles | aléa faible, moyen ou fort, millésime 2026 |

Chaque couche a une **opacité** réglable, pour laisser lire le fond de carte en dessous. Certaines ne sont dessinées qu'à partir d'un certain zoom : l'outil le signale avant de télécharger quoi que ce soit.

Une couche vide n'est pas une panne : beaucoup de communes ne sont traversées par aucune canalisation, et n'ont ni cavité recensée ni plan de prévention.

## Vos fichiers

Glissez un fichier dans la zone prévue, ou utilisez `--donnees` en ligne de commande.

### Formats acceptés

- **GeoJSON**, tel qu'exporté par uMap, QGIS ou geojson.io : points, lignes, polygones.
- **CSV** avec une colonne de latitude et une de longitude. Les noms usuels sont reconnus (`latitude`, `lat`, `y` ; `longitude`, `lon`, `lng`, `x`), le point-virgule comme séparateur et la virgule décimale aussi — donc ce que produit un tableur français.

Les coordonnées doivent être en longitude/latitude (WGS 84). Un fichier projeté, par exemple en Lambert 93, est refusé avec un message qui l'explique plutôt que d'être dessiné n'importe où.

### Étiquettes, catégories et couleurs

- **L'étiquette** d'un objet vient d'une colonne ou d'une propriété `nom`, `name`, `libelle` ou `title`. Elle est écrite à côté du point, avec un contour blanc pour rester lisible sur un fond chargé.
- **Les catégories** viennent d'une propriété `categorie`, `category`, `type` ou `groupe`. Chaque catégorie reçoit sa couleur et sa ligne dans la légende, ce qui permet de tout garder dans un seul fichier — les points d'apport volontaire par type de déchet, par exemple.
- **Les couleurs** du fichier sont respectées quand il en porte (`marker-color`, `fill`… comme dans uMap), sinon une couleur est attribuée par catégorie.
- **Le nom du jeu de données** titre la légende et apparaît dans la mention des sources. Il vient du nom du fichier, et se modifie dans l'interface ou avec `--donnees-titre`.

### Ce qu'il faut savoir

Une étiquette qui en recouvrirait une autre est déplacée autour de son point, et abandonnée s'il n'y a pas la place : son point reste dessiné, et la légende suffit à le comprendre. Au-delà de 5 000 objets, l'outil prévient que beaucoup d'étiquettes ne seront pas écrites.

Vous êtes responsable des droits sur les fichiers que vous ajoutez. Les données produites par la commune ne posent en général pas de difficulté ; celles récupérées ailleurs sont à vérifier auprès de leur producteur.

## Exemples

Le dossier [`exemples/`](https://github.com/sebprunier/cartes/tree/main/exemples) contient les points d'apport volontaire de Colombiers, dans les deux formats acceptés. C'est un bon point de départ pour préparer son propre fichier.
