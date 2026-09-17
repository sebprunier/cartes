// Interface of the web page: choice of the municipality, settings, estimates and generation.

import { BASEMAPS } from './core/basemaps.js';
import { formatBytes, imageMemory } from './core/estimates.js';
import {
  boundaryBbox,
  describeMunicipality,
  fetchBoundary,
  normalizeName,
  searchMunicipalities,
} from './core/municipalities.js';
import { paperFormat, printSizeMm } from './core/print.js';
import { extentFromBbox, groundResolution } from './core/tiles.js';
import { engine } from './engine.js';

const ZOOM_LEVELS = 7; // Zoom levels shown in the table, up to the maximum of the basemap.
const DEFAULT_ZOOM = 16;
const MARGIN = 0.03;
const UNKNOWN_SIZE = '–';
const FILE_SIZE_COLUMN = 6;

const element = (id) => document.getElementById(id);
const searchField = element('search');
const searchResults = element('results');
const selectedMunicipality = element('selected-municipality');
const settingsSection = element('settings');
const generationSection = element('generation');
const basemapChoice = element('basemap');
const zoomChoice = element('zoom');
const formatChoice = element('format');
const dpiField = element('dpi');
const grayscaleBox = element('grayscale');
const outlineBox = element('outline');
const estimatesTable = element('estimates');
const estimateButton = element('estimate');
const estimateSpinner = element('estimate-spinner');
const estimateStatus = element('estimate-status');
const estimateNote = element('estimate-note');
const generateButton = element('generate');
const cancelButton = element('cancel');
const progressLine = element('progress-line');
const progressBar = element('progress-bar');
const progressStatus = element('progress-status');
const result = element('result');
const errorLine = element('error');
const zoomNote = element('zoom-note');

// The engine sets what the platform can do: highest zoom level and output formats.
const MAX_ZOOM = engine.maxZoom;
for (const [value, label] of engine.formats) formatChoice.append(new Option(label, value));
if (engine.zoomNote) zoomNote.textContent = engine.zoomNote;
else zoomNote.hidden = true;

let municipality;
let pendingSearch;

for (const basemap of Object.values(BASEMAPS)) {
  basemapChoice.append(new Option(basemap.name, basemap.id));
}

searchField.addEventListener('input', debounce(search, 300));
basemapChoice.addEventListener('change', () => {
  fillZooms();
  showEstimates();
});
zoomChoice.addEventListener('change', showEstimates);
dpiField.addEventListener('change', showEstimates);
formatChoice.addEventListener('change', clearFileSizes);
grayscaleBox.addEventListener('change', clearFileSizes);
estimateButton.addEventListener('click', estimateFileSizes);
generateButton.addEventListener('click', generate);
cancelButton.addEventListener('click', cancel);

async function search() {
  const input = searchField.value.trim();
  searchResults.hidden = input.length < 2;
  if (input.length < 2) return;

  const currentSearch = (pendingSearch = searchMunicipalities(input));
  try {
    const municipalities = await currentSearch;
    if (currentSearch !== pendingSearch) return; // A more recent search took over.
    searchResults.replaceChildren(
      ...municipalities.map((found) => {
        const item = document.createElement('li');
        item.textContent = describeMunicipality(found);
        item.addEventListener('click', () => select(found));
        return item;
      }),
    );
    searchResults.hidden = municipalities.length === 0;
  } catch (error) {
    showError(`Recherche impossible : ${error.message}`);
  }
}

async function select(found) {
  searchResults.hidden = true;
  searchField.value = found.name;
  try {
    const boundary = await fetchBoundary(found.inseeCode);
    municipality = { boundary, bbox: boundaryBbox(boundary) };
  } catch (error) {
    showError(`Contour indisponible : ${error.message}`);
    return;
  }
  selectedMunicipality.textContent = `${municipality.boundary.name} (${municipality.boundary.inseeCode})`;
  selectedMunicipality.hidden = false;
  settingsSection.hidden = false;
  generationSection.hidden = false;
  result.hidden = true;
  errorLine.hidden = true;
  fillZooms();
  showEstimates();
}

function zoomLevels() {
  const { maxZoom } = BASEMAPS[basemapChoice.value];
  return Array.from({ length: ZOOM_LEVELS }, (_, index) => maxZoom - ZOOM_LEVELS + 1 + index);
}

function fillZooms() {
  const available = zoomLevels().filter((zoom) => zoom <= MAX_ZOOM);
  const selected = Number(zoomChoice.value) || DEFAULT_ZOOM;
  zoomChoice.replaceChildren();
  for (const zoom of available) zoomChoice.append(new Option(String(zoom), String(zoom)));
  zoomChoice.value = String(Math.min(Math.max(selected, available[0]), available.at(-1)));
}

function showEstimates() {
  if (!municipality) return;
  const dpi = Number(dpiField.value) || 150;
  const latitude = (municipality.bbox[1] + municipality.bbox[3]) / 2;
  estimatesTable.tBodies[0].replaceChildren(
    ...zoomLevels().map((zoom) => {
      const extent = extentFromBbox(municipality.bbox, zoom, MARGIN);
      const [widthMm, heightMm] = printSizeMm(extent.width, extent.height, dpi);
      const available = zoom <= MAX_ZOOM;
      const row = document.createElement('tr');
      row.dataset.zoom = String(zoom);
      if (zoom === Number(zoomChoice.value)) row.classList.add('selected');
      if (!available) row.classList.add('unavailable');
      for (const value of [
        zoom,
        groundResolution(latitude, zoom).toFixed(2),
        `${extent.width} × ${extent.height}`,
        extent.tileCount,
        `${widthMm.toFixed(0)} × ${heightMm.toFixed(0)} mm (${paperFormat(widthMm, heightMm)})`,
        formatBytes(imageMemory(extent)),
        available ? UNKNOWN_SIZE : 'hors navigateur',
      ]) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      if (available) {
        row.addEventListener('click', () => {
          zoomChoice.value = String(zoom);
          showEstimates();
        });
      }
      return row;
    }),
  );
}

function clearFileSizes() {
  for (const row of estimatesTable.tBodies[0].rows) {
    if (Number(row.dataset.zoom) <= MAX_ZOOM) row.cells[FILE_SIZE_COLUMN].textContent = UNKNOWN_SIZE;
  }
}

function fileSizeCell(zoom) {
  return [...estimatesTable.tBodies[0].rows].find((row) => row.dataset.zoom === String(zoom))?.cells[FILE_SIZE_COLUMN];
}

async function estimateFileSizes() {
  if (!municipality) return;
  const zooms = zoomLevels().filter((zoom) => zoom <= MAX_ZOOM);
  estimateButton.disabled = true;
  estimateSpinner.hidden = false;
  estimateNote.hidden = true;
  clearFileSizes();
  try {
    for (const [index, zoom] of zooms.entries()) {
      estimateStatus.textContent = `zoom ${zoom} (${index + 1} sur ${zooms.length})`;
      const cell = fileSizeCell(zoom);
      if (cell) cell.textContent = '…';
      const { size } = await engine.estimate({
        basemapId: basemapChoice.value,
        bbox: municipality.bbox,
        zoom,
        margin: MARGIN,
        format: formatChoice.value,
        grayscale: grayscaleBox.checked,
      });
      if (cell) cell.textContent = size === undefined ? '?' : `≈ ${formatBytes(size)}`;
    }
  } catch (error) {
    showError(`Estimation impossible : ${error.message}`);
    clearFileSizes();
  } finally {
    estimateButton.disabled = false;
    estimateSpinner.hidden = true;
    estimateNote.hidden = false;
    estimateStatus.textContent = '';
  }
}

async function generate() {
  if (!municipality) return;
  generateButton.disabled = true;
  cancelButton.hidden = false;
  progressLine.hidden = false;
  result.hidden = true;
  errorLine.hidden = true;
  progressBar.value = 0;
  progressStatus.textContent = 'Téléchargement des tuiles…';
  const start = performance.now();

  try {
    const map = await engine.generate(
      {
        basemapId: basemapChoice.value,
        boundary: municipality.boundary,
        bbox: municipality.bbox,
        zoom: Number(zoomChoice.value),
        margin: MARGIN,
        format: formatChoice.value,
        grayscale: grayscaleBox.checked,
        outline: outlineBox.checked,
        fileName: defaultFileName(),
      },
      ({ done, total }) => {
        progressBar.value = (done / total) * 100;
        progressStatus.textContent = `${done} / ${total} tuiles`;
      },
    );
    if (!map.canceled) showMap(map, Math.round((performance.now() - start) / 1000));
  } catch (error) {
    showError(error.message);
  } finally {
    generateButton.disabled = false;
    cancelButton.hidden = true;
    progressLine.hidden = true;
  }
}

/** Name of the generated file: municipality, basemap, zoom level and rendering. */
function defaultFileName() {
  return (
    `${municipality.boundary.inseeCode}-${normalizeName(municipality.boundary.name).replaceAll(' ', '-')}` +
    `-${basemapChoice.value}-z${zoomChoice.value}${grayscaleBox.checked ? '-gris' : ''}.${formatChoice.value}`
  );
}

function showMap(map, seconds) {
  // The web page offers the image as a download; the desktop application has already written the file.
  const delivery = document.createElement(map.blob ? 'a' : 'span');
  if (map.blob) {
    const name = defaultFileName();
    delivery.href = URL.createObjectURL(map.blob);
    delivery.download = name;
    delivery.textContent = `Télécharger ${name} (${formatBytes(map.blob.size)})`;
  } else {
    delivery.textContent = `Carte enregistrée dans ${map.path}`;
  }

  const details = document.createElement('span');
  details.className = 'note';
  details.textContent =
    `Image de ${map.width} × ${map.height} px, générée en ${seconds} s` +
    (map.missing > 0 ? `, ${map.missing} tuile(s) indisponible(s) laissée(s) en blanc` : '') +
    (map.updateDatesMissing ? '. Date de mise à jour des données indisponible : réessayez plus tard.' : '.');

  result.replaceChildren(delivery, document.createElement('br'), details);
  result.hidden = false;
}

function cancel() {
  engine.cancel();
  cancelButton.hidden = true;
  progressLine.hidden = true;
  generateButton.disabled = false;
  progressStatus.textContent = '';
}

function showError(message) {
  errorLine.textContent = message;
  errorLine.hidden = false;
}

function debounce(action, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => action(...args), delay);
  };
}
