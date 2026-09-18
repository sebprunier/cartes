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
```

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

# Estimer avant de générer : dimensions, mémoire et poids par niveau de zoom
cartes generer 86081 --estimer
```

Toutes les options sont décrites par `cartes --aide`. Elles existent aussi en anglais : `generate`, `--basemap`, `--data`…

## Ce qu'il faut savoir

- Les cartes sont écrites dans `sorties/`, sous un nom qui rappelle la commune, le fond et le zoom.
- Les tuiles téléchargées sont conservées dans `.cache/tiles/` : relancer une commande ne retélécharge rien.
- `--max-tuiles` est un garde-fou : au-delà de 5 000 tuiles, l'outil refuse plutôt que de lancer un téléchargement d'une heure par mégarde.
- `--paralleles` règle le nombre de téléchargements simultanés. Six par défaut, ce qui reste courtois envers les services publics utilisés.
