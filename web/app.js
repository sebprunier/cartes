// Interface of the web page: choice of the municipality, settings, estimates and generation.

import { BASEMAPS } from './core/basemaps.js';
import { MAP_LAYERS, MapLayerError, customMapLayer, mapLayerZoomWarning, mapLayersByTheme } from './core/maplayers.js';
import { formatBytes, imageMemory } from './core/estimates.js';
import {
  GEOCODING_STATUS,
  GeocodingNeeded,
  LayerError,
  applyProperties,
  decodeText,
  layerWarning,
  parseCsv,
  readLayer,
} from './core/layers.js';
import { geocodeCsv } from './core/geocoding.js';
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
const geocodingPanel = element('geocoding');
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
const mapLayersEmpty = element('map-layers-empty');
const addMapLayerButton = element('add-map-layer');
const layerChooser = element('layer-chooser');
const layerChoices = element('layer-choices');
const layerSearch = element('layer-search');
const closeLayerChooser = element('close-layer-chooser');
const openCustomLayer = element('open-custom-layer');
const customLayerForm = element('custom-layer-form');
const customLayerUrl = element('custom-layer-url');
const customLayerName = element('custom-layer-name');
const customLayerSource = element('custom-layer-source');
const customLayerPrivacy = element('custom-layer-privacy');
const customLayerError = element('custom-layer-error');
const checkCustomLayer = element('check-custom-layer');
const closeCustomLayer = element('close-custom-layer');
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

// The engine sets what the platform can do: highest zoom level and output formats.
const MAX_ZOOM = engine.maxZoom;
for (const [value, label] of engine.formats) formatChoice.append(new Option(label, value));
if (engine.zoomNote) zoomNote.textContent = engine.zoomNote;
else zoomNote.hidden = true;
// What only makes sense on the web page — such as a link to download the desktop application — is left out of it.
if (engine.desktop) for (const link of document.querySelectorAll('[data-web-only]')) link.hidden = true;

let municipality;
let pendingSearch;
const layers = [];

for (const basemap of Object.values(BASEMAPS)) {
  basemapChoice.append(new Option(basemap.name, basemap.id));
}
// The layers laid over the basemap: those of the catalog first, in its order, then those added by address.
// A layer of the catalog is kept as { id, opacity }; a layer added by address carries its whole description,
// which is what the generation needs to fetch it.
const mapLayers = [];

// Layers added by address are remembered between two maps: retyping an address every time would be tedious.
// They stay in this browser — the page keeps its promise that nothing about the map leaves it.
const REMEMBERED_LAYERS = 'cartes.couches-perso';
let remembered = readRemembered();
showMapLayers();

function readRemembered() {
  try {
    const written = JSON.parse(localStorage.getItem(REMEMBERED_LAYERS) ?? '[]');
    // What was written may be from an older version, or edited by hand: only what still builds is kept.
    return written.map((definition) => tryCustomLayer(definition)).filter(Boolean);
  } catch {
    return [];
  }
}

function tryCustomLayer(definition) {
  try {
    return customMapLayer(definition);
  } catch {
    return undefined;
  }
}

function rememberLayer(layer) {
  remembered = [...remembered.filter(({ id }) => id !== layer.id), layer];
  writeRemembered();
}

function forgetLayer(layer) {
  remembered = remembered.filter(({ id }) => id !== layer.id);
  writeRemembered();
}

function writeRemembered() {
  try {
    const kept = remembered.map(({ id, url, name, attribution }) => ({ id, url, name, attribution }));
    localStorage.setItem(REMEMBERED_LAYERS, JSON.stringify(kept));
  } catch {
    // A browser that refuses to store anything is not a reason to refuse the layer for this map.
  }
}

/** The description of a chosen layer: the catalog entry, or the layer added by address, which carries its own. */
function layerOf(chosen) {
  return MAP_LAYERS[chosen.id] ?? chosen;
}

/** The layers chosen, and what to do with each: change its opacity, or take it off the map. */
function showMapLayers() {
  mapLayerList.replaceChildren(...mapLayers.map(mapLayerItem));
  mapLayersEmpty.hidden = mapLayers.length > 0;
  const catalogAdded = mapLayers.filter(({ id }) => MAP_LAYERS[id]).length;
  addMapLayerButton.disabled = false;
  addMapLayerButton.textContent =
    catalogAdded === Object.keys(MAP_LAYERS).length ? 'Ajouter une couche personnalisée' : 'Ajouter une couche';
}

function mapLayerItem(chosen) {
  const layer = layerOf(chosen);
  const item = document.createElement('li');

  const header = document.createElement('p');
  header.className = 'map-layer-header';
  const name = document.createElement('span');
  name.textContent = layer.name;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Retirer';
  remove.addEventListener('click', () => {
    mapLayers.splice(mapLayers.indexOf(chosen), 1);
    showMapLayers();
    clearPreview();
  });
  header.append(name, remove);

  const description = document.createElement('p');
  description.className = 'map-layer-description';
  description.textContent = `${layer.description} ${layer.attribution}`;

  item.append(header, description, opacityChoice(chosen, layer));

  const message = mapLayerZoomWarning(layer, Number(zoomChoice.value));
  if (message) {
    const warning = document.createElement('p');
    warning.className = 'map-layer-warning';
    warning.textContent = message;
    item.append(warning);
  }
  return item;
}

/** The opacity of a layer over the basemap: at 1 it hides what is under it, at 0.2 it is barely visible. */
function opacityChoice(chosen, layer) {
  const line = document.createElement('p');
  line.className = 'map-layer-opacity';
  const label = document.createElement('label');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.1';
  slider.max = '1';
  slider.step = '0.05';
  slider.value = String(chosen.opacity);
  slider.setAttribute('aria-label', `Opacité de ${layer.name}`);
  const share = document.createElement('span');
  const showShare = () => (share.textContent = `${Math.round(Number(slider.value) * 100)} %`);
  showShare();
  slider.addEventListener('input', () => {
    chosen.opacity = Number(slider.value);
    showShare();
  });
  slider.addEventListener('change', clearPreview);
  label.append('Opacité ', slider, ' ', share);
  line.append(label);
  return line;
}

// The icon of each theme of the catalog, and of the layers added by address: drawn strokes, in the color of
// the text, so that they read at a glance and print nowhere.
const THEME_ICONS = {
  urbanisme: '<path d="M4 4h16v16H4zM4 11h9M13 4v16M13 15h7"/>',
  risques: '<path d="M12 3.8 21 19.5H3z"/><path d="M12 10v4.4M12 16.9v.1"/>',
  territoire: '<path d="m3 19.5 6-9.5 4 5.2 2.6-3.4 5.4 7.7z"/><circle cx="16.5" cy="6.5" r="1.8"/>',
  custom:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.8 2.6 14.2 0 17M12 3.5c-2.6 2.8-2.6 14.2 0 17"/>',
};
const CUSTOM_THEME = { id: 'custom', name: 'Vos couches' };

/**
 * The catalog, sorted into its themes, then the layers remembered — limited to what is not already on the map and
 * to what matches the search, which looks into the names of the themes and of the providers too.
 */
function showLayerChoices() {
  const wanted = layerSearch.value.trim().toLowerCase();
  const available = (layers, theme) =>
    layers
      .filter((layer) => !mapLayers.some(({ id }) => id === layer.id))
      .filter((layer) =>
        [layer.name, layer.description, layer.attribution, providerOf(layer), theme?.name]
          .join(' ')
          .toLowerCase()
          .includes(wanted),
      );
  const groups = [
    ...mapLayersByTheme(Object.values(MAP_LAYERS)).map(({ theme, layers }) => ({ theme, layers: available(layers, theme) })),
    { theme: CUSTOM_THEME, layers: available(remembered, CUSTOM_THEME) },
  ].filter(({ layers }) => layers.length > 0);

  layerChoices.replaceChildren(...groups.map(layerGroup));
  if (groups.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'note';
    empty.textContent = 'Aucune couche ne correspond.';
    layerChoices.append(empty);
  }
}

/** A theme of the chooser: its icon and name, then a card for each of its layers. */
function layerGroup({ theme, layers }) {
  const group = document.createElement('li');
  group.className = 'layer-group';
  const title = document.createElement('h4');
  title.id = `layer-theme-${theme.id}`;
  const icon = document.createElement('span');
  icon.className = 'layer-theme-icon';
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${THEME_ICONS[theme.id]}</svg>`;
  title.append(icon, theme.name);
  const list = document.createElement('ul');
  list.setAttribute('aria-labelledby', title.id);
  list.append(...layers.map(layerCard));
  group.append(title, list);
  return group;
}

/** A layer of the chooser: the whole card adds it, and says who publishes it and from which zoom it shows. */
function layerCard(layer) {
  const item = document.createElement('li');
  item.className = 'layer-choice';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'layer-choice-add';
  add.addEventListener('click', () => {
    addMapLayer(layer);
    layerChooser.close();
  });

  const text = document.createElement('span');
  text.className = 'layer-choice-text';
  const name = document.createElement('span');
  name.className = 'layer-choice-name';
  name.textContent = layer.name;
  const description = document.createElement('span');
  description.className = 'layer-choice-description';
  description.textContent = layer.description;
  const badges = document.createElement('span');
  badges.className = 'layer-choice-badges';
  badges.append(badge(providerOf(layer)));
  // The zoom a layer needs is said only when one of the zoom levels offered falls short of it.
  if (layer.minZoom > Math.min(...zoomLevels())) {
    const zoom = Number(zoomChoice.value);
    const short = zoomChoice.value !== '' && zoom < layer.minZoom;
    const needed = badge(
      short ? `Dès le zoom ${layer.minZoom}, vous avez choisi le ${zoom}` : `Dès le zoom ${layer.minZoom}`,
      short ? 'warning' : '',
    );
    needed.title = layer.zoomNote ?? '';
    badges.append(needed);
  }
  text.append(name, description, badges);

  const plus = document.createElement('span');
  plus.className = 'layer-choice-plus';
  plus.setAttribute('aria-hidden', 'true');
  // Drawn rather than typed: a « + » sits where its font puts it, seldom in the middle of the circle.
  plus.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 2.5v11M2.5 8h11"/></svg>';
  add.append(text, plus);
  item.append(add);

  // A layer added by address is remembered until it is told to be forgotten.
  if (!MAP_LAYERS[layer.id]) {
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'forget-layer';
    forget.textContent = 'Oublier';
    forget.setAttribute('aria-label', `Oublier la couche ${layer.name}`);
    forget.addEventListener('click', () => {
      forgetLayer(layer);
      showLayerChoices();
    });
    item.append(forget);
  }
  return item;
}

function badge(label, kind = '') {
  const element = document.createElement('span');
  element.className = `layer-badge ${kind}`.trim();
  element.textContent = label;
  return element;
}

/** Who publishes a layer: named in the catalog, or the host of its address for a layer added by address. */
function providerOf(layer) {
  if (layer.provider) return layer.provider;
  try {
    return new URL(layer.url).host;
  } catch {
    return '';
  }
}

/** Lays a layer over the map: those of the catalog in its order, then those added by address. */
function addMapLayer(layer) {
  const order = Object.keys(MAP_LAYERS);
  mapLayers.push(MAP_LAYERS[layer.id] ? { id: layer.id, opacity: layer.opacity } : { ...layer });
  mapLayers.sort((one, other) => rank(one, order) - rank(other, order));
  showMapLayers();
  clearPreview();
}

function rank(chosen, order) {
  const place = order.indexOf(chosen.id);
  return place === -1 ? order.length : place;
}

/** The layers to lay over the basemap, with the opacity chosen for each. */
function chosenMapLayers() {
  return mapLayers.map((chosen) => (MAP_LAYERS[chosen.id] ? { id: chosen.id, opacity: chosen.opacity } : { ...chosen }));
}

addMapLayerButton.addEventListener('click', () => {
  layerSearch.value = '';
  showLayerChoices();
  layerChooser.showModal();
});
closeLayerChooser.addEventListener('click', () => layerChooser.close());

// The page promises that nothing about the map is sent anywhere. A layer added by address is the one thing
// that breaks that promise, so it is said here rather than buried in the documentation.
customLayerPrivacy.textContent = engine.customLayerNote;

openCustomLayer.addEventListener('click', () => {
  layerChooser.close();
  showCustomLayerForm();
});

closeCustomLayer.addEventListener('click', () => customLayerForm.close());

// A layer the check found nothing in is not refused: it may simply not cover this municipality. It is not
// added silently either — the same silence would hide a mistyped address. So it is said, and asked again.
let doubtful;

function showCustomLayerForm() {
  hideError(customLayerError);
  forgetDoubt();
  customLayerForm.showModal();
  customLayerUrl.focus();
}

function forgetDoubt() {
  doubtful = undefined;
  checkCustomLayer.textContent = 'Vérifier et ajouter';
}

for (const field of [customLayerUrl, customLayerName, customLayerSource]) {
  field.addEventListener('input', forgetDoubt);
}

/**
 * Adds a layer from what was typed: what it says is checked first, then the address is tried on one tile over
 * the municipality. A mistyped address, or a service closed to the browser, says so here — not after the
 * download of a map.
 */
checkCustomLayer.addEventListener('click', async () => {
  if (doubtful) {
    acceptCustomLayer(doubtful);
    return;
  }
  hideError(customLayerError);
  let layer;
  try {
    layer = customMapLayer({
      url: customLayerUrl.value,
      name: customLayerName.value,
      attribution: customLayerSource.value,
    });
  } catch (error) {
    showError(error instanceof MapLayerError ? error.message : `Couche refusée : ${error.message}`, customLayerError);
    return;
  }
  if (mapLayers.some(({ id }) => id === layer.id)) {
    showError(`« ${layer.name} » est déjà sur la carte.`, customLayerError);
    return;
  }

  checkCustomLayer.disabled = true;
  const said = checkCustomLayer.textContent;
  checkCustomLayer.textContent = 'Vérification…';
  try {
    const [lon, lat] = municipality
      ? [(municipality.bbox[0] + municipality.bbox[2]) / 2, (municipality.bbox[1] + municipality.bbox[3]) / 2]
      : [];
    const checked = await engine.checkLayer({ ...layer }, { lon, lat, zoom: Number(zoomChoice.value) });
    // The desktop application answers from its main process, where an error crosses as a message.
    if (checked.error) throw new MapLayerError(checked.error);
    if (!checked.empty) {
      acceptCustomLayer(layer);
      return;
    }
    // The two silences are not worth the same warning: a service that knows none of the addresses tried has
    // almost certainly been given the wrong one.
    doubtful = layer;
    checkCustomLayer.textContent = 'Ajouter quand même';
    showError(
      checked.missing
        ? `Le service ne connaît aucune des tuiles demandées pour « ${layer.name} » : l’adresse est sans doute ` +
            'inexacte. Vérifiez-la, ou ajoutez la couche quand même si vous savez ce que vous faites.'
        : `« ${layer.name} » répond, mais n’a aucune donnée sur cette commune : beaucoup de couches ne couvrent ` +
            'qu’une partie du territoire. Ajoutez-la quand même si c’est attendu.',
      customLayerError,
    );
  } catch (error) {
    showError(
      error instanceof MapLayerError ? error.message : `Vérification impossible : ${error.message}`,
      customLayerError,
    );
  } finally {
    checkCustomLayer.disabled = false;
    if (!doubtful) checkCustomLayer.textContent = said;
  }
});

function acceptCustomLayer(layer) {
  rememberLayer(layer);
  addMapLayer(layer);
  customLayerForm.close();
  forgetDoubt();
}
layerSearch.addEventListener('input', showLayerChoices);

// Each field can explain itself, on demand: a hint shown by a button, rather than on hover, which neither a
// touchscreen nor a keyboard can reach. Where the browser knows popovers — the desktop application always does —
// the hint opens as a bubble under its button, closed by a click elsewhere or by Escape, one at a time. Elsewhere
// it opens within the page.
const popovers = typeof HTMLElement.prototype.togglePopover === 'function';
const hintToggles = new Map();
for (const toggle of document.querySelectorAll('.hint-toggle')) {
  const hint = element(toggle.getAttribute('aria-controls'));
  if (popovers) {
    hint.popover = 'auto';
    hint.hidden = false;
    // Declared as the invoker of the bubble, the button closes it when it is open, where a click handler would see
    // the bubble closed by the click itself, landing outside it, and open it again.
    toggle.popoverTargetElement = hint;
    hintToggles.set(hint, toggle);
    hint.addEventListener('beforetoggle', (event) => {
      if (event.newState === 'open') placeHint(hint, toggle);
    });
    hint.addEventListener('toggle', (event) => {
      const open = event.newState === 'open';
      toggle.setAttribute('aria-expanded', String(open));
      if (open) placeHint(hint, toggle);
    });
  } else {
    toggle.addEventListener('click', () => {
      const shown = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!shown));
      hint.hidden = shown;
    });
  }
}

/**
 * Places a hint under its button, its arrow on the button, within the window — or above the button when there is
 * no room left under it. Before it opens, its height is not known yet: it is placed under, then moved if needed.
 */
function placeHint(hint, toggle) {
  const margin = 12;
  const gap = 10;
  const button = toggle.getBoundingClientRect();
  const width = Math.min(hint.offsetWidth || 352, innerWidth - 2 * margin);
  const height = hint.offsetHeight;
  const center = button.left + button.width / 2;
  const left = Math.min(Math.max(margin, center - width / 2), innerWidth - width - margin);
  const above = height > 0 && button.bottom + gap + height > innerHeight - margin && button.top - gap - height > margin;
  hint.style.left = `${left}px`;
  hint.style.top = `${above ? button.top - gap - height : button.bottom + gap}px`;
  hint.style.setProperty('--arrow', `${center - left}px`);
  hint.classList.toggle('above', above);
}

// A bubble follows its button when the page scrolls or the window changes size.
for (const event of ['scroll', 'resize']) {
  window.addEventListener(
    event,
    () => {
      for (const [hint, toggle] of hintToggles) if (hint.matches(':popover-open')) placeHint(hint, toggle);
    },
    { passive: true },
  );
}

searchField.addEventListener('input', debounce(search, 300));
basemapChoice.addEventListener('change', () => {
  fillZooms();
  showEstimates();
  clearPreview();
});
zoomChoice.addEventListener('change', () => {
  showEstimates();
  showMapLayers();
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

// A file dropped anywhere else is opened by the window, which replaces the page by it. In a browser the back
// button undoes that; the application has neither back button nor address bar, and would have to be quit and
// restarted, losing every setting. Landing beside the drop zone is a slip, not a request to open the file.
for (const name of ['dragover', 'drop']) {
  window.addEventListener(name, (event) => {
    if (dropZone.contains(event.target)) return;
    event.preventDefault();
    if (name === 'drop') dropZone.classList.remove('over');
  });
}
previewButton.addEventListener('click', showPreview);
generateButton.addEventListener('click', generate);
cancelButton.addEventListener('click', cancel);

async function search() {
  const input = searchField.value.trim();
  // One letter is enough: Y is a municipality of the Somme.
  searchResults.hidden = input.length === 0;
  if (input.length === 0) return;

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

/**
 * Reads the files dropped or chosen, and adds them as layers. A file of addresses without coordinates is offered
 * to geocoding instead, which sends them away: nothing leaves before the user says so.
 */
async function addFiles(files) {
  for (const file of files) {
    // Many spreadsheets write their CSV in Windows-1252: read as UTF-8, its accents would be lost.
    const text = decodeText(new Uint8Array(await file.arrayBuffer()));
    try {
      const layer = readLayer(text, { fileName: file.name, index: layers.length });
      // The name titles the legend and appears in the sources mention: the file name is only a first guess.
      layers.push({ ...layer, defaultName: layer.name });
    } catch (error) {
      if (error instanceof GeocodingNeeded) geocodingQueue.push({ fileName: file.name, text });
      else showError(error instanceof LayerError ? `${file.name} : ${error.message}` : error.message, dataError);
    }
  }
  fileInput.value = '';
  showLayers();
  clearPreview();
  offerGeocoding();
}

// Files of addresses waiting for the user to accept, or not, that they be geocoded: one offer at a time.
const geocodingQueue = [];

/** Offers to geocode the next file of addresses, saying what is sent, and where, before anything is. */
function offerGeocoding() {
  const next = geocodingQueue[0];
  if (!next || !geocodingPanel.hidden) return;
  const [, ...rows] = parseCsv(next.text);
  const count = rows.filter((row) => row.some((value) => value.trim() !== '')).length;
  const addresses = `${count.toLocaleString('fr-FR')} adresse${count > 1 ? 's' : ''}`;

  const title = document.createElement('p');
  title.className = 'geocoding-title';
  title.textContent = `${next.fileName} contient ${addresses}, mais pas de coordonnées.`;
  const explanation = document.createElement('p');
  explanation.className = 'note';
  explanation.textContent =
    `Pour les placer sur la carte, elles seront envoyées au service de géocodage de l'IGN, qui les cherche dans ` +
    `la Base Adresse Nationale, à ${municipality.boundary.name}. Seules les adresses partent : le reste du fichier ` +
    'ne quitte pas votre ordinateur.';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'primary';
  accept.textContent = `Géocoder ${count > 1 ? 'les ' : "l'"}${addresses}`;
  const decline = document.createElement('button');
  decline.type = 'button';
  decline.textContent = 'Ne pas géocoder';
  const actions = document.createElement('p');
  actions.className = 'geocoding-actions';
  actions.append(accept, decline);
  const progress = document.createElement('p');
  progress.className = 'note';
  progress.hidden = true;

  geocodingPanel.replaceChildren(title, explanation, actions, progress);
  geocodingPanel.hidden = false;

  const close = () => {
    geocodingQueue.shift();
    geocodingPanel.hidden = true;
    geocodingPanel.replaceChildren();
    offerGeocoding();
  };
  decline.addEventListener('click', close);
  accept.addEventListener('click', async () => {
    actions.hidden = true;
    progress.hidden = false;
    progress.replaceChildren(spinner(), ` Géocodage de ${addresses}…`);
    try {
      const result = await geocodeCsv(next.text, {
        inseeCode: municipality.boundary.inseeCode,
        municipalityName: municipality.boundary.name,
        onProgress: ({ done, total }) =>
          progress.replaceChildren(spinner(), ` Géocodage : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} adresses…`),
      });
      addGeocodedLayer(next.fileName, result);
      close();
    } catch (error) {
      actions.hidden = false;
      progress.hidden = true;
      showError(`${next.fileName} : géocodage impossible (${error.message}). Réessayez plus tard.`, dataError);
    }
  });
}

function spinner() {
  const element = document.createElement('span');
  element.className = 'spinner';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/**
 * Adds a geocoded file as a layer, with its report. Only the addresses found are drawn at first: those to check
 * are drawn on demand, and those not found never are. A file with none to draw is still reported, and can be saved.
 */
function addGeocodedLayer(fileName, result) {
  const geocoding = { ...result, fileName, unverified: false };
  try {
    const layer = readLayer(result.csv, { fileName, index: layers.length });
    layers.push({ ...layer, defaultName: layer.name, geocoding });
  } catch (error) {
    if (!(error instanceof LayerError)) throw error;
    // Nothing found for sure: the addresses to check may still be drawn, if there are some.
    if (result.summary.check > 0) {
      const layer = readLayer(result.csv, { fileName, index: layers.length, unverified: true });
      layers.push({ ...layer, defaultName: layer.name, geocoding: { ...geocoding, unverified: true } });
    } else {
      showError(
        `${fileName} : aucune des ${result.summary.total} adresses n'a pu être placée. Vérifiez qu'elles sont bien ` +
          `à ${municipality.boundary.name}, et que la colonne d'adresse est la bonne.`,
        dataError,
      );
      return;
    }
  }
  showLayers();
  clearPreview();
}

/** Draws the addresses to check of a geocoded layer, or stops drawing them: the file is read again. */
function drawUnverified(index, unverified) {
  const layer = layers[index];
  const { geocoding } = layer;
  const read = readLayer(geocoding.csv, {
    fileName: geocoding.fileName,
    name: layer.name,
    color: layer.color,
    index,
    categoryProperty: layer.categoryProperty,
    colorProperty: layer.colorProperty,
    unverified,
  });
  layers[index] = { ...read, defaultName: layer.defaultName, geocoding: { ...geocoding, unverified } };
  showLayers();
  clearPreview();
}

/** The report of a geocoded layer: its counts, the addresses to look at, and what can be done with them. */
function geocodingReport(layer, index) {
  const { summary, rows, unverified, csv, fileName } = layer.geocoding;
  const report = document.createElement('div');
  report.className = 'geocoding-report';

  const counts = document.createElement('p');
  counts.className = 'geocoding-summary';
  const count = (value, label) => {
    const part = document.createElement('span');
    part.className = `geocoding-count ${label.key}`;
    part.textContent = `${value.toLocaleString('fr-FR')} ${label.text}`;
    return part;
  };
  counts.append(
    'Géocodage : ',
    count(summary.found, { key: 'found', text: summary.found > 1 ? 'trouvées' : 'trouvée' }),
    count(summary.check, { key: 'check', text: 'à vérifier' }),
    count(summary.missing, { key: 'missing', text: summary.missing > 1 ? 'introuvables' : 'introuvable' }),
  );
  report.append(counts);

  const doubtful = rows.filter((row) => row.status !== GEOCODING_STATUS.found);
  if (doubtful.length > 0) {
    const details = document.createElement('details');
    const summaryLine = document.createElement('summary');
    summaryLine.textContent = `Voir les ${doubtful.length} adresse${doubtful.length > 1 ? 's' : ''} à vérifier ou introuvable${doubtful.length > 1 ? 's' : ''}`;
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const title of ['Ligne', 'Adresse du fichier', 'Trouvée par le service', 'Score']) {
      const cell = document.createElement('th');
      cell.textContent = title;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const row of doubtful) {
      const line = body.insertRow();
      line.className = row.status === GEOCODING_STATUS.check ? 'check' : 'missing';
      line.insertCell().textContent = row.line;
      line.insertCell().textContent = row.address || '(vide)';
      line.insertCell().textContent = row.found ?? '—';
      line.insertCell().textContent = row.score === undefined ? '—' : row.score.toFixed(2).replace('.', ',');
    }
    const advice = document.createElement('p');
    advice.className = 'note';
    advice.textContent =
      'Corrigez ces adresses dans votre tableur, puis déposez de nouveau le fichier : le numéro de ligne est ' +
      'celui du fichier.';
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    wrapper.append(table);
    details.append(summaryLine, wrapper, advice);
    report.append(details);
  }

  const actions = document.createElement('p');
  actions.className = 'geocoding-actions';
  if (summary.check > 0) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = unverified;
    box.addEventListener('change', () => drawUnverified(index, box.checked));
    label.append(box, ` Dessiner aussi ${summary.check > 1 ? `les ${summary.check} adresses` : "l'adresse"} à vérifier`);
    actions.append(label);
  }
  const save = document.createElement('a');
  save.className = 'button';
  save.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  save.download = `${fileName.replace(/\.[^.]+$/, '').replace(/[-_]geocode$/i, '')}-geocode.csv`;
  save.textContent = 'Enregistrer le fichier géocodé';
  save.title = 'Pour ne pas géocoder de nouveau : le même fichier, avec les coordonnées de chaque adresse';
  actions.append(save);
  report.append(actions);
  return report;
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

  if (layer.geocoding) item.append(geocodingReport(layer, index));

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
        showMapLayers();
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
    const names = layers.map((chosen) => layerOf(chosen).name);
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
  const sources = [BASEMAPS[basemapChoice.value], ...chosenMapLayers().map(layerOf)];
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
    (map.updateDatesMissing ? '. Date de mise à jour des données indisponible : réessayez plus tard.' : '.') +
    (map.warnings ?? []).map((warning) => ` ${warning}`).join('');

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
  for (const line of [errorLine, searchError, dataError, previewError, customLayerError]) hideError(line);
}

function hideError(line) {
  line.textContent = '';
  line.hidden = true;
}

function debounce(action, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => action(...args), delay);
  };
}
