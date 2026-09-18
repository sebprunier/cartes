// Interface of the web page: choice of the municipality, settings, estimates and generation.

import { BASEMAPS } from './core/basemaps.js';
import { MAP_LAYERS, mapLayerZoomWarning } from './core/maplayers.js';
import { formatBytes, imageMemory } from './core/estimates.js';
import { LayerError, applyProperties, layerWarning, readLayer } from './core/layers.js';
import {
  boundaryBbox,
  describeMunicipality,
  fetchBoundary,
  normalizeName,
  searchMunicipalities,
} from './core/municipalities.js';
import { paperFormat, printSizeMm } from './core/print.js';
import { renderDetail, renderPreview } from './preview.js';
import { extentFromBbox, groundResolution } from './core/tiles.js';
import { engine } from './engine.js';

const ZOOM_LEVELS = 7; // Zoom levels shown in the table, up to the maximum of the basemap.
const DEFAULT_ZOOM = 16;
const MARGIN = 0.03;


const element = (id) => document.getElementById(id);
const searchField = element('search');
const searchResults = element('results');
const selectedMunicipality = element('selected-municipality');
const settingsSection = element('settings');
const dataSection = element('data');
const dropZone = element('drop-zone');
const fileInput = element('data-files');
const layersList = element('layers');
const legendChoice = element('legend-choice');
const legendBox = element('legend');
const previewSection = element('preview');
const previewButton = element('preview-button');
const previewProgress = element('preview-progress');
const previewViews = element('preview-views');
const previewOverview = element('preview-overview');
const previewOverviewCaption = element('preview-overview-caption');
const previewDetail = element('preview-detail');
const previewDetailCaption = element('preview-detail-caption');
const generationSection = element('generation');
const basemapChoice = element('basemap');
const zoomChoice = element('zoom');
const formatChoice = element('format');
const dpiField = element('dpi');
const grayscaleBox = element('grayscale');
const outlineBox = element('outline');
const mapLayerList = element('map-layers');
const estimatesTable = element('estimates');
const estimateResult = element('estimate-result');
const generateButton = element('generate');
const cancelButton = element('cancel');
const progressLine = element('progress-line');
const result = element('result');
const errorLine = element('error');
const searchError = element('search-error');
const dataError = element('data-error');
const previewError = element('preview-error');
const zoomNote = element('zoom-note');
const privacyNote = element('privacy-note');

// The engine sets what the platform can do: highest zoom level and output formats.
const MAX_ZOOM = engine.maxZoom;
for (const [value, label] of engine.formats) formatChoice.append(new Option(label, value));
if (engine.zoomNote) zoomNote.textContent = engine.zoomNote;
else zoomNote.hidden = true;
privacyNote.textContent = engine.privacyNote;

let municipality;
let pendingSearch;
const layers = [];

for (const basemap of Object.values(BASEMAPS)) {
  basemapChoice.append(new Option(basemap.name, basemap.id));
}
showMapLayers();

/** The catalog of layers that can be laid over the basemap, as checkboxes. */
function showMapLayers() {
  mapLayerList.replaceChildren(
    ...Object.values(MAP_LAYERS).map((layer) => {
      const item = document.createElement('li');
      const choice = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = layer.id;
      box.className = 'map-layer';
      choice.append(box, ` ${layer.name}`);

      const description = document.createElement('p');
      description.className = 'map-layer-description';
      description.textContent = `${layer.description} ${layer.attribution}`;

      const opacity = opacityChoice(layer);
      box.addEventListener('change', () => {
        opacity.hidden = !box.checked;
        showMapLayerWarnings();
        clearPreview();
      });

      const warning = document.createElement('p');
      warning.className = 'map-layer-warning';
      warning.dataset.layer = layer.id;
      warning.hidden = true;
      item.append(choice, description, opacity, warning);
      return item;
    }),
  );
}

/** The opacity of a layer over the basemap: at 1 it hides what is under it, at 0.2 it is barely visible. */
function opacityChoice(layer) {
  const line = document.createElement('p');
  line.className = 'map-layer-opacity';
  line.hidden = true;
  const label = document.createElement('label');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.1';
  slider.max = '1';
  slider.step = '0.05';
  slider.value = String(layer.opacity);
  slider.className = 'map-layer-opacity-value';
  slider.dataset.layer = layer.id;
  const share = document.createElement('span');
  const showShare = () => (share.textContent = `${Math.round(Number(slider.value) * 100)} %`);
  showShare();
  slider.addEventListener('input', showShare);
  slider.addEventListener('change', clearPreview);
  label.append('Opacité ', slider, ' ', share);
  line.append(label);
  return line;
}

/** Says which chosen layers have nothing to show at the chosen zoom level. */
function showMapLayerWarnings() {
  for (const warning of mapLayerList.querySelectorAll('.map-layer-warning')) {
    const layer = MAP_LAYERS[warning.dataset.layer];
    const chosen = mapLayerList.querySelector(`.map-layer[value="${layer.id}"]`).checked;
    const message = chosen ? mapLayerZoomWarning(layer, Number(zoomChoice.value)) : undefined;
    warning.textContent = message ?? '';
    warning.hidden = !message;
  }
}

/** The layers to lay over the basemap, with the opacity chosen for each. */
function chosenMapLayers() {
  return [...mapLayerList.querySelectorAll('.map-layer:checked')].map(({ value }) => ({
    id: value,
    opacity: Number(mapLayerList.querySelector(`.map-layer-opacity-value[data-layer="${value}"]`).value),
  }));
}

searchField.addEventListener('input', debounce(search, 300));
basemapChoice.addEventListener('change', () => {
  fillZooms();
  showEstimates();
  clearPreview();
});
zoomChoice.addEventListener('change', () => {
  showEstimates();
  showMapLayerWarnings();
  clearPreview();
});
dpiField.addEventListener('change', showEstimates);
formatChoice.addEventListener('change', clearPreview);
grayscaleBox.addEventListener('change', clearPreview);
outlineBox.addEventListener('change', clearPreview);
legendBox.addEventListener('change', clearPreview);
fileInput.addEventListener('change', () => addFiles(fileInput.files));
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('over');
  addFiles(event.dataTransfer.files);
});
previewButton.addEventListener('click', showPreview);
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
    showError(`Recherche impossible : ${error.message}`, searchError);
  }
}

async function select(found) {
  searchResults.hidden = true;
  searchField.value = found.name;
  try {
    const boundary = await fetchBoundary(found.inseeCode);
    municipality = { boundary, bbox: boundaryBbox(boundary) };
  } catch (error) {
    showError(`Contour indisponible : ${error.message}`, searchError);
    return;
  }
  selectedMunicipality.textContent = `${municipality.boundary.name} (${municipality.boundary.inseeCode})`;
  selectedMunicipality.hidden = false;
  settingsSection.hidden = false;
  dataSection.hidden = false;
  previewSection.hidden = false;
  generationSection.hidden = false;
  previewViews.hidden = true;
  clearPreview();
  result.hidden = true;
  clearErrors();
  fillZooms();
  showEstimates();
}

/** Reads the files dropped or chosen, and adds them as layers. */
async function addFiles(files) {
  for (const file of files) {
    try {
      const layer = readLayer(await file.text(), { fileName: file.name, index: layers.length });
      // The name titles the legend and appears in the sources mention: the file name is only a first guess.
      layers.push({ ...layer, defaultName: layer.name });
    } catch (error) {
      showError(error instanceof LayerError ? `${file.name} : ${error.message}` : error.message, dataError);
    }
  }
  fileInput.value = '';
  showLayers();
  clearPreview();
}

/**
 * Forgets the preview: the settings have changed, and an image that no longer matches them is worse than no
 * image at all. The weight shown is forgotten the same way, for the same reason.
 */
function clearPreview() {
  previewViews.hidden = true;
  previewOverview.replaceChildren();
  previewOverviewCaption.textContent = '';
  previewDetail.replaceChildren();
  previewDetailCaption.textContent = '';
  previewButton.textContent = "Afficher l'aperçu";
  estimateResult.textContent = '';
}

/** The map request behind the preview shown, to redraw its detail elsewhere without asking everything again. */
function previewRequest() {
  return {
    basemapId: basemapChoice.value,
    boundary: municipality.boundary,
    bbox: municipality.bbox,
    zoom: Number(zoomChoice.value),
    margin: MARGIN,
    grayscale: grayscaleBox.checked,
    outline: outlineBox.checked,
    mapLayers: chosenMapLayers(),
    layers,
    legend: legendBox.checked,
  };
}

/**
 * Shows what the map will be: its two views, and the weight of the file. Both answer the same question before
 * generating, and both download a sample of tiles, so a single action runs them together.
 */
async function showPreview() {
  if (!municipality) return;
  await Promise.all([drawPreviewViews(), estimateWeight()]);
}

async function drawPreviewViews() {
  await drawPreview(async (request) => {
    const { overview, overviewZoom, ...detail } = await renderPreview(request);
    previewOverview.replaceChildren(overviewCanvas(overview, request));
    previewOverviewCaption.textContent =
      `Commune entière, réduite (zoom ${overviewZoom}) : la légende et la mention des sources y paraissent ` +
      'plus grandes que sur la carte finale.';
    return detail;
  });
}

/** Redraws the detail at the point clicked on the miniature, the rest of the preview being unchanged. */
async function moveDetail(request, center) {
  await drawPreview(() => renderDetail(request, center));
}

/** Runs a drawing, showing its progress, and places the detail it returns. */
async function drawPreview(draw) {
  const request = previewRequest();
  previewButton.disabled = true;
  previewProgress.hidden = false;
  try {
    const { detail, wholeMap } = await draw(request);
    previewDetail.replaceChildren(displayable(detail));
    previewDetailCaption.textContent = wholeMap
      ? `Carte entière au zoom ${request.zoom}, à l'échelle réelle.`
      : `Extrait au zoom ${request.zoom}, à l'échelle réelle : un pixel de l'aperçu est un pixel de la carte. ` +
        'Cliquez sur la miniature pour le déplacer.';
    previewViews.hidden = false;
  } catch (error) {
    showError(`Aperçu impossible : ${error.message}`, previewError);
  } finally {
    previewButton.disabled = false;
    previewProgress.hidden = true;
  }
}

/** The miniature, on which a click chooses the part of the map shown in the detail. */
function overviewCanvas(offscreen, request) {
  const canvas = displayable(offscreen);
  canvas.className = 'clickable';
  canvas.title = "Cliquez pour déplacer l'extrait";
  canvas.addEventListener('click', (event) => {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    moveDetail(request, { x: (event.clientX - left) / width, y: (event.clientY - top) / height });
  });
  return canvas;
}

/** A canvas of the page showing what was drawn away from it, in an OffscreenCanvas. */
function displayable(offscreen) {
  const canvas = document.createElement('canvas');
  canvas.width = offscreen.width;
  canvas.height = offscreen.height;
  canvas.getContext('bitmaprenderer').transferFromImageBitmap(offscreen.transferToImageBitmap());
  return canvas;
}

function showLayers() {
  layersList.replaceChildren(...layers.map(layerItem));
  legendChoice.hidden = layers.length === 0;
}

/** One layer of the list: its name, the properties used for the legend and the colors, and its categories. */
function layerItem(layer, index) {
  const item = document.createElement('li');
  const header = document.createElement('p');
  header.className = 'layer-header';
  const symbol = document.createElement('span');
  symbol.className = 'symbol';
  symbol.style.background = layer.color;
  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'layer-name';
  name.value = layer.name;
  name.setAttribute('aria-label', 'Nom du jeu de données');
  name.addEventListener('input', () => {
    layer.name = name.value;
    clearPreview();
  });
  name.addEventListener('blur', () => {
    if (name.value.trim()) return;
    layer.name = name.value = layer.defaultName;
  });
  const count = document.createElement('span');
  count.className = 'layer-count';
  count.textContent = `${layer.features.length.toLocaleString('fr-FR')} élément${layer.features.length > 1 ? 's' : ''}`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Retirer';
  remove.addEventListener('click', () => {
    layers.splice(index, 1);
    showLayers();
    clearPreview();
  });
  header.append(symbol, name, count, remove);
  item.append(header);

  if (layer.properties.length > 0) {
    const choices = document.createElement('p');
    choices.className = 'layer-choices';
    choices.append(
      propertyChoice('Légende', layer.categoryProperty, '— le fichier —', layer.properties, (property) =>
        update(index, { categoryProperty: property }),
      ),
      propertyChoice('Couleurs', layer.colorProperty, '— automatiques —', layer.properties, (property) =>
        update(index, { colorProperty: property }),
      ),
    );
    item.append(choices);
  }

  const warning = layerWarning(layer);
  if (warning) {
    const line = document.createElement('p');
    line.className = 'layer-warning';
    line.textContent = warning;
    item.append(line);
  }

  if (layer.categories.length > 0) {
    const categories = document.createElement('ul');
    categories.className = 'layer-categories';
    categories.append(
      ...layer.categories.map(({ name: category, color }) => {
        const line = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'symbol';
        dot.style.background = color;
        line.append(dot, document.createTextNode(category));
        return line;
      }),
    );
    item.append(categories);
  }
  return item;
}

/** A drop-down choosing the property that carries the categories or the colors of a layer. */
function propertyChoice(label, selected, noneLabel, properties, onChange) {
  const wrapper = document.createElement('label');
  const select = document.createElement('select');
  select.append(new Option(noneLabel, ''), ...properties.map((property) => new Option(property, property)));
  select.value = selected ?? '';
  select.addEventListener('change', () => onChange(select.value || undefined));
  wrapper.append(`${label} : `, select);
  return wrapper;
}

/** Applies a new choice of properties to a layer, which gives its features their category and their color again. */
function update(index, change) {
  layers[index] = applyProperties({ ...layers[index], ...change }, index);
  showLayers();
  clearPreview();
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
      const row = document.createElement('tr');
      row.dataset.zoom = String(zoom);
      if (zoom === Number(zoomChoice.value)) row.classList.add('selected');
      for (const value of [
        zoom,
        groundResolution(latitude, zoom).toFixed(2),
        `${extent.width} × ${extent.height}`,
        extent.tileCount,
        `${widthMm.toFixed(0)} × ${heightMm.toFixed(0)} mm (${paperFormat(widthMm, heightMm)})`,
        formatBytes(imageMemory(extent)),
      ]) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      row.addEventListener('click', () => {
        zoomChoice.value = String(zoom);
        showEstimates();
        showMapLayerWarnings();
        clearPreview();
      });
      return row;
    }),
  );
}

/** Weight of the file for the settings chosen, layers included, at the chosen zoom level only. */
async function estimateWeight() {
  const zoom = Number(zoomChoice.value);
  const layers = chosenMapLayers();
  try {
    const { size } = await engine.estimate({
      basemapId: basemapChoice.value,
      bbox: municipality.bbox,
      zoom,
      margin: MARGIN,
      format: formatChoice.value,
      grayscale: grayscaleBox.checked,
      mapLayers: layers,
    });
    const names = layers.map(({ id }) => MAP_LAYERS[id].name);
    estimateResult.textContent =
      size === undefined
        ? 'Estimation indisponible : réessayez plus tard.'
        : `≈ ${formatBytes(size)} en ${formatChoice.options[formatChoice.selectedIndex].text} au zoom ${zoom}` +
          `${names.length > 0 ? `, avec ${names.join(' et ')}` : ''}, à ±30 % environ.`;
  } catch (error) {
    showError(`Estimation impossible : ${error.message}`, previewError);
  }
}

async function generate() {
  if (!municipality) return;
  generateButton.disabled = true;
  cancelButton.hidden = false;
  result.hidden = true;
  clearErrors();
  showProgressSources();
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
        mapLayers: chosenMapLayers(),
        layers,
        legend: legendBox.checked,
        fileName: defaultFileName(),
      },
      showProgress,
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

/**
 * One line per source to download, in the order they are drawn: the basemap, then the layers laid over it.
 * Each keeps its own count, rather than a single total where nothing says what is being downloaded.
 */
function showProgressSources() {
  const sources = [BASEMAPS[basemapChoice.value], ...chosenMapLayers().map(({ id }) => MAP_LAYERS[id])];
  progressLine.replaceChildren(
    ...sources.map((source) => {
      const item = document.createElement('li');
      item.dataset.source = source.id;
      const name = document.createElement('span');
      name.className = 'progress-name';
      name.textContent = source.name;
      const bar = document.createElement('progress');
      bar.max = 100;
      bar.value = 0;
      const status = document.createElement('span');
      status.className = 'progress-status';
      status.textContent = 'en attente';
      item.append(name, bar, status);
      return item;
    }),
  );
  progressLine.hidden = false;
}

function showProgress({ sourceId, done, total }) {
  const item = progressLine.querySelector(`li[data-source="${sourceId}"]`);
  if (!item) return;
  item.querySelector('progress').value = (done / total) * 100;
  item.querySelector('.progress-status').textContent =
    done < total ? `${done} / ${total} tuiles` : `${total} tuiles`;
  item.classList.toggle('done', done >= total);
}

/** Name of the generated file: municipality, basemap, zoom level and rendering. */
function defaultFileName() {
  return (
    `${municipality.boundary.inseeCode}-${normalizeName(municipality.boundary.name).replaceAll(' ', '-')}` +
    `-${basemapChoice.value}${chosenMapLayers().map(({ id }) => `-${id}`).join('')}-z${zoomChoice.value}` +
    `${grayscaleBox.checked ? '-gris' : ''}.${formatChoice.value}`
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
}

/** Shows a failure where the action that caused it sits, rather than at the bottom of the page. */
function showError(message, line = errorLine) {
  clearErrors();
  line.textContent = message;
  line.hidden = false;
}

function clearErrors() {
  for (const line of [errorLine, searchError, dataError, previewError]) {
    line.textContent = '';
    line.hidden = true;
  }
}

function debounce(action, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => action(...args), delay);
  };
}
