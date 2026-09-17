// Interface of the web page: choice of the municipality, settings, estimates and generation.

import { BASEMAPS } from './core/basemaps.js';
import { formatBytes, imageMemory } from './core/estimates.js';
import { boundaryBbox, describeMunicipality, fetchBoundary, normalizeName, searchMunicipalities } from './core/municipalities.js';
import { paperFormat, printSizeMm } from './core/print.js';
import { extentFromBbox, groundResolution } from './core/tiles.js';

const ZOOM_LEVELS = 7; // Zoom levels shown in the table, up to the maximum of the basemap.
const DEFAULT_ZOOM = 16;
// Above this zoom level, the image goes beyond what browsers can draw: the command line takes over.
const MAX_ZOOM = 17;
const MARGIN = 0.03;
const POIDS_INCONNU = '–';

const element = (id) => document.getElementById(id);
const champRecherche = element('recherche');
const listeResultats = element('resultats');
const communeChoisie = element('commune-choisie');
const sectionOptions = element('options');
const sectionGeneration = element('generation');
const choixFond = element('fond');
const choixZoom = element('zoom');
const choixFormat = element('format');
const champDpi = element('dpi');
const caseGris = element('gris');
const caseContour = element('contour');
const tableauEstimations = element('estimations');
const boutonEstimer = element('estimer');
const chargementEstimation = element('chargement-estimation');
const etatEstimation = element('etat-estimation');
const noteEstimation = element('note-estimation');
const boutonGenerer = element('generer');
const boutonAnnuler = element('annuler');
const progression = element('progression');
const barre = element('barre');
const etat = element('etat');
const resultat = element('resultat');
const erreur = element('erreur');

let commune;
let travailleur;
let rechercheEnCours;

for (const basemap of Object.values(BASEMAPS)) {
  choixFond.append(new Option(basemap.name, basemap.id));
}

champRecherche.addEventListener('input', debounce(rechercher, 300));
choixFond.addEventListener('change', () => {
  remplirZooms();
  afficherEstimations();
});
choixZoom.addEventListener('change', afficherEstimations);
champDpi.addEventListener('change', afficherEstimations);
choixFormat.addEventListener('change', () => viderPoids());
caseGris.addEventListener('change', () => viderPoids());
boutonEstimer.addEventListener('click', estimerPoids);
boutonGenerer.addEventListener('click', generer);
boutonAnnuler.addEventListener('click', annuler);

async function rechercher() {
  const saisie = champRecherche.value.trim();
  listeResultats.hidden = saisie.length < 2;
  if (saisie.length < 2) return;

  const recherche = (rechercheEnCours = searchMunicipalities(saisie));
  try {
    const communes = await recherche;
    if (recherche !== rechercheEnCours) return; // Une recherche plus récente a pris la main.
    listeResultats.replaceChildren(
      ...communes.map((municipality) => {
        const item = document.createElement('li');
        item.textContent = describeMunicipality(municipality);
        item.addEventListener('click', () => choisir(municipality));
        return item;
      }),
    );
    listeResultats.hidden = communes.length === 0;
  } catch (error) {
    afficherErreur(`Recherche impossible : ${error.message}`);
  }
}

async function choisir(municipality) {
  listeResultats.hidden = true;
  champRecherche.value = municipality.name;
  try {
    const boundary = await fetchBoundary(municipality.inseeCode);
    commune = { boundary, bbox: boundaryBbox(boundary), municipality };
  } catch (error) {
    afficherErreur(`Contour indisponible : ${error.message}`);
    return;
  }
  communeChoisie.textContent = `${commune.boundary.name} (${commune.boundary.inseeCode})`;
  communeChoisie.hidden = false;
  sectionOptions.hidden = false;
  sectionGeneration.hidden = false;
  resultat.hidden = true;
  erreur.hidden = true;
  remplirZooms();
  afficherEstimations();
}

function remplirZooms() {
  const disponibles = zooms().filter((zoom) => zoom <= MAX_ZOOM);
  const choisi = Number(choixZoom.value) || DEFAULT_ZOOM;
  choixZoom.replaceChildren();
  for (const zoom of disponibles) choixZoom.append(new Option(String(zoom), String(zoom)));
  choixZoom.value = String(Math.min(Math.max(choisi, disponibles[0]), disponibles.at(-1)));
}

function zooms() {
  const { maxZoom } = BASEMAPS[choixFond.value];
  return Array.from({ length: ZOOM_LEVELS }, (_, index) => maxZoom - ZOOM_LEVELS + 1 + index);
}

function afficherEstimations() {
  if (!commune) return;
  const dpi = Number(champDpi.value) || 150;
  const latitude = (commune.bbox[1] + commune.bbox[3]) / 2;
  const corps = tableauEstimations.tBodies[0];
  corps.replaceChildren(
    ...zooms().map((zoom) => {
      const extent = extentFromBbox(commune.bbox, zoom, MARGIN);
      const [largeurMm, hauteurMm] = printSizeMm(extent.width, extent.height, dpi);
      const ligne = document.createElement('tr');
      ligne.dataset.zoom = String(zoom);
      if (zoom === Number(choixZoom.value)) ligne.classList.add('choisi');
      if (zoom > MAX_ZOOM) ligne.classList.add('indisponible');
      for (const valeur of [
        zoom,
        groundResolution(latitude, zoom).toFixed(2),
        `${extent.width} × ${extent.height}`,
        extent.tileCount,
        `${largeurMm.toFixed(0)} × ${hauteurMm.toFixed(0)} mm (${paperFormat(largeurMm, hauteurMm)})`,
        formatBytes(imageMemory(extent)),
        zoom > MAX_ZOOM ? 'hors navigateur' : POIDS_INCONNU,
      ]) {
        const cellule = document.createElement('td');
        cellule.textContent = String(valeur);
        ligne.append(cellule);
      }
      if (zoom <= MAX_ZOOM) {
        ligne.addEventListener('click', () => {
          choixZoom.value = String(zoom);
          afficherEstimations();
        });
      }
      return ligne;
    }),
  );
}

function viderPoids() {
  for (const ligne of tableauEstimations.tBodies[0].rows) {
    if (Number(ligne.dataset.zoom) <= MAX_ZOOM) ligne.cells[6].textContent = POIDS_INCONNU;
  }
}

function celluleDuZoom(zoom) {
  return [...tableauEstimations.tBodies[0].rows].find((row) => row.dataset.zoom === String(zoom))?.cells[6];
}

async function estimerPoids() {
  if (!commune) return;
  const aEstimer = zooms().filter((zoom) => zoom <= MAX_ZOOM);
  boutonEstimer.disabled = true;
  chargementEstimation.hidden = false;
  noteEstimation.hidden = true;
  viderPoids();
  try {
    for (const [index, zoom] of aEstimer.entries()) {
      etatEstimation.textContent = `zoom ${zoom} (${index + 1} sur ${aEstimer.length})`;
      const cellule = celluleDuZoom(zoom);
      if (cellule) cellule.textContent = '…';
      const { size } = await demanderAuTravailleur({
        task: 'estimate',
        basemapId: choixFond.value,
        bbox: commune.bbox,
        zoom,
        margin: MARGIN,
        format: choixFormat.value,
        grayscale: caseGris.checked,
      });
      if (cellule) cellule.textContent = size === undefined ? '?' : `≈ ${formatBytes(size)}`;
    }
  } catch (error) {
    afficherErreur(`Estimation impossible : ${error.message}`);
    viderPoids();
  } finally {
    boutonEstimer.disabled = false;
    chargementEstimation.hidden = true;
    noteEstimation.hidden = false;
    etatEstimation.textContent = '';
  }
}

async function generer() {
  if (!commune) return;
  boutonGenerer.disabled = true;
  boutonAnnuler.hidden = false;
  progression.hidden = false;
  resultat.hidden = true;
  erreur.hidden = true;
  barre.value = 0;
  etat.textContent = 'Téléchargement des tuiles…';
  const debut = performance.now();

  try {
    const carte = await demanderAuTravailleur(
      {
        task: 'generate',
        basemapId: choixFond.value,
        boundary: commune.boundary,
        bbox: commune.bbox,
        zoom: Number(choixZoom.value),
        margin: MARGIN,
        format: choixFormat.value,
        grayscale: caseGris.checked,
        outline: caseContour.checked,
      },
      ({ done, total }) => {
        barre.value = (done / total) * 100;
        etat.textContent = `${done} / ${total} tuiles`;
      },
    );
    afficherCarte(carte, Math.round((performance.now() - debut) / 1000));
  } catch (error) {
    afficherErreur(error.message);
  } finally {
    boutonGenerer.disabled = false;
    boutonAnnuler.hidden = true;
    progression.hidden = true;
  }
}

function afficherCarte(carte, secondes) {
  const nom = `${commune.boundary.inseeCode}-${normalizeName(commune.boundary.name).replaceAll(' ', '-')}-${choixFond.value}-z${choixZoom.value}${caseGris.checked ? '-gris' : ''}.${choixFormat.value}`;
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(carte.blob);
  lien.download = nom;
  lien.textContent = `Télécharger ${nom} (${formatBytes(carte.blob.size)})`;

  resultat.replaceChildren(lien, document.createElement('br'));
  const details = document.createElement('span');
  details.className = 'note';
  details.textContent =
    `Image de ${carte.width} × ${carte.height} px, générée en ${secondes} s` +
    (carte.missing > 0 ? `, ${carte.missing} tuile(s) indisponible(s) laissée(s) en blanc` : '') +
    (carte.updateDatesMissing ? '. Date de mise à jour des données indisponible : réessayez plus tard.' : '.');
  resultat.append(details);
  resultat.hidden = false;
}

function annuler() {
  travailleur?.terminate();
  travailleur = undefined;
  boutonAnnuler.hidden = true;
  progression.hidden = true;
  boutonGenerer.disabled = false;
  etat.textContent = '';
}

/** Sends a task to a fresh worker and waits for its result, forwarding the progress messages. */
function demanderAuTravailleur(message, onProgress) {
  travailleur?.terminate();
  travailleur = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    travailleur.onmessage = ({ data }) => {
      if (data.progress) onProgress?.(data.progress);
      else if (data.error) reject(new Error(data.error));
      else if (data.done) resolve(data);
    };
    travailleur.onerror = (event) => reject(new Error(event.message ?? 'Erreur inattendue'));
    travailleur.postMessage(message);
  });
}

function afficherErreur(message) {
  erreur.textContent = message;
  erreur.hidden = false;
}

function debounce(action, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => action(...args), delay);
  };
}
