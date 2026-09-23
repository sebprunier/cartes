import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GeocodingNeeded,
  LayerError,
  addressColumns,
  applyProperties,
  decodeText,
  LARGE_LAYER_FEATURES,
  layerShapes,
  layerWarning,
  layersShapes,
  legendEntries,
  layersSource,
  legendTitle,
  readLayer,
} from '../src/core/layers.js';
import { extentFromBbox } from '../src/core/tiles.js';

const COLOMBIERS_BBOX = [0.38344088, 46.75332418, 0.48673916, 46.80743244];
const extent = extentFromBbox(COLOMBIERS_BBOX, 14, 0.03);

const geoJson = (features) => JSON.stringify({ type: 'FeatureCollection', features });
const feature = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });
const read = (text, fileName = 'points.geojson') => readLayer(text, { fileName });

describe('readLayer, GeoJSON', () => {
  it('reads points, lines and polygons, and names the layer after the file', () => {
    const layer = read(
      geoJson([
        feature({ type: 'Point', coordinates: [0.43, 46.78] }, { nom: 'Mairie' }),
        feature({ type: 'LineString', coordinates: [[0.4, 46.76], [0.45, 46.79]] }),
        feature({ type: 'Polygon', coordinates: [[[0.4, 46.76], [0.45, 46.76], [0.45, 46.79], [0.4, 46.76]]] }),
      ]),
      'points-de-collecte.geojson',
    );
    assert.equal(layer.name, 'Points de collecte');
    assert.deepEqual(
      layer.features.map((f) => f.shape),
      ['point', 'line', 'polygon'],
    );
    assert.equal(layer.features[0].label, 'Mairie');
  });

  it('splits multiple geometries and reads a bare geometry', () => {
    const multi = read(geoJson([feature({ type: 'MultiPoint', coordinates: [[0.4, 46.76], [0.45, 46.79]] })]));
    assert.equal(multi.features.length, 2);
    const bare = read(JSON.stringify({ type: 'Point', coordinates: [0.43, 46.78] }));
    assert.equal(bare.features[0].shape, 'point');
  });

  it('reads the labels and the styles of uMap and geojson.io', () => {
    const layer = read(
      geoJson([
        feature(
          { type: 'Point', coordinates: [0.43, 46.78] },
          { name: 'Déchèterie', 'marker-color': '#ff0000', 'marker-size': 'large' },
        ),
        feature(
          { type: 'Polygon', coordinates: [[[0.4, 46.76], [0.45, 46.76], [0.45, 46.79], [0.4, 46.76]]] },
          { libelle: 'Zone', fill: '#00ff00', 'fill-opacity': 0.5, 'stroke-width': 8 },
        ),
      ]),
    );
    assert.deepEqual(
      layer.features.map((f) => [f.label, f.style.color ?? f.style.fill]),
      [
        ['Déchèterie', '#ff0000'],
        ['Zone', '#00ff00'],
      ],
    );
    assert.equal(layer.features[0].style.size, 'large');
    assert.equal(layer.features[1].style.fillOpacity, 0.5);
    assert.equal(layer.features[1].style.strokeWidth, 8);
  });

  it('names the layer after the file, or after the name given', () => {
    const point = geoJson([feature({ type: 'Point', coordinates: [0.43, 46.78] })]);
    assert.equal(readLayer(point, { fileName: 'apport-volontaire.geojson' }).name, 'Apport volontaire');
    assert.equal(readLayer(point, { fileName: 'a.geojson', name: "Points d'apport" }).name, "Points d'apport");
    assert.equal(readLayer(point, { fileName: 'a.geojson', name: '  ' }).name, 'A');
  });

  it('gives a color from the palette to each layer', () => {
    const point = geoJson([feature({ type: 'Point', coordinates: [0.43, 46.78] })]);
    const first = readLayer(point, { fileName: 'a.geojson', index: 0 });
    const second = readLayer(point, { fileName: 'b.geojson', index: 1 });
    assert.notEqual(first.color, second.color);
    assert.equal(readLayer(point, { fileName: 'c.geojson', color: '#123456' }).color, '#123456');
  });

  it('explains projected coordinates rather than drawing them anywhere', () => {
    const lambert93 = geoJson([feature({ type: 'Point', coordinates: [504316.74, 6633914.03] })]);
    assert.throws(() => read(lambert93), (error) => {
      assert.ok(error instanceof LayerError);
      assert.match(error.message, /Lambert 93/);
      return true;
    });
  });

  it('rejects unreadable or empty files', () => {
    assert.throws(() => read('{ pas du json'), /illisible/);
    assert.throws(() => read(geoJson([])), /Aucune donnée/);
    assert.throws(() => read(geoJson([feature({ type: 'Sphere', coordinates: [] })])), /non gérée/);
  });
});

describe('readLayer, CSV', () => {
  it('reads the coordinates and the label, whatever the column names', () => {
    const layer = read('nom;latitude;longitude\nMairie;46,78;0,43\nÉcole;46.79;0.44\n', 'collecte.csv');
    assert.equal(layer.name, 'Collecte');
    assert.equal(layer.features.length, 2);
    assert.deepEqual(layer.features[0].position, [0.43, 46.78]);
    assert.deepEqual(
      layer.features.map((f) => f.label),
      ['Mairie', 'École'],
    );
  });

  it('accepts commas as separator and quoted fields', () => {
    const layer = read('name,lat,lon\n"Place du marché, centre",46.78,0.43\n', 'places.csv');
    assert.equal(layer.features[0].label, 'Place du marché, centre');
  });

  it('ignores the rows without usable coordinates', () => {
    const layer = read('nom;lat;lon\nSans;;\nAvec;46.78;0.43\n', 'points.csv');
    assert.equal(layer.features.length, 1);
  });

  it('says which columns are missing', () => {
    assert.throws(() => read('nom;commentaire\nMairie;ouverte le lundi\n', 'points.csv'), /Colonnes de coordonnées/);
  });

  it('recognizes a file of addresses without coordinates, that geocoding can place', () => {
    assert.throws(() => read('nom;adresse\nMairie;1 rue des Écoles\n', 'points.csv'), GeocodingNeeded);
    assert.throws(() => read('nom;numero;voie;commune\nMairie;1;rue des Écoles;Colombiers\n', 'points.csv'), GeocodingNeeded);
  });
});

describe('geocoded CSV', () => {
  const geocoded =
    'nom;adresse;latitude;longitude;geocodage_statut;geocodage_score;geocodage_adresse_trouvee;geocodage_date\n' +
    'Mairie;Place de Manderen;46,772229;0,425837;trouvée;0,95;Place de Manderen 86490 Colombiers;2026-09-23\n' +
    'École;12 route de Châtellerault;46,77;0,43;à vérifier;0,88;Route de Châtellerault 86490 Colombiers;2026-09-23\n' +
    'Stade;Stade;;;introuvable;0,68;Colombiers;2026-09-23\n';

  it('draws the addresses found, and those to check only when asked to', () => {
    assert.deepEqual(read(geocoded, 'lieux.csv').features.map((f) => f.label), ['Mairie']);
    const all = readLayer(geocoded, { fileName: 'lieux.csv', unverified: true });
    assert.deepEqual(all.features.map((f) => f.label), ['Mairie', 'École']);
  });

  it('credits the Base Adresse Nationale, and the day of the geocoding, for the positions', () => {
    const layer = read(geocoded, 'lieux.csv');
    assert.equal(layer.geocodedOn, '2026-09-23');
    assert.equal(
      layersSource([layer, read(geoJson([feature({ type: 'Point', coordinates: [0.43, 46.78] })]), 'autres.geojson')]).attribution,
      'Données ajoutées : Lieux (géocodage : Base Adresse Nationale, 23/09/2026), Autres',
    );
  });
});

describe('addressColumns', () => {
  it('finds a whole address, else its parts in the order they are written', () => {
    assert.deepEqual(addressColumns(['nom', 'adresse', 'type']), [1]);
    assert.deepEqual(addressColumns(['commune', 'nom', 'voie', 'numéro', 'code postal']), [3, 2, 4, 0]);
    assert.equal(addressColumns(['nom', 'type', 'commune']), undefined); // Without a street, no address.
  });
});

describe('decodeText', () => {
  it('reads UTF-8, and the Windows-1252 that many spreadsheets write', () => {
    assert.equal(decodeText(new TextEncoder().encode('Église;Châtellerault')), 'Église;Châtellerault');
    assert.equal(decodeText(new Uint8Array([0xc9, 0x67, 0x6c, 0x69, 0x73, 0x65])), 'Église');
  });
});

describe('categories and colors', () => {
  const points = (categories, key = 'categorie') =>
    geoJson(
      categories.map((category, index) =>
        feature({ type: 'Point', coordinates: [0.43 + index / 1000, 46.78] }, { [key]: category }),
      ),
    );

  it('groups the features by the usual category property, with one color per category', () => {
    const layer = read(points(['Verre', 'Textile', 'Verre']));
    assert.equal(layer.categoryProperty, 'categorie');
    assert.deepEqual(
      layer.categories.map(({ name }) => name),
      ['Verre', 'Textile'],
    );
    const [verre, textile] = layer.categories;
    assert.notEqual(verre.color, textile.color);
    assert.deepEqual(
      layer.features.map((f) => f.color),
      [verre.color, textile.color, verre.color],
    );
  });

  it('uses the property asked for, and says when the file does not have it', () => {
    const layer = readLayer(points(['Verre', 'Textile'], 'dechets'), {
      fileName: 'points.geojson',
      categoryProperty: 'dechets',
    });
    assert.equal(layer.categories.length, 2);
    assert.throws(
      () => readLayer(points(['Verre']), { fileName: 'points.geojson', categoryProperty: 'absente' }),
      /Propriété de catégorie introuvable : absente\. Propriétés disponibles : categorie\./,
    );
  });

  it('takes the color from a property, and keeps the styles written in the file', () => {
    const layer = readLayer(
      geoJson([
        feature({ type: 'Point', coordinates: [0.43, 46.78] }, { categorie: 'Verre', couleur: '#123456' }),
        feature({ type: 'Point', coordinates: [0.44, 46.78] }, { categorie: 'Textile', 'marker-color': '#abcdef' }),
      ]),
      { fileName: 'points.geojson' },
    );
    assert.equal(layer.colorProperty, 'couleur');
    assert.deepEqual(
      layer.features.map((f) => f.color),
      ['#123456', '#abcdef'],
    );
  });

  it('applies another choice of properties to an already read layer', () => {
    const layer = read(points(['Verre', 'Textile']));
    const without = applyProperties({ ...layer, categoryProperty: undefined });
    assert.deepEqual(without.categories, []);
    assert.deepEqual(
      without.features.map((f) => f.color),
      [layer.color, layer.color],
    );
  });
});

describe('legendEntries', () => {
  const points = geoJson([
    feature({ type: 'Point', coordinates: [0.43, 46.78] }),
    feature({ type: 'Point', coordinates: [0.44, 46.79] }),
    feature({ type: 'Polygon', coordinates: [[[0.4, 46.76], [0.45, 46.76], [0.45, 46.79], [0.4, 46.76]]] }),
  ]);

  it('gives one entry per layer, with the shape of most of its features', () => {
    const layer = read(points, 'points-de-collecte.geojson');
    assert.deepEqual(legendEntries([layer], extent), [
      { label: 'Points de collecte', color: layer.color, shape: 'point' },
    ]);
  });

  it('gives one entry per category visible on the map, with its color and its shape', () => {
    const layer = read(
      geoJson([
        feature({ type: 'Point', coordinates: [0.43, 46.78] }, { categorie: 'Verre' }),
        feature({ type: 'Point', coordinates: [2.35, 48.85] }, { categorie: 'Ailleurs' }), // Hors de l'emprise.
        feature(
          { type: 'Polygon', coordinates: [[[0.4, 46.76], [0.45, 46.76], [0.45, 46.79], [0.4, 46.76]]] },
          { categorie: 'Zone' },
        ),
      ]),
    );
    assert.deepEqual(legendEntries([layer], extent), [
      { label: 'Verre', color: layer.categories[0].color, shape: 'point' },
      { label: 'Zone', color: layer.categories[2].color, shape: 'polygon' },
    ]);
  });

  it('leaves out the layers with nothing to show on the map', () => {
    const elsewhere = read(geoJson([feature({ type: 'Point', coordinates: [2.35, 48.85] })]), 'paris.geojson');
    assert.deepEqual(legendEntries([elsewhere], extent), []);
  });
});

describe('layerWarning', () => {
  const layerOf = (count) =>
    read(
      geoJson(
        Array.from({ length: count }, (_, index) =>
          feature({ type: 'Point', coordinates: [0.43 + index / 100000, 46.78] }),
        ),
      ),
      'parcelles.geojson',
    );

  it('stays quiet for a file of ordinary size', () => {
    assert.equal(layerWarning(layerOf(LARGE_LAYER_FEATURES - 1)), undefined);
  });

  it('warns about a heavy file, with its number of features', () => {
    const warning = layerWarning(layerOf(LARGE_LAYER_FEATURES));
    assert.match(warning, /objets/);
    assert.match(warning, /étiquettes/);
  });
});

describe('legendTitle', () => {
  const withCategories = geoJson([feature({ type: 'Point', coordinates: [0.43, 46.78] }, { categorie: 'Verre' })]);

  it('titles the legend with the file name when a single file carries categories', () => {
    assert.equal(legendTitle([read(withCategories, 'points-de-collecte.geojson')]), 'Points de collecte');
  });

  it('falls back to a plain title without categories, or with several files', () => {
    const plain = read(geoJson([feature({ type: 'Point', coordinates: [0.43, 46.78] })]), 'collecte.geojson');
    assert.equal(legendTitle([plain]), 'Légende');
    assert.equal(legendTitle([read(withCategories, 'a.geojson'), plain]), 'Légende');
    assert.equal(legendTitle([]), 'Légende');
  });
});

describe('label placement', () => {
  const at = (positions) =>
    read(
      geoJson(
        positions.map(([lon, lat], index) =>
          feature({ type: 'Point', coordinates: [lon, lat] }, { nom: `Point de collecte ${index + 1}` }),
        ),
      ),
    );

  it('moves a label to the other side rather than writing it over its neighbour', () => {
    const [{ points }] = layersShapes([at([[0.43, 46.78], [0.4302, 46.78]])], extent);
    assert.equal(points.filter(({ label }) => label).length, 2);
    assert.notEqual(points[0].labelAlign, points[1].labelAlign);
  });

  it('places the labels of every layer in a single pass, in the order of the files', () => {
    const first = at([[0.43, 46.78]]);
    const second = at([[0.4302, 46.78]]);
    const [one, other] = layersShapes([first, second], extent);
    assert.ok(one.points[0].label && other.points[0].label);
    assert.notEqual(one.points[0].labelAlign, other.points[0].labelAlign);
    // Drawn on its own, the first layer keeps the most readable position, to the right of its point.
    const [alone] = layersShapes([first], extent);
    assert.equal(alone.points[0].labelAlign, 'start');
  });

  it('drops the labels that find no free place, and keeps their points', () => {
    const crowded = at([
      [0.43, 46.78],
      [0.43001, 46.78],
      [0.43002, 46.78001],
      [0.43001, 46.78002],
      [0.43, 46.78002],
    ]);
    const [{ points }] = layersShapes([crowded], extent);
    assert.equal(points.length, 5);
    const written = points.filter(({ label }) => label);
    assert.ok(written.length > 0 && written.length < 5);
    assert.ok(written.every(({ labelX, labelY }) => Number.isFinite(labelX) && Number.isFinite(labelY)));
  });
});

describe('layerShapes', () => {
  const layer = read(
    geoJson([
      feature({ type: 'Point', coordinates: [0.43, 46.78] }, { nom: 'Mairie' }),
      feature({ type: 'Point', coordinates: [2.35, 48.85] }), // Paris : hors de la commune.
      feature({ type: 'Polygon', coordinates: [[[0.4, 46.76], [0.45, 46.76], [0.45, 46.79], [0.4, 46.76]]] }),
    ]),
  );

  it('places the points in the image and leaves out what is outside', () => {
    const { points, radius } = layerShapes(layer, extent);
    assert.equal(points.length, 1);
    assert.equal(points[0].label, 'Mairie');
    assert.ok(points[0].x > 0 && points[0].x < extent.width);
    assert.ok(points[0].y > 0 && points[0].y < extent.height);
    assert.equal(points[0].radius, radius);
  });

  it('draws the polygons as closed path data, filled with the color of the layer', () => {
    const { paths } = layerShapes(layer, extent);
    assert.equal(paths.length, 1);
    assert.match(paths[0].path, /^M[\d.,]+L.*Z$/);
    assert.equal(paths[0].fill, layer.color);
    assert.ok(paths[0].fillOpacity > 0 && paths[0].fillOpacity < 1);
  });

  it('scales the symbols with the image, as the outline and the attribution do', () => {
    const small = layerShapes(layer, extentFromBbox(COLOMBIERS_BBOX, 13, 0.03));
    const large = layerShapes(layer, extentFromBbox(COLOMBIERS_BBOX, 17, 0.03));
    assert.ok(large.radius > small.radius);
    assert.ok(large.strokeWidth > small.strokeWidth);
  });
});
