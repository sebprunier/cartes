import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MunicipalityNotFound,
  boundaryBbox,
  fetchBoundary,
  isInseeCode,
  normalizeName,
  resolveMunicipality,
  searchMunicipalities,
} from '../src/municipalities.js';

function geocodingFeature(inseeCode, name, department) {
  return {
    properties: { citycode: inseeCode, name, postcode: `${department}000`, depcode: department, context: department },
  };
}

const COLOMBIERS = [
  geocodingFeature('34081', 'Colombiers', '34'),
  geocodingFeature('86081', 'Colombiers', '86'),
  geocodingFeature('53071', 'Colombiers-du-Plessis', '53'),
];

function mockFetch(t, body) {
  return t.mock.method(globalThis, 'fetch', async () => Response.json(body));
}

describe('isInseeCode', () => {
  it('accepts 5 digit codes and Corsican codes', () => {
    for (const code of ['86081', ' 86081 ', '2A004', '2b033']) assert.ok(isInseeCode(code), code);
  });

  it('rejects anything else', () => {
    for (const input of ['8608', '860811', '2C004', 'Colombiers']) assert.ok(!isInseeCode(input), input);
  });
});

describe('normalizeName', () => {
  it('removes accents, case, hyphens and apostrophes', () => {
    assert.equal(normalizeName('Colombières'), 'colombieres');
    assert.equal(normalizeName("Saint-Julien-l'Ars"), 'saint julien l ars');
    assert.equal(normalizeName('L’Isle-Jourdain'), 'l isle jourdain');
  });
});

describe('searchMunicipalities', () => {
  it('filters the results by department', async (t) => {
    mockFetch(t, { features: COLOMBIERS });
    const municipalities = await searchMunicipalities('Colombiers', '86');
    assert.deepEqual(
      municipalities.map((m) => m.inseeCode),
      ['86081'],
    );
  });
});

describe('resolveMunicipality', () => {
  it('returns an INSEE code as is, without calling the API', async (t) => {
    const fetch = mockFetch(t, { features: [] });
    assert.equal(await resolveMunicipality('2a004'), '2A004');
    assert.equal(fetch.mock.callCount(), 0);
  });

  it('picks the only municipality with exactly that name', async (t) => {
    mockFetch(t, { features: [COLOMBIERS[0], COLOMBIERS[2]] });
    assert.equal(await resolveMunicipality('colombiers'), '34081');
  });

  it('lists the candidates when several municipalities share the name', async (t) => {
    mockFetch(t, { features: COLOMBIERS });
    await assert.rejects(resolveMunicipality('Colombiers'), (error) => {
      assert.ok(error instanceof MunicipalityNotFound);
      assert.match(error.message, /34081/);
      assert.match(error.message, /86081/);
      assert.doesNotMatch(error.message, /53071/);
      return true;
    });
  });

  it('uses the department to resolve namesakes', async (t) => {
    mockFetch(t, { features: COLOMBIERS });
    assert.equal(await resolveMunicipality('Colombiers', '86'), '86081');
  });

  it('fails when nothing matches', async (t) => {
    mockFetch(t, { features: [] });
    await assert.rejects(resolveMunicipality('Nulle-Part'), MunicipalityNotFound);
  });
});

describe('fetchBoundary', () => {
  const ring = [
    [0.4, 46.7],
    [0.5, 46.7],
    [0.5, 46.8],
    [0.4, 46.7],
  ];

  it('returns simple polygons as a list of polygons', async (t) => {
    mockFetch(t, {
      features: [
        {
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { code_insee: '86081', nom_officiel: 'Colombiers' },
        },
      ],
    });
    const boundary = await fetchBoundary('86081');
    assert.deepEqual(boundary, { inseeCode: '86081', name: 'Colombiers', polygons: [[ring]] });
  });

  it('rejects invalid INSEE codes without calling the API', async (t) => {
    const fetch = mockFetch(t, { features: [] });
    await assert.rejects(fetchBoundary("86081' OR '1'='1"), /Code INSEE invalide/);
    assert.equal(fetch.mock.callCount(), 0);
  });

  it('fails when the municipality does not exist', async (t) => {
    mockFetch(t, { features: [] });
    await assert.rejects(fetchBoundary('99999'), MunicipalityNotFound);
  });
});

describe('boundaryBbox', () => {
  it('covers all the polygons', () => {
    const boundary = {
      polygons: [
        [
          [
            [0.4, 46.7],
            [0.5, 46.8],
          ],
        ],
        [
          [
            [0.6, 46.6],
            [0.3, 46.9],
          ],
        ],
      ],
    };
    assert.deepEqual(boundaryBbox(boundary), [0.3, 46.6, 0.6, 46.9]);
  });
});
