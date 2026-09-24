import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAP_LAYERS } from '../src/core/maplayers.js';
import { attributionText } from '../src/core/overlays.js';
import { extentFromBbox } from '../src/core/tiles.js';
import {
  UrbanismError,
  extentBbox,
  readUrbanPlan,
  urbanPlanDrawing,
  urbanPlanShapes,
  urbanPlanSource,
  zoneCategory,
} from '../src/core/urbanism.js';

const PLU = MAP_LAYERS.plu;
const BBOX = [0.42, 46.77, 0.445, 46.79];

/** A square polygon of `side` degrees whose south-west corner is at [lon, lat]. */
function square(lon, lat, side) {
  return [
    [
      [lon, lat],
      [lon + side, lat],
      [lon + side, lat + side],
      [lon, lat + side],
      [lon, lat],
    ],
  ];
}

/** A WFS answering by the feature type asked for, and keeping what it was asked. */
function wfs(answers) {
  const asked = [];
  const fetchJson = async (url) => {
    const parameters = new URL(url).searchParams;
    asked.push(Object.fromEntries(parameters));
    const answer = answers[parameters.get('TYPENAMES')];
    return typeof answer === 'function' ? answer(parameters) : answer;
  };
  return { asked, fetchJson };
}

describe('zoneCategory', () => {
  it('sorts the types of zones into the five kinds of the national standard, sectors included', () => {
    assert.deepEqual(
      ['U', 'AUc', 'AUs', 'A', 'N', 'Ah', 'Nh', 'AU', 'au', ' n '].map(zoneCategory),
      ['U', 'AUc', 'AUs', 'A', 'N', 'A', 'N', 'AUc', 'AUc', 'N'],
    );
    assert.equal(zoneCategory(''), undefined);
    assert.equal(zoneCategory(null), undefined);
    assert.equal(zoneCategory('ZZ'), undefined);
  });
});

describe('readUrbanPlan', () => {
  it('finds the document of the municipality, then its zones within the bounds, latitude first', async () => {
    const { asked, fetchJson } = wfs({
      'wfs_du:doc_urba_com': { features: [{ properties: { partition: 'DU_86081' } }] },
      'wfs_du:doc_urba': { features: [{ properties: { typedoc: 'PLU', datappro: '20200123' } }] },
      'wfs_du:zone_urba': {
        features: [
          { properties: { typezone: 'U', libelle: 'Ub', libelong: 'Zone urbaine' }, geometry: { type: 'Polygon', coordinates: square(0.43, 46.78, 0.001) } },
          // A zone without a type the standard knows, or without a shape, draws nothing.
          { properties: { typezone: '', libelle: '?' }, geometry: { type: 'Polygon', coordinates: square(0.43, 46.78, 0.001) } },
          { properties: { typezone: 'N', libelle: 'N' }, geometry: null },
        ],
      },
    });

    const plan = await readUrbanPlan('86081', BBOX, { fetchJson });

    assert.equal(asked[0].CQL_FILTER, "insee='86081'");
    assert.equal(asked[1].CQL_FILTER, "partition='DU_86081'");
    assert.equal(asked[2].CQL_FILTER, "partition='DU_86081' AND BBOX(the_geom,46.77,0.42,46.79,0.445)");
    assert.deepEqual(plan.documents, [{ partition: 'DU_86081', kind: 'PLU', approvedOn: '2020-01-23' }]);
    assert.deepEqual(
      plan.zones.map(({ category, label, name }) => [category, label, name]),
      [['U', 'Ub', 'Zone urbaine']],
    );
  });

  it('leaves out a plan of safeguard, and reads the sectors of a carte communale by their short name', async () => {
    const { asked, fetchJson } = wfs({
      'wfs_du:doc_urba_com': {
        features: [{ properties: { partition: 'PSMV_86130' } }, { properties: { partition: 'DU_86130' } }],
      },
      'wfs_du:doc_urba': { features: [{ properties: { typedoc: 'CC', datappro: '20100120' } }] },
      'wfs_du:secteur_cc': {
        features: [
          { properties: { typesect: '01', libelle: 'U : Zone constructible urbaine' }, geometry: { type: 'MultiPolygon', coordinates: [square(0.43, 46.78, 0.001)] } },
          { properties: { typesect: '99', libelle: 'RNU' }, geometry: { type: 'Polygon', coordinates: square(0.43, 46.78, 0.001) } },
        ],
      },
    });

    const plan = await readUrbanPlan('86130', BBOX, { fetchJson });

    assert.ok(!asked.some(({ CQL_FILTER }) => CQL_FILTER?.includes('PSMV')));
    assert.deepEqual(plan.documents.map(({ kind }) => kind), ['CC']);
    assert.deepEqual(
      plan.zones.map(({ category, label, name }) => [category, label, name]),
      [['CC-constructible', 'U', 'Zone constructible urbaine']],
    );
  });

  it('reads a document of many zones page after page', async () => {
    let pages = 0;
    const zone = { properties: { typezone: 'A', libelle: 'A' }, geometry: { type: 'Polygon', coordinates: square(0.43, 46.78, 0.001) } };
    const { fetchJson } = wfs({
      'wfs_du:doc_urba_com': { features: [{ properties: { partition: 'DU_200069854_A' } }] },
      'wfs_du:doc_urba': { features: [{ properties: { typedoc: 'PLUi', datappro: '20260227' } }] },
      'wfs_du:zone_urba': (parameters) => {
        pages++;
        const count = Number(parameters.get('STARTINDEX')) === 0 ? Number(parameters.get('COUNT')) : 3;
        return { features: Array.from({ length: count }, () => zone) };
      },
    });

    const plan = await readUrbanPlan('86194', BBOX, { fetchJson });
    assert.equal(pages, 2);
    assert.equal(plan.zones.length, 5003);
    assert.equal(plan.documents[0].kind, 'PLUI');
  });

  it('finds no document for a municipality under the national rules', async () => {
    const { fetchJson } = wfs({ 'wfs_du:doc_urba_com': { features: [] } });
    assert.deepEqual(await readUrbanPlan('86999', BBOX, { fetchJson }), { documents: [], zones: [] });
  });

  it('says in plain words that the service does not answer, after trying again', async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return new Response('', { status: 503 });
    });
    t.mock.method(globalThis, 'setTimeout', (callback) => callback());
    await assert.rejects(readUrbanPlan('86081', BBOX), (error) => {
      assert.ok(error instanceof UrbanismError);
      assert.match(error.message, /^Le Géoportail de l’urbanisme ne répond pas \(HTTP 503/);
      return true;
    });
    assert.equal(calls, 3);
  });
});

describe('urbanPlanSource', () => {
  it('names the documents of the municipality, dated by the day they were approved', () => {
    const source = urbanPlanSource(PLU, [{ kind: 'PLU', approvedOn: '2020-01-23' }], 'Colombiers');
    assert.deepEqual(source, {
      id: 'plu',
      attribution: 'Géoportail de l’urbanisme, PLU de Colombiers',
      approvedOn: '2020-01-23',
    });
    assert.match(
      attributionText({ sources: [source], date: new Date('2026-09-24') }),
      /^Sources : Géoportail de l’urbanisme, PLU de Colombiers \(approbation du 23\/01\/2020\)/,
    );
    assert.equal(
      urbanPlanSource(PLU, [{ kind: 'PLUI', approvedOn: '2026-02-27' }], 'Poitiers').attribution,
      'Géoportail de l’urbanisme, PLU intercommunal de Poitiers',
    );
    assert.equal(urbanPlanSource(PLU, [], 'Colombiers'), undefined);
  });
});

describe('urbanPlanShapes', () => {
  const extent = extentFromBbox(BBOX, 15, 0);
  const options = { styles: PLU.styles, opacity: PLU.opacity, fontSize: 20 };

  it('fills each zone with the color of its kind, outlined, holes left empty', () => {
    const zones = [{ category: 'N', label: 'Np', polygons: [square(0.425, 46.775, 0.01)] }];
    const { paths, categories } = urbanPlanShapes(zones, extent, options);
    assert.equal(paths.length, 1);
    assert.equal(paths[0].fill, PLU.styles.N.fill);
    assert.equal(paths[0].fillOpacity, PLU.opacity);
    assert.equal(paths[0].fillRule, 'evenodd');
    assert.ok(paths[0].strokeWidth >= 1);
    assert.deepEqual([...categories], ['N']);
  });

  it('writes the label where the zone is widest, and leaves out a label that would not fit or would overlap', () => {
    const zones = [
      { category: 'U', label: 'Ub', polygons: [square(0.425, 46.775, 0.01)] },
      // The same place again: its label would cover the first one.
      { category: 'U', label: 'Ua', polygons: [square(0.425, 46.775, 0.01)] },
      // Far too small for its label.
      { category: 'A', label: 'Ap', polygons: [square(0.44, 46.785, 0.00005)] },
    ];
    const { labels } = urbanPlanShapes(zones, extent, options);
    assert.deepEqual(labels.map(({ text }) => text), ['Ub']);

    // The middle of the square is where it is widest.
    const [x0, y0] = pixelOf(0.425, 46.785);
    const [x1, y1] = pixelOf(0.435, 46.775);
    assert.ok(Math.abs(labels[0].x - (x0 + x1) / 2) < (x1 - x0) / 10, `${labels[0].x}`);
    assert.ok(Math.abs(labels[0].y - options.fontSize * 0.35 - (y0 + y1) / 2) < (y1 - y0) / 10, `${labels[0].y}`);
  });

  it('leaves out what falls outside the map', () => {
    const zones = [{ category: 'A', label: 'A', polygons: [square(1.5, 47.5, 0.01)] }];
    const { paths, labels, categories } = urbanPlanShapes(zones, extent, options);
    assert.deepEqual([paths, labels, [...categories]], [[], [], []]);
  });

  function pixelOf(lon, lat) {
    const worldSize = 256 * 2 ** extent.zoom;
    const x = ((lon + 180) / 360) * worldSize - extent.xMin;
    const y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * worldSize - extent.yMin;
    return [x, y];
  }
});

describe('urbanPlanDrawing', () => {
  const extent = extentFromBbox(BBOX, 15, 0);

  it('gives the legend of the kinds of zones shown only, in the order of the catalog', () => {
    const plan = {
      documents: [{ kind: 'PLU', approvedOn: '2020-01-23' }],
      zones: [
        { category: 'N', label: 'N', polygons: [square(0.425, 46.775, 0.005)] },
        { category: 'U', label: 'U', polygons: [square(0.435, 46.78, 0.005)] },
      ],
    };
    const drawing = urbanPlanDrawing(PLU, plan, extent, 'Colombiers');
    assert.deepEqual(drawing.legend.map(({ label }) => label), [PLU.styles.U.label, PLU.styles.N.label]);
    assert.equal(drawing.warning, undefined);
    assert.equal(drawing.source.approvedOn, '2020-01-23');
  });

  it('warns, with no source to credit, for a municipality without a document', () => {
    const drawing = urbanPlanDrawing(PLU, { documents: [], zones: [] }, extent, 'Colombiers');
    assert.match(drawing.warning, /règlement national d’urbanisme/);
    assert.equal(drawing.source, undefined);
    assert.deepEqual(drawing.legend, []);
  });
});

describe('extentBbox', () => {
  it('gives back the bounds of the extent, the ones the map was built from', () => {
    const [lonMin, latMin, lonMax, latMax] = extentBbox(extentFromBbox(BBOX, 16, 0));
    // An extent is rounded out to whole pixels: its bounds hold the bbox, by less than a pixel.
    const pixel = 360 / (256 * 2 ** 16);
    assert.ok(lonMin <= BBOX[0] && BBOX[0] - lonMin < pixel);
    assert.ok(lonMax >= BBOX[2] && lonMax - BBOX[2] < pixel);
    assert.ok(latMin <= BBOX[1] && BBOX[1] - latMin < pixel);
    assert.ok(latMax >= BBOX[3] && latMax - BBOX[3] < pixel);
  });
});

describe('the zoning in the catalog', () => {
  it('has a style and a legend line for every kind of zone and of sector', () => {
    for (const category of ['U', 'AUc', 'AUs', 'A', 'N', 'CC-constructible', 'CC-activites', 'CC-non-constructible']) {
      assert.ok(PLU.styles[category]?.fill, category);
      assert.ok(PLU.styles[category]?.label, category);
    }
  });
});
