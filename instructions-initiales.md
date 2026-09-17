Je suis conseiller municipal délégué au Numérique pour la commune de Colombiers dans la Vienne (86).

Voici un problème auquel nous sommes confronté : avoir une carte de la commune avec un bon niveau de détail (les noms de toutes les rues par exemple), pouvoir éventuellement y ajouter des données géographiques complémentaires (exemple : des points de collecte de déchets, des zones de risques : inondation, argiles, etc.) et avec comme finalité d'imprimer cette carte en grand format (A3 ou plus, d'où le besoin d'avoir le meilleur niveau de détail sur la carte).

Voici mon idée : créer un ou plusieurs outils à destination des communes de France pour les aider à créer des cartes détaillées de leur territoire, pour répondre au problème énoncé juste avant.

Voici mon idée générale pour résoudre ce problème : 
* choisir une commune
    * on peut s'appuyer sur l'API de géocodage de la Géoplateforme pour cela
        * https://data.geopf.fr/geocodage/openapi
    * on doit pouvoir récupérer le code INSEE de la commune avec cette API
* récupérer les contours de la commune
    * à voir s'il existe une API pour cela (j'imagine que oui, peut être au niveau geopf ou ign)
* partir d'une bounding box qui englobe le contour de la commune, qui sera les limites de la carte à afficher / imprimer
* profiter du système de tuiles utilisé pour l'affichage des cartes dans Leaflet, MapLibre ou autre
    * utiliser un ou plusieurs fonds de carte ouverts, exemple :
        * Niveaux de gris (IGN Géoplateforme, WMTS)
            * https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}
        * Plan (Esri)
            * https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}
        * Satellite (Esri)
            * https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
    * zoomer au maximum pour avoir le maximum de détail, récupérer les images de tuiles, itérer autant que nécessaire pour avoir toutes les tuiles détaillées pour la bounding box de la commune
    * "recoller" les tuiles pour avoir une carte détaillée de la commune

Pour ce qu'on doit produire : 
* Dans un premier temps, on peut faire un simple outil en ligne de commande pour tester, et on fera ensuite un vrai service avec une interface graphique, qu'on poura déployer dans le cloud et pourquoi pas en faire un Saas.
* Pour démarrer on valide le concept de "recollage" de tuiles avec juste le fond de carte. On verra dans un second temps pour ajouter des données géographiques complémentaires (points, zones, etc.)

On y va ?
