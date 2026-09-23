# Application de bureau

L'application reprend l'interface de la page web, mais génère les cartes avec le même moteur que la ligne de commande. Elle sert quand le navigateur ne suffit plus.

![La fenêtre de l'application de bureau sur macOS : la commune choisie, puis le fond de carte, le niveau de zoom et le format du fichier](images/captures/bureau-fenetre.png)

## Ce qu'elle apporte

- **Les zooms 18 et 19**, que le navigateur refuse de dessiner sur une commune de taille moyenne.
- **Le format TIFF**, que certains imprimeurs demandent.
- **Un cache des tuiles sur disque** : regénérer la même commune ne retélécharge rien.
- **Un PNG plus léger** : les plans sont écrits avec une palette de 256 couleurs, ce que le navigateur ne sait pas faire.
- **L'enregistrement direct** dans le fichier de votre choix, sans passer par le dossier de téléchargements.

## Installer

Les installeurs pour **macOS (Apple Silicon)**, **Windows** et **Linux** sont joints à chaque [version publiée](https://github.com/sebprunier/cartes/releases). Sur un Mac à processeur Intel, utilisez pour l'instant la page web ou la ligne de commande.

## Au premier lancement

Les applications ne sont pas signées, faute de certificat : signer coûte environ 99 $ par an chez Apple, et un certificat payant chez Windows. macOS et Windows affichent donc un avertissement, et ils ont raison de le faire — voici comment passer outre en connaissance de cause. Si cette manipulation vous gêne — et elle a de bonnes raisons de gêner —, la [page web](https://sebprunier.github.io/cartes/generer/) ne demande aucune installation et fait la même chose jusqu'au zoom 17.

### macOS

Ouvrez le fichier `.dmg` téléchargé, et glissez l'application dans le dossier Applications. Puis :

1. **Double-cliquez sur l'application.** macOS refuse de l'ouvrir : cliquez sur « Terminé », surtout pas sur « Placer dans la corbeille ».

   ![Élément « cartes.app » non ouvert : Apple n'a pas pu confirmer que « cartes.app » ne contenait pas de logiciel malveillant](images/macos-1-non-ouvert.png)

2. **Ouvrez Réglages système, puis Confidentialité et sécurité**, et descendez jusqu'à la section Sécurité. Une ligne y annonce que « cartes.app » a été bloqué : cliquez sur « Ouvrir quand même ». Cette ligne n'apparaît qu'après la tentative d'ouverture de l'étape 1, et disparaît au bout d'une heure environ : si vous ne la voyez pas, recommencez l'étape 1.

   ![La section Sécurité de Confidentialité et sécurité, avec le bouton « Ouvrir quand même » en face de « cartes.app » a été bloqué pour protéger votre Mac](images/macos-2-reglages.png)

3. **Confirmez** en cliquant sur « Ouvrir quand même » dans le dialogue qui suit.

   ![Ouvrir « cartes.app » ? avec les boutons Placer dans la corbeille, Ouvrir quand même et Terminé](images/macos-3-ouvrir-quand-meme.png)

4. **Autorisez** avec Touch ID ou le mot de passe de votre session.

   ![Confidentialité et sécurité : autoriser l'opération avec Touch ID ou le mot de passe d'un administrateur](images/macos-4-autoriser.png)

L'application s'ouvre, et s'ouvrira désormais d'un simple double-clic. Sur les versions de macOS antérieures à Sequoia (macOS 15), un clic droit sur l'application, puis « Ouvrir », suffit.

Si vous êtes à l'aise avec le Terminal, une commande remplace ces quatre étapes : `xattr -dr com.apple.quarantine /Applications/cartes.app`.

### Windows

Lancez l'installeur `.exe` téléchargé. SmartScreen affiche « Windows a protégé votre ordinateur » :

1. **Cliquez sur « Informations complémentaires »**, sous le texte de l'avertissement.

   ![L'avertissement de SmartScreen, « Windows a protégé votre ordinateur », avec le lien « Informations complémentaires »](images/captures/windows-smartscreen-1.png)

2. **Cliquez sur « Exécuter quand même »**, qui apparaît alors avec le nom de l'application.

   ![Le même avertissement une fois déplié : le nom de l'application, l'éditeur inconnu et le bouton « Exécuter quand même »](images/captures/windows-smartscreen-2.png)

3. **L'installation se lance.**

   ![La fenêtre « Installation de cartes » et sa barre de progression](images/captures/windows-installation.png)

Sur un poste géré par un service informatique, ce bouton peut manquer : l'installation se demande alors à ce service, ou la page web prend le relais.

### Linux

L'application est un fichier AppImage, qui se lance sans rien installer. Il suffit de le rendre exécutable, une fois, puis de le lancer. Dans un terminal, depuis le dossier où il a été téléchargé, et en remplaçant `0.6.0` par la version que vous avez téléchargée :

```sh
chmod +x cartes-0.6.0-linux-x86_64.AppImage
./cartes-0.6.0-linux-x86_64.AppImage
```

Les fois suivantes, la seconde commande suffit.

## Depuis les sources

```sh
git clone https://github.com/sebprunier/cartes.git
cd cartes
npm install
npm run electron
```
