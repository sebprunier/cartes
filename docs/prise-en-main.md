# Prise en main

**cartes** produit la carte détaillée d'une commune française, prête à imprimer en grand format : le plan IGN ou les photographies aériennes, recadrés sur le territoire de la commune, avec son contour, les données que vous ajoutez et la mention des sources.

L'outil est libre et gratuit. Les données viennent de services publics — IGN, Géorisques — et restent sous leur licence d'origine.

## Trois façons de s'en servir

| | Pour qui | Ce qu'il faut |
| --- | --- | --- |
| **[Page web](https://sebprunier.github.io/cartes/)** | tout le monde | rien à installer, un navigateur suffit |
| **[Application de bureau](application-de-bureau.md)** | pour les très grandes cartes | une installation, sur Windows, macOS ou Linux |
| **[Ligne de commande](ligne-de-commande.md)** | pour répéter ou automatiser | Node.js et un terminal |

Les trois produisent exactement la même carte : elles partagent le même code de génération. La page web s'arrête là où le navigateur ne sait plus dessiner d'image assez grande ; l'application et la ligne de commande n'ont pas cette limite.

Pour un logiciel plutôt que pour une personne, une [API](api.md) rend les mêmes services : un serveur que chacun héberge, et que d'autres logiciels appellent.

## Votre première carte, en cinq minutes

1. **Ouvrez la [page web](https://sebprunier.github.io/cartes/)** et saisissez le nom de votre commune. En cas d'homonymes, la liste indique le département et le nombre d'habitants.
2. **Réglez la carte** : le fond (plan ou photographies aériennes) et le niveau de zoom. Le tableau des dimensions indique, pour chaque zoom, la taille de l'image et le format papier correspondant. Commencez par le zoom déjà sélectionné.
3. **Ajoutez des données**, si vous le souhaitez : cochez des données publiques — cadastre, risques — ou déposez vos propres fichiers. Cette étape est facultative.
4. **Affichez l'aperçu**. Il montre la commune entière réduite, un extrait à l'échelle réelle, et le poids du fichier. C'est le moment de vérifier que les noms de rue seront lisibles une fois imprimés.
5. **Générez la carte**, puis téléchargez-la. Le téléchargement des tuiles prend de quelques secondes à quelques minutes selon la taille demandée.

## Ce que vous obtenez

Une image — PNG ou JPEG — qui porte :

- le **contour de la commune**, tracé d'après les limites officielles d'ADMIN EXPRESS ;
- les **données ajoutées**, avec leurs étiquettes et une **légende** en bas à gauche ;
- la **mention des sources** en bas à droite, avec la date de mise à jour de chaque donnée et la date de génération.

Cette mention n'est pas décorative : la licence des données impose de citer la source et la fraîcheur de l'information. **Conservez-la si vous recadrez ou retouchez la carte.** Voir [Sources et licences](donnees-et-licences.md).

## Pour aller plus loin

- [Choisir le zoom et le format papier](zoom-et-impression.md) — la question qui décide de tout le reste
- [Ajouter des données](donnees.md) — données publiques et fichiers de la commune
- [Problèmes courants](problemes-courants.md)
