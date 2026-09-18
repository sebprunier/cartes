# Application de bureau

L'application reprend l'interface de la page web, mais génère les cartes avec le même moteur que la ligne de commande. Elle sert quand le navigateur ne suffit plus.

## Ce qu'elle apporte

- **Les zooms 18 et 19**, que le navigateur refuse de dessiner sur une commune de taille moyenne.
- **Le format TIFF**, que certains imprimeurs demandent.
- **Un cache des tuiles sur disque** : regénérer la même commune ne retélécharge rien.
- **Un PNG plus léger** : les plans sont écrits avec une palette de 256 couleurs, ce que le navigateur ne sait pas faire.
- **L'enregistrement direct** dans le fichier de votre choix, sans passer par le dossier de téléchargements.

## Installer

Les installeurs pour **macOS (Apple Silicon)**, **Windows** et **Linux** sont joints à chaque [version publiée](https://github.com/sebprunier/cartes/releases). Sur un Mac à processeur Intel, utilisez pour l'instant la page web ou la ligne de commande.

## Au premier lancement, votre système va se méfier

Les applications ne sont pas signées, faute de certificat : signer coûte environ 99 $ par an chez Apple, et un certificat payant chez Windows. Votre système affiche donc un avertissement, et il a raison de le faire — voici comment passer outre en connaissance de cause.

- **macOS** : faites un clic droit sur l'application, puis « Ouvrir », et confirmez. Si le système refuse toujours, ouvrez le Terminal et lancez `xattr -dr com.apple.quarantine /Applications/cartes.app`.
- **Windows** : SmartScreen affiche « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis « Exécuter quand même ».
- **Linux** : rendez le fichier exécutable avec `chmod +x cartes-*.AppImage`, puis lancez-le.

Si cette manipulation vous gêne — et elle a de bonnes raisons de gêner —, la [page web](https://sebprunier.github.io/cartes/) ne demande aucune installation et fait la même chose jusqu'au zoom 17.

## Depuis les sources

```sh
git clone https://github.com/sebprunier/cartes.git
cd cartes
npm install
npm run electron
```
