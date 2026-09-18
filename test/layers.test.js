import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LayerError, layerShapes, readLayer } from '../src/core/layers.js';
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
    assert.equal(layer.name, 'points-de-collecte');
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
    assert.equal(layer.name, 'collecte');
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
    assert.throws(() => read('nom;adresse\nMairie;1 rue des Écoles\n', 'points.csv'), /Colonnes de coordonnées/);
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
