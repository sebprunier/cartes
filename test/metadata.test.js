import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { fetchUpdateDate, forgetUpdateDates, updateDateFromRecord, withUpdateDates } from '../src/core/metadata.js';

function citationDate(date, type) {
  return `<gmd:date><gmd:CI_Date><gmd:date><gco:Date>${date}</gco:Date></gmd:date><gmd:dateType>
    <gmd:CI_DateTypeCode codeList="http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#CI_DateTypeCode"
      codeListValue="${type}" /></gmd:dateType></gmd:CI_Date></gmd:date>`;
}

// Excerpt of an IGN metadata record: its comments mention tags, and other citations follow the dataset one.
function record(datasetDates) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd">
      <gmd:identificationInfo xmlns:gml="http://www.opengis.net/gml"><gmd:MD_DataIdentification>
        <!-- Partie citation : une étendue temporelle doit être indiquée en dehors du bloc <gmd:citation> -->
        <gmd:citation><gmd:CI_Citation><gmd:title><gco:CharacterString>Plan IGN</gco:CharacterString></gmd:title>
          ${datasetDates.join('')}
        </gmd:CI_Citation></gmd:citation>
        <gmd:descriptiveKeywords><gmd:thesaurusName><gmd:CI_Citation>${citationDate('2027-01-01', 'revision')}
        </gmd:CI_Citation></gmd:thesaurusName></gmd:descriptiveKeywords>
      </gmd:MD_DataIdentification></gmd:identificationInfo>
    </gmd:MD_Metadata>`;
}

describe('updateDateFromRecord', () => {
  it('reads the revision date of the dataset citation', () => {
    const xml = record([citationDate('2024-12-01', 'publication'), citationDate('2026-08-05', 'revision')]);
    assert.equal(updateDateFromRecord(xml), '2026-08-05');
  });

  it('uses the most recent date when the citation has no revision date', () => {
    const xml = record([citationDate('2025-05-15', 'publication'), citationDate('2023-09-27', 'creation')]);
    assert.equal(updateDateFromRecord(xml), '2025-05-15');
  });

  it('returns undefined when the record has no dataset citation', () => {
    assert.equal(updateDateFromRecord('<gmd:MD_Metadata></gmd:MD_Metadata>'), undefined);
  });
});

describe('fetchUpdateDate', () => {
  it('reads the record of the dataset from the Géoplateforme catalog', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(record([citationDate('2026-09-11', 'revision')])));
    assert.equal(await fetchUpdateDate('IGNF_BD-ORTHO'), '2026-09-11');
    const url = new URL(fetch.mock.calls[0].arguments[0]);
    assert.equal(url.origin + url.pathname, 'https://data.geopf.fr/csw');
    assert.equal(url.searchParams.get('REQUEST'), 'GetRecordById');
    assert.equal(url.searchParams.get('ID'), 'IGNF_BD-ORTHO');
  });
});

describe('withUpdateDates', () => {
  beforeEach(() => forgetUpdateDates());

  it('adds the update date to the sources whose record is available, and keeps the others as they are', async (t) => {
    t.mock.method(globalThis, 'fetch', async (url) =>
      new URL(url).searchParams.get('ID') === 'IGNF_PLAN-IGN'
        ? new Response(record([citationDate('2026-08-05', 'revision')]))
        : new Response('error', { status: 503 }),
    );
    const sources = await withUpdateDates([
      { attribution: '© IGN – Plan IGN', metadataId: 'IGNF_PLAN-IGN' },
      { attribution: '© IGN – ADMIN EXPRESS', metadataId: 'IGNF_ADMIN-EXPRESS' },
    ]);
    assert.deepEqual(sources, [
      { attribution: '© IGN – Plan IGN', metadataId: 'IGNF_PLAN-IGN', updateDate: '2026-08-05' },
      { attribution: '© IGN – ADMIN EXPRESS', metadataId: 'IGNF_ADMIN-EXPRESS' },
    ]);
  });

  it('keeps a date read for the next map, and asks again for one that failed', async (t) => {
    let answer = new Response('error', { status: 503 });
    const fetch = t.mock.method(globalThis, 'fetch', async () => answer);
    const plan = { attribution: '© IGN – Plan IGN', metadataId: 'IGNF_PLAN-IGN' };

    assert.deepEqual(await withUpdateDates([plan]), [plan]);
    answer = new Response(record([citationDate('2026-08-05', 'revision')]));
    assert.equal((await withUpdateDates([plan]))[0].updateDate, '2026-08-05');
    // The preview, then the map, then another map: the catalog was asked twice, once for the failure.
    assert.equal((await withUpdateDates([plan]))[0].updateDate, '2026-08-05');
    assert.equal(fetch.mock.callCount(), 2);
  });
});
