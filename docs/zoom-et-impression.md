# Zoom et impression

C'est la question qui décide de tout le reste, et elle ne se pose pas comme on l'imagine.

## Pourquoi on ne peut pas simplement « prendre le zoom maximal »

Les fonds de carte sont faits de tuiles d'images. **Les noms de rue et de lieux y sont dessinés à une taille fixe**, environ 11 pixels de haut, quel que soit le niveau de zoom.

Monter d'un niveau de zoom double la largeur de l'image, sans changer la taille du texte. Le détail augmente donc, mais si vous réduisez ensuite l'image pour la faire tenir sur une feuille, le texte rétrécit d'autant et devient illisible.

Pour Colombiers, une commune d'environ 8 × 6 km, à 150 points par pouce :

| Zoom | Image | Taille imprimée | Format |
| --- | --- | --- | --- |
| 15 | 2 553 × 1 953 px | 43 × 33 cm | A2 |
| 16 | 5 104 × 3 904 px | 86 × 66 cm | A0 |
| 17 | 10 207 × 7 807 px | 173 × 132 cm | plus grand qu'A0 |

Une carte au zoom 17 imprimée en A3 serait réduite environ quatre fois : ses étiquettes mesureraient un demi-millimètre.

## La règle pratique

**Choisissez le zoom d'après le format papier que vous visez**, et non d'après le détail que vous souhaitez.

- Une affiche A0 pour la salle du conseil : zoom 16 pour une commune de taille moyenne.
- Un A3 à poser sur une table : zoom 14 ou 15.
- Une carte de secteur, imprimée en grand format chez un imprimeur : zoom 17, avec l'application de bureau.

Le tableau des dimensions, dans l'étape « Régler la carte », donne pour chaque zoom la taille de l'image, le nombre de tuiles à télécharger, le format papier correspondant et la mémoire nécessaire.

## Vérifier avant de générer

L'aperçu répond à la question par l'image plutôt que par le calcul. Il montre deux choses :

- **la commune entière réduite**, pour vérifier le cadrage, les données et la légende ;
- **un extrait à l'échelle réelle** : un pixel de l'aperçu est un pixel de la carte. C'est là que se juge la lisibilité des étiquettes. Un clic sur la miniature déplace l'extrait — allez voir le bourg, où le texte est le plus dense.

Le poids estimé du fichier s'affiche en même temps, à ±30 % environ.

## Résolution d'impression (dpi)

Le champ « Résolution visée » ne change pas l'image : il change la taille à laquelle elle s'imprimera. La valeur est écrite dans le fichier, et les logiciels d'impression la respectent.

- **150 dpi** convient à une affiche regardée à un mètre ; c'est la valeur par défaut, et celle des tableaux ci-dessus.
- **300 dpi** donne une image deux fois plus petite sur le papier, pour un document tenu en main.

## Formats de fichier

| Format | Quand | Pourquoi |
| --- | --- | --- |
| **PNG** | les plans | du texte et des traits nets, sans artefact de compression |
| **JPEG** | les photographies aériennes | une photo pèse environ huit fois plus lourd en PNG |
| **TIFF** | pour un imprimeur qui le demande | disponible seulement dans l'application de bureau |

En ligne de commande et dans l'application, le PNG d'un plan est écrit avec une palette de 256 couleurs : le fichier pèse environ moitié moins, sans perte visible. Le navigateur ne sait pas le faire, et produit donc des fichiers plus lourds à qualité égale.

## Jusqu'où peut-on aller

La page web est limitée par ce que le navigateur sait dessiner : environ 268 millions de pixels sur Chrome, soit le zoom 17 pour une commune de la taille de Colombiers, davantage pour une petite commune. Tous les niveaux de zoom sont proposés : si l'image demandée dépasse cette limite, la page le dit **avant** de télécharger quoi que ce soit, et vous renvoie vers l'[application de bureau](application-de-bureau.md) ou la [ligne de commande](ligne-de-commande.md), qui n'ont pas cette limite — seulement celle de la mémoire de votre machine, qu'indique la colonne « Mémoire ».
