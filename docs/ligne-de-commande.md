# Ligne de commande

Pour qui veut répéter, automatiser, ou produire les cartes de plusieurs communes d'un coup.

## Installation

Il faut Node.js 22 ou plus récent.

```sh
git clone https://github.com/sebprunier/cartes.git
cd cartes
npm install
npm link   # facultatif : rend la commande « cartes » disponible partout
```

Sans `npm link`, remplacez `cartes` par `node src/node/cli.js` dans les exemples.

## Les commandes

```sh
cartes chercher Colombiers        # retrouver une commune et son code INSEE
cartes fonds                      # lister les fonds de carte
cartes couches                    # lister les couches superposables
cartes generer 86081              # générer la carte d'une commune
cartes geocoder lieux.csv --commune 86081   # placer les adresses d'un fichier CSV
cartes serveur                    # servir l'API HTTP, pour d'autres logiciels
```

La commande `cartes serveur` a sa propre page : [API](api.md).

Une commune se désigne par son nom ou par son code INSEE. En cas d'homonymes, précisez le département avec `-d 86`.

## Exemples

```sh
# Une carte simple, au zoom par défaut
cartes generer 86081

# Photographies aériennes, zoom 16
cartes generer 86081 -z 16 -f ortho-ign

# Avec le cadastre et l'aléa argiles
cartes generer 86081 -z 16 --couches cadastre --couches argiles

# Avec ses propres données, et un nom de légende choisi
cartes generer 86081 --donnees points.geojson --donnees-titre "Points d'apport volontaire"

# Avec une couche qui n'est pas au catalogue, par l'adresse de ses tuiles
cartes generer 86081 --couche-perso "https://exemple.fr/tuiles/{z}/{x}/{y}.pbf" \
  --couche-perso-nom "Zones humides" --couche-perso-source "© Syndicat de bassin"

# Estimer avant de générer : dimensions, mémoire et poids par niveau de zoom
cartes generer 86081 --estimer
```

Toutes les options sont décrites par `cartes --aide`. Elles existent aussi en anglais : `generate`, `geocode`, `--basemap`, `--data`…

## Géocoder un fichier d'adresses

Un CSV avec des adresses mais sans coordonnées — une colonne `adresse`, ou des colonnes `numéro`, `voie`, `code postal` et `commune` — se géocode avant d'être ajouté à une carte :

```sh
cartes geocoder defibrillateurs.csv --commune 86081
```

La commande envoie les adresses au service de géocodage de la Géoplateforme (IGN), en restreignant la recherche à la commune donnée. Elle écrit à côté du fichier un `defibrillateurs-geocode.csv` : le même fichier, dans le même séparateur, complété de la latitude, de la longitude et du résultat du géocodage de chaque ligne. Puis elle dresse le bilan :

- **trouvées** : placées avec assurance, et dessinées sur la carte ;
- **à vérifier** : le service a hésité, ou n'a trouvé qu'une route ou une rue, faute de numéro — le point est au milieu de la voie, parfois loin du lieu voulu. Elles ne sont dessinées qu'avec `--donnees-a-verifier` ;
- **introuvables** : rien de sûr, et donc rien de dessiné.

Chaque adresse à vérifier ou introuvable est listée avec son numéro de ligne et ce que le service a trouvé. Corrigez-les dans votre tableur, puis géocodez de nouveau le fichier corrigé ; ou ajoutez-le tel quel :

```sh
cartes generer 86081 --donnees defibrillateurs-geocode.csv
```

La carte cite alors la Base Adresse Nationale, d'où viennent les positions, dans sa mention des sources.

## Ce qu'il faut savoir

- Les cartes sont écrites dans `sorties/`, sous un nom qui rappelle la commune, le fond et le zoom.
- Les tuiles téléchargées sont conservées dans `.cache/tiles/` : relancer une commande ne retélécharge rien.
- `--max-tuiles` est un garde-fou : au-delà de 5 000 tuiles, l'outil refuse plutôt que de lancer un téléchargement d'une heure par mégarde.
- `--paralleles` règle le nombre de téléchargements simultanés. Six par défaut, ce qui reste courtois envers les services publics utilisés.
