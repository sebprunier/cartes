# API

Pour intégrer cartes à un autre logiciel : l'API HTTP rend les services de la ligne de commande — chercher une commune, lister les fonds et les couches, estimer, générer — à un programme plutôt qu'à une personne.

Le projet ne met aucune instance à disposition : chacun lance la sienne, sur son ordinateur, sur un serveur ou chez un hébergeur. Ce qu'une instance reçoit — la commune, les données ajoutées — reste chez celui qui l'héberge.

## Lancer une instance

Avec Node.js 22 ou plus récent, depuis le dépôt :

```sh
npm install
npm start               # ou : cartes serveur --port 8080
```

L'instance écoute sur le port donné par `--port`, sinon par la variable `PORT`, sinon sur le 8080. Elle se décrit elle-même : `GET /` donne sa version et dit si une clé est exigée, `GET /openapi.json` donne sa description OpenAPI complète.

## Réglages

Rien n'est bridé par défaut. Chaque réglage passe par une variable d'environnement :

| Variable | Effet | Par défaut |
| --- | --- | --- |
| `CARTES_CLE_API` | clé exigée dans l'en-tête `Authorization: Bearer <clé>` | aucune : l'API répond à tous |
| `CARTES_ZOOM_MAX` | zoom le plus élevé accepté | celui de chaque fond de carte, 19 |
| `CARTES_GENERATIONS` | nombre de cartes générées en même temps ; les suivantes attendent leur tour | 1 |
| `CARTES_CONSERVATION` | durée, en minutes, pendant laquelle une carte reste téléchargeable | 60 |
| `CARTES_SORTIES` | dossier où les cartes sont écrites | un dossier `cartes` dans le dossier temporaire |

Le cache des tuiles se règle comme pour la ligne de commande, avec `--cache` (`.cache/tiles` par défaut).

### Combien de mémoire ?

Une génération occupe environ quatre fois la mémoire de l'image, que l'estimation indique. Mesuré sur Colombiers (Vienne), une commune de taille moyenne :

| Zoom | Image | Mémoire occupée | Durée, tuiles en cache |
| --- | --- | --- | --- |
| 16 | 5 104 × 3 904 px | 490 Mo | 2 s |
| 17 | 10 207 × 7 807 px | 1 Go | 6 s |

Comptez donc au moins 2 Go pour le zoom 17, et bien plus pour les zooms 18 et 19. Deux cartes générées en même temps additionnent leur mémoire : c'est pourquoi `CARTES_GENERATIONS` vaut 1 par défaut. Pour un hébergement modeste, `CARTES_ZOOM_MAX` évite qu'une demande ne dépasse la mémoire de l'instance.

## Les services

Chaque chemin a un alias anglais, entre parenthèses.

| Service | Effet |
| --- | --- |
| `GET /communes?nom=…&departement=…` (`/municipalities?name=…&department=…`) | chercher une commune par son nom |
| `GET /fonds` (`/basemaps`) | lister les fonds de carte |
| `GET /couches` (`/maplayers`) | lister les couches superposables, avec leur thème, qui les publie et, s'il y en a un, le zoom à partir duquel elles se dessinent (`zoomMin`) |
| `POST /estimations` (`/estimates`) | pour chaque zoom, les dimensions, le format papier et la mémoire ; pour le zoom demandé, le poids estimé du fichier |
| `POST /cartes` (`/maps`) | demander une carte |
| `GET /cartes/{id}` | suivre une carte : statut, avancement, avertissements |
| `GET /cartes/{id}/fichier` (`/maps/{id}/file`) | télécharger une carte terminée |
| `DELETE /cartes/{id}` | annuler une carte, ou supprimer une carte terminée et son fichier |

Une erreur est renvoyée en JSON, décrite en français : `{ "erreur": "Fond inconnu : …" }`.

## Demander une carte

Générer une carte prend de quelques secondes à plusieurs minutes. La demande ne l'attend donc pas : elle est acceptée tout de suite, puis suivie, puis téléchargée.

```sh
# 1. La demande, acceptée avec le statut 202 et l'identifiant de la carte
curl -X POST http://localhost:8080/cartes \
  -H 'Content-Type: application/json' \
  -d '{ "commune": "86081", "zoom": 16, "couches": ["cadastre"] }'

# 2. Le suivi, jusqu'au statut « terminée »
curl http://localhost:8080/cartes/<id>

# 3. Le fichier
curl -OJ http://localhost:8080/cartes/<id>/fichier
```

Le suivi renvoie le `statut` — `en attente`, `en cours`, `terminée`, `échouée` ou `annulée` —, l'`avancement` de chaque source en tuiles — et celui des dates des données, lues dans le catalogue pour la mention des sources, sous `dates` —, les `etapes` franchies, les `avertissements` et, en cas d'échec, l'`erreur`. Une carte terminée reste téléchargeable jusqu'à son `expiration`, puis disparaît avec son fichier.

### Les champs d'une demande

Ce sont les options de `cartes generer`, en JSON. Chacun accepte aussi un nom anglais : `municipality`, `department`, `basemap`, `zoom`, `maplayers`, `customLayers`, `data`, `dataCategory`, `dataColor`, `format`, `margin`, `dpi`, `grayscale`, `outline`, `legend`. Un champ inconnu est refusé, pour qu'une faute de frappe ne passe pas inaperçue.

| Champ | Effet | Par défaut |
| --- | --- | --- |
| `commune` | nom ou code INSEE — **obligatoire** | |
| `departement` | département, pour lever une homonymie | |
| `fond` | fond de carte, voir `GET /fonds` | `plan-ign` |
| `zoom` | niveau de zoom, qui décide de la taille de l'image | 17 |
| `couches` | couches à superposer : `["cadastre"]`, ou `[{ "id": "cadastre", "opacite": 0.4 }]` | aucune |
| `couchesPerso` | couches ajoutées par leur adresse : `[{ "adresse": "https://…/{z}/{x}/{y}.pbf", "nom": "…", "source": "…" }]`, ou par celle d'un service WMS et le nom de sa couche : `[{ "adresse": "https://…/wms", "couche": "…", "nom": "…", "source": "…" }]` | aucune |
| `donnees` | fichiers de données, en texte : `[{ "fichier": "points.geojson", "contenu": "…" }]`, avec un `titre` facultatif. Un CSV d'adresses se géocode d'abord, avec `cartes geocoder` | aucun |
| `donneesCategorie`, `donneesCouleur` | propriétés qui portent la catégorie et la couleur des objets | |
| `format` | `png`, `jpg` ou `tif` | celui du fond de carte |
| `marge` | marge autour de la commune | 0.03 |
| `dpi` | résolution d'impression visée | 150 |
| `gris` | fond de carte en niveaux de gris | `false` |
| `contour` | tracer le contour de la commune | `true` |
| `legende` | afficher la légende des données ajoutées | `true` |

`POST /estimations` prend les mêmes champs. La [ligne de commande](ligne-de-commande.md) et [l'ajout de données](donnees.md) en disent plus sur chacun.

## Déployer sur Clever Cloud

Clever Cloud reconnaît une application Node.js et la lance par `npm start`, sur le port que donne sa variable `PORT`. Avec l'outil en ligne de commande [clever-tools](https://github.com/CleverCloud/clever-tools), depuis le dépôt :

```sh
clever create -t node cartes-api
clever scale --instances 1
clever env set CARTES_CLE_API "$(openssl rand -hex 24)"   # facultatif
clever env set CARTES_ZOOM_MAX 17                         # facultatif
clever deploy
```

Quelques particularités à connaître :

- **Une seule instance** : une carte n'existe que dans l'instance qui l'a générée. Avec deux instances, le suivi d'une carte pourrait tomber sur l'autre, qui ne la connaît pas : n'activez pas la mise à l'échelle horizontale.
- **Taille de l'instance** : choisissez-la (`clever scale --flavor …`) d'après le zoom le plus élevé que vous accepterez, avec le tableau ci-dessous.
- **Disque éphémère** : il est effacé à chaque déploiement. Le cache des tuiles se reconstitue au fil des demandes, et les cartes en cours ou non téléchargées sont perdues.
- **Dépendances** : seules celles de l'exécution sont installées ; l'application de bureau et ses outils de construction ne partent pas sur le serveur.

### Quelle taille d'instance ?

Mesuré sur Clever Cloud en septembre 2026, avec la carte de Colombiers (Vienne), une commune de taille moyenne, en PNG. Chaque case donne deux durées : la première sans aucune tuile de ce zoom en cache ; la seconde pour la même carte redemandée, les tuiles déjà en cache.

| Zoom | Image | Mémoire | XS (1 Go) | S (2 Go) | M (4 Go) |
| --- | --- | --- | --- | --- | --- |
| 15 | 2 553 × 1 953 px | 15 Mo | 17 s, puis 2 s | 33 s, puis 5 s | 8 s, puis 3 s |
| 16 | 5 104 × 3 904 px | 60 Mo | 13 à 27 s, puis 5 s | 10 à 41 s, puis 2 à 5 s | 20 s, puis 4 s |
| 17 | 10 207 × 7 807 px | 239 Mo | ✗ instance figée | 39 à 92 s, puis 5 à 6 s | 59 s, puis 7 s |
| 18 | 20 413 × 15 614 px | 956 Mo | non essayé | ✗ instance figée | 156 à 216 s, puis 20 à 23 s |
| 19 | 40 824 × 31 227 px | 3,8 Go | non essayé | non essayé | non essayé |

« Mémoire » est celle de l'image seule, non compressée : l'instance en consomme davantage pendant l'assemblage et l'encodage. « ✗ instance figée » : l'instance, à court de mémoire, cesse de répondre. Sur une XS au zoom 17, la carte est une fois sortie au bout de 157 s ; une autre fois, Clever Cloud a jugé l'instance injoignable et l'a redémarrée, et la carte a été perdue. Sur une S au zoom 18, rien n'était sorti après dix minutes.

Les durées sans cache dépendent surtout de la Géoplateforme, qui sert les tuiles plus ou moins vite selon l'heure : d'une série de mesures à l'autre, elles ont varié du simple au quadruple. Les durées avec cache, elles, sont stables.

En résumé, réglez `CARTES_ZOOM_MAX` d'après la taille choisie :

- **XS** : zoom 16 au plus ;
- **S** : zoom 17 ;
- **M** : zoom 18.

Pour une commune plus étendue que Colombiers, comparez la mémoire que donne `POST /estimations` à celle du tableau.

## Aller plus loin : une passerelle d'API

`CARTES_CLE_API` protège une instance d'une seule clé, partagée par tous ceux qui l'appellent. Dès que plusieurs logiciels s'en servent, une passerelle d'API fait mieux : une clé par logiciel, que l'on peut retirer sans toucher aux autres, des quotas et une limite de débit pour chacun, des statistiques d'usage. L'instance n'a pas à le faire elle-même.

[Otoroshi](https://www.otoroshi.io), la passerelle libre développée par la MAIF, s'y prête bien, et Clever Cloud la propose toute prête :

```sh
clever addon create otoroshi cartes-passerelle
```

Dans Otoroshi, une route renvoie alors vers l'adresse de l'instance, et chaque logiciel reçoit sa propre clé.

Gardez tout de même `CARTES_CLE_API` sur l'instance : sur Clever Cloud, elle reste joignable à son adresse `cleverapps.io`, et sans clé on pourrait contourner la passerelle en l'appelant directement. La clé de l'instance devient un secret que seule la passerelle connaît. Configurez la route pour qu'elle ajoute l'en-tête `Authorization: Bearer <clé>` à chaque requête transmise, à la place de celui du logiciel client.
