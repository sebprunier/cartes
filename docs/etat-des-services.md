# État des services

Les cartes sont faites avec des données publiques, téléchargées au moment de la génération. Quand un de ces services est en panne, les cartes qui en ont besoin ne peuvent pas être générées, et l'outil ne peut rien y faire. Cette page les interroge un par un, pour savoir lequel répond.

<div id="etat-services" class="status" aria-live="polite">
  <p class="status-fallback">Cette page vérifie les services en direct, depuis votre navigateur : ouvrez-la sur le <a href="https://sebprunier.github.io/cartes/etat-des-services.html">site de la documentation</a>. En ligne de commande, <code>cartes etat</code> fait la même vérification.</p>
</div>

<script type="module" src="generer/etat.js"></script>

## Ce qui est vérifié

Chaque service reçoit une demande semblable à celles d'une carte de Colombiers : une tuile, un contour, une fiche du catalogue, une image d'une couche. Un service qui met plus de trois secondes à répondre est dit lent : il fonctionne, mais une carte qui lui demande des centaines de tuiles prendra son temps.

La vérification part de votre navigateur : si tout est en panne, c'est sans doute votre connexion.

## Quand un service est en panne

La panne est presque toujours passagère, et se règle en général dans la journée. Le 24 septembre 2026, par exemple, le service de Géorisques a renvoyé une page d'erreur pour toutes ses couches pendant plusieurs heures.

En attendant, générez la carte sans la couche concernée, ou relancez-la plus tard. L'outil le signale de lui-même : une couche dont le service est en panne porte un avertissement dès qu'on l'ajoute, et la génération s'arrête au début, avec un message qui renvoie ici. Voir aussi les [problèmes courants](problemes-courants.md).
