# La vidéo de présentation

La vidéo de présentation de cartes : 75 secondes, sans son, en français. Elle est publiée avec la documentation, dans [`docs/videos/`](../../docs/videos/), et le plan, les choix et leurs raisons sont dans l'issue [#40](https://github.com/sebprunier/cartes/issues/40).

Rien n'y est dessiné à la main : les cartes, les couches, les points géocodés, les chiffres et la sortie de la ligne de commande sont produits par cartes lui-même, sur Colombiers (Vienne). L'interface est redessinée d'après la page web, pour rester nette à toutes les tailles.

## Faire la vidéo

Depuis ce dossier, les dépendances du dépôt déjà installées (`npm install` à sa racine) :

```sh
npm install          # les dépendances de la vidéo, à part de celles de l'outil
npm run preparer     # images et chiffres, tirés de cartes
npm run studio       # parcourir la vidéo dans le navigateur, scène par scène
npm run rendu        # docs/videos/cartes-presentation-fr-1080p.mp4
npm run rendu:720p   # docs/videos/cartes-presentation-fr-720p.mp4
npm run couverture   # docs/videos/cartes-presentation-fr.jpg, pour les réseaux
npm run vignette     # docs/videos/cartes-presentation-fr-vignette.jpg, sur l'accueil de la documentation
```

`npm run preparer` demande le réseau pour ce qui manque au cache des tuiles du dépôt (`.cache/tiles/`), pour le géocodage des adresses d'exemple et pour les dates des sources. Il écrit les images dans `public/` et les chiffres dans `src/generated/figures.json`, que git ignore : relancez-le quand le rendu des cartes, le catalogue des couches ou l'interface changent, et la vidéo suit. La commande du terminal est lancée pour de vrai, avec un cache vide, pour que sa durée soit celle d'une première carte.

## Où est quoi

| Fichier | Contenu |
| --- | --- |
| `prepare.mjs` | la préparation des images et des chiffres avec les fonctions de cartes |
| `src/Presentation.jsx` | l'ordre des scènes, leur durée, et le fondu flou qui les enchaîne |
| `src/scenes/` | une scène par fichier, de l'accroche à l'écran de fin |
| `src/components/` | les titres, les cartes (caméra, contour), l'interface redessinée |
| `src/theme.js` | les couleurs du logo et de la page, les polices, le mouvement |
| `src/Cover.jsx` | l'image de couverture, pour les réseaux |
| `src/Vignette.jsx` | la vignette de la vidéo sur l'accueil de la documentation : la fin de la plongée, sans texte |

## Licences

- [Remotion](https://www.remotion.dev/license) fabrique la vidéo. Sa licence est gratuite pour un particulier et pour une structure de trois personnes au plus, mais ce n'est pas une licence libre : il n'est qu'une dépendance de ce dossier, jamais de l'outil, qui n'en a besoin ni pour fonctionner, ni pour ses tests.
- Les polices Inter et JetBrains Mono sont sous licence SIL OFL, les icônes Lucide sous licence ISC.
- Les données restent sous leur licence d'origine — IGN, BRGM, Géoportail de l'urbanisme, Base Adresse Nationale — et la vidéo les cite, comme les cartes qu'elle montre.
