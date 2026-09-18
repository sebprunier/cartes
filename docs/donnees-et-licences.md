# Données utilisées et licences

Ce document explique d'où viennent les données utilisées par `cartes`, sous quelles conditions elles peuvent être réutilisées, et comment l'outil respecte ces conditions.

> Analyse réalisée le 17 septembre 2026 à partir des fiches du catalogue de la Géoplateforme et du texte officiel de la licence. Ce n'est pas un avis juridique. Les licences et les fiches peuvent évoluer : elles sont à revérifier avant tout changement d'usage important, par exemple le lancement d'un service en ligne.

## En résumé

- Toutes les données affichées sur les cartes viennent de l'IGN et sont diffusées sous la **licence ouverte 2.0 d'Etalab**.
- Cette licence autorise la réutilisation **libre et gratuite, y compris commerciale**, avec modification et redistribution.
- Deux conditions : **mentionner la source et la date de dernière mise à jour** des données, et **ne pas laisser penser** que l'IGN cautionne la carte ou son auteur.
- L'outil ajoute automatiquement cette mention sur chaque carte, avec les dates lues dans le catalogue de la Géoplateforme.
- Les fonds de carte Esri ont été retirés : leurs conditions d'utilisation ne permettent pas l'usage qu'en fait l'outil.

## Données utilisées

| Donnée | Utilisation dans l'outil | Service de la Géoplateforme | Fiche du catalogue | Licence indiquée par la fiche |
| --- | --- | --- | --- | --- |
| Plan IGN | fond de carte `plan-ign` | WMTS, couche `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` | [IGNF_PLAN-IGN](https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_PLAN-IGN) | Licence Ouverte / Open License (compatible ODC-BY, CC-BY 2.0) |
| BD ORTHO (photographies aériennes) | fond de carte `ortho-ign` | WMTS, couche `ORTHOIMAGERY.ORTHOPHOTOS` | [IGNF_BD-ORTHO](https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_BD-ORTHO) | Licence Ouverte / Open License (compatible ODC-BY, CC-BY 2.0) |
| Parcellaire Express (PCI) | couche `cadastre`, superposée au fond de carte | WMTS, couche `CADASTRALPARCELS.PARCELLAIRE_EXPRESS` | [IGNF_PARCELLAIRE-EXPRESS-PCI](https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_PARCELLAIRE-EXPRESS-PCI) | Aucune contrainte d'utilisation, avec un lien vers la licence ouverte 2.0 d'Etalab |
| Risques naturels et technologiques | couches `ppr-inondation`, `ppr-mouvements`, `cavites` et `canalisations` | WMS de Géorisques, couches `PPRN_ZONE_INOND`, `PPRN_ZONE_MVT`, `CAVITE_LOCALISEE` et `CANALISATIONS` | [Géorisques](https://www.georisques.gouv.fr/) | Licence Ouverte (mentions légales du site) |
| Retrait-gonflement des argiles, millésime 2026 | couche `argiles`, dessinée à partir de tuiles vectorielles | archive PMTiles publiée sur data.gouv.fr | [Carte des risques retrait-gonflement des argiles – 2026](https://www.data.gouv.fr/datasets/carte-des-risques-retrait-gonflement-des-argiles-2026) | Licence Ouverte 2.0 (déclarée par le jeu de données) |
| ADMIN EXPRESS | contour de la commune | WFS, couche `ADMINEXPRESS-COG.LATEST:commune` | [IGNF_ADMIN-EXPRESS](https://cartes.gouv.fr/rechercher-une-donnee/dataset/IGNF_ADMIN-EXPRESS) | Licence Ouverte / Open License (compatible ODC-BY, CC-BY 2.0), avec un lien vers la licence ouverte 2.0 d'Etalab |
| Géocodage | recherche d'une commune par son nom | API de géocodage | – | non analysée |

Le géocodage sert uniquement à retrouver le code INSEE d'une commune : ses résultats n'apparaissent pas sur les cartes. Sa licence n'a donc pas été analysée.

Les fiches du Plan IGN et de la BD ORTHO nomment la licence sans préciser sa version. Celles d'ADMIN EXPRESS et du Parcellaire Express renvoient vers le [texte de la licence ouverte 2.0](https://www.etalab.gouv.fr/wp-content/uploads/2018/11/open-licence.pdf), analysé ci-dessous.

Les mentions légales de Géorisques indiquent que « la Licence Ouverte / Open Licence s'applique à l'ensemble des réutilisations libres gratuites de données publiques » et que, sauf mention contraire, les contenus du site sont sous licence Etalab 2.0. Le service ne publie pas de date de mise à jour pour ses couches : la carte les crédite donc de la date à laquelle elles ont été consultées, qui est celle de la génération.

Chaque couche de Géorisques n'est dessinée par le service que dans une plage d'échelles, qui lui est propre : les zonages de PPR disparaissent au-delà du 1:100 000, les cavités en deçà du 1:2 000, les canalisations en deçà du 1:20 000. L'outil demande donc chaque image à une échelle que le service accepte, puis l'agrandit ou la réduit — sans quoi une couche cochée serait tout simplement absente de la carte.

La carte des argiles est publiée par la Direction interministérielle du numérique à partir de la donnée de Géorisques, produite par le BRGM. Elle est déclarée sous licence ouverte 2.0 sur data.gouv.fr, et la carte la crédite avec la date de sa publication (1er avril 2026). Attention à ce qu'elle dit : cet aléa est cartographié à l'échelle départementale et **ne vaut pas étude de sol**. Une carte communale sert à situer les secteurs concernés, pas à conclure pour une parcelle donnée.

Le Parcellaire Express est produit par l'IGN à partir du plan cadastral informatisé de la DGFiP. Sa fiche déclare « Aucune contrainte » d'utilisation et ne signale aucune limitation d'accès public. Attention à ce que dit la donnée elle-même : le Parcellaire Express **ne se substitue pas au plan cadastral** et n'a pas de valeur juridique pour délimiter une propriété. Une carte qui l'affiche sert à se repérer, pas à trancher une limite de parcelle.

## Ce que permet la licence ouverte 2.0

La licence accorde au réutilisateur « the free, non-exclusive right to "Reuse" the "Information" […] for commercial or non-commercial purposes, worldwide and for an unlimited period ». Il peut notamment :

- reproduire et copier les données ;
- les adapter, les modifier et les transformer pour créer des informations, produits et services dérivés ;
- les partager, les diffuser, les redistribuer et les publier ;
- les exploiter commercialement, par exemple en les intégrant à son propre produit ou à sa propre application.

Pour `cartes`, cela couvre :

- l'assemblage des tuiles en une seule image, le recadrage sur la commune, la conversion en niveaux de gris et l'ajout du contour ;
- l'impression et l'affichage public des cartes, par exemple en mairie ;
- un éventuel service en ligne, gratuit ou payant, qui produirait ces cartes.

La licence est régie par le droit français. Elle est compatible avec les licences libres qui exigent au moins la mention de la paternité, notamment CC-BY, ODC-BY et l'Open Government Licence britannique.

## Les conditions à respecter

### Mentionner la source et la date de mise à jour

La réutilisation est permise sous réserve de la mention de la paternité : « its source (at least, the name of the "Grantor") and the date of the most recent update of the reused "Information" ». Autrement dit, il faut citer au moins le nom du producteur, ici l'IGN, et la date de dernière mise à jour des données réutilisées.

La licence précise qu'un lien hypertexte vers la source suffit. Ce n'est pas possible sur une carte imprimée : la mention doit donc y être écrite.

### Ne pas laisser croire à une caution de l'IGN

La mention de la source ne confère aucun caractère officiel à la réutilisation. Elle ne doit pas suggérer que l'IGN, ou une autre entité publique, reconnaît ou soutient le réutilisateur ou sa réutilisation.

### Ne pas induire en erreur

La réutilisation ne doit pas tromper les tiers sur le contenu des données, leur source ou leur date de mise à jour. Le réutilisateur est seul responsable de sa réutilisation.

### Ce que la licence ne garantit pas

L'IGN ne garantit ni l'absence d'erreurs dans les données, ni leur mise à disposition continue.

## Comment l'outil respecte ces conditions

- **Mention des sources.** Chaque carte porte en bas à droite une mention qui cite :
  - le fond de carte ;
  - ADMIN EXPRESS quand le contour est tracé ;
  - la date de dernière mise à jour de chaque donnée ;
  - la date de génération de la carte.

  Par exemple : « Sources : © IGN – Plan IGN (mise à jour du 05/08/2026) ; © IGN – ADMIN EXPRESS (mise à jour du 27/08/2026) · Carte générée le 17/09/2026 ».
- **Dates de mise à jour.** Elles sont lues au moment de la génération dans la fiche de chaque donnée du catalogue de la Géoplateforme : c'est la date de révision de la donnée. Si le catalogue ne répond pas, la carte est générée sans ces dates et un avertissement le signale : il vaut mieux alors relancer la commande plus tard.
- **Mention toujours présente.** Aucune option ne permet de la retirer. Sa taille est proportionnelle à l'image, pour rester lisible une fois la carte imprimée.
- **Pas de caution de l'IGN.** La mention indique seulement les sources, sans logo ni formulation qui laisserait penser que la carte est un produit de l'IGN.

- **Données ajoutées.** Les fichiers ajoutés à une carte (`--donnees`, glisser-déposer) sont cités eux aussi, sous leur nom : « Données ajoutées : Points d'apport volontaire ». Ils ne sont donc pas confondus avec les données de l'IGN.

Si vous recadrez ou retouchez une carte générée, conservez la mention des sources.

## Les données que vous ajoutez

L'outil affiche les fichiers que vous lui donnez sans rien vérifier de leurs droits : c'est à vous de vous assurer que vous pouvez les diffuser, et d'adapter le nom du jeu de données qui apparaît dans la mention des sources. Les données produites par la commune elle-même ne posent en général pas de difficulté ; celles récupérées ailleurs (intercommunalité, département, opérateur) sont à vérifier auprès de leur producteur.

Le dossier [`exemples/`](../exemples/) contient les points d'apport volontaire de Colombiers, relevés le 18 septembre 2026 sur le service cartographique de [Grand Châtellerault](https://www.grand-chatellerault.fr/connaitre/points-d-apport-volontaire). Aucune mention de licence n'accompagne ce service : ces treize points, factuels et publics, servent uniquement d'exemple, et seront retirés du dépôt à la demande de Grand Châtellerault.

## Conditions d'accès aux services de la Géoplateforme

Ces conditions portent sur l'accès aux services, pas sur la réutilisation des données.

- **Pas de compte ni de clé d'API.**
- **Limites de débit** ([page officielle](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/limites-d-usage/)) :
  - les services de tuiles (WMTS et tuiles vectorielles) n'ont pas de limite ;
  - le WFS est limité à 30 requêtes par seconde par adresse IP, et le géocodage à 50 ;
  - en cas de dépassement, le service répond « 429 Too Many Requests » et bloque l'adresse IP pendant 5 secondes.
- **Usage raisonnable.** Même sans limite, les services de tuiles sont un service public. L'outil limite le nombre de téléchargements simultanés et conserve les tuiles en cache pour ne pas les retélécharger.

## Pourquoi les fonds de carte Esri ont été retirés

Les premières versions de l'outil proposaient deux fonds Esri, « World Street Map » et « World Imagery ». Ils ont été retirés le 17 septembre 2026, pour les raisons suivantes :

- **Licence propriétaire.** Les fiches officielles des deux fonds indiquent « licensed under the Esri Master License Agreement ». Ce ne sont pas des données ouvertes : leur usage dépend du contrat et des conditions d'utilisation d'Esri ([World Street Map](https://www.arcgis.com/home/item.html?id=3b93337983e9436f8db950e38a8629af), [World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)).
- **Usage non prévu.** Ces mêmes fiches précisent : « This layer is not intended to be used to export tiles for offline ». C'est précisément ce que fait l'outil, qui télécharge les tuiles pour en faire une image. Esri propose des variantes « for Export », mais seulement pour un usage hors ligne dans les applications ArcGIS.
- **Services anciens et service actuel payant.** Les adresses utilisées (`server.arcgisonline.com`) sont d'anciens services qu'Esri demande de remplacer. Le service actuel exige un compte ArcGIS Location Platform et une clé d'accès, et il est facturé au volume de tuiles.

Les données de l'IGN couvrent déjà le plan et les photographies aériennes sur toute la France, sous licence ouverte.

## Ajouter une nouvelle source de données

Avant d'ajouter une donnée, qu'il s'agisse d'un fond de carte ou d'une couche d'information :

1. Vérifier sa licence dans sa fiche officielle. Toutes les données de l'IGN ne sont pas forcément sous licence ouverte.
2. Vérifier que ses conditions d'utilisation autorisent le téléchargement des tuiles ou des données pour produire une image.
3. Adapter la mention des sources si la licence l'exige.
4. Compléter ce document.
