// Update dates of the IGN datasets, read from their metadata record in the Géoplateforme catalog (CSW service).
// The open licence of IGN data requires to credit the source and the date of the most recent update of the data.

import { HttpError, request } from './http.js';

const CATALOG_URL = 'https://data.geopf.fr/csw';

/**
 * Date of the most recent update of a dataset, as YYYY-MM-DD, read from the citation of the dataset in its
 * metadata record: its revision date, else its most recent date. Undefined when the record has no date.
 */
export async function fetchUpdateDate(metadataId) {
  const url = new URL(CATALOG_URL);
  url.search = new URLSearchParams({
    SERVICE: 'CSW',
    VERSION: '2.0.2',
    REQUEST: 'GetRecordById',
    ID: metadataId,
    OUTPUTSCHEMA: 'http://www.isotc211.org/2005/gmd',
    ELEMENTSETNAME: 'full',
  });
  const response = await request(url);
  if (!response.ok) throw new HttpError(url, response.status);
  return updateDateFromRecord(await response.text());
}

/** Update date read from an ISO 19139 metadata record (see fetchUpdateDate). */
export function updateDateFromRecord(xml) {
  // Comments of IGN records mention tags such as <gmd:citation>: remove them before looking for the tags.
  const record = xml.replace(/<!--[\s\S]*?-->/g, '');
  const citation = record.match(/<gmd:identificationInfo[\s>][\s\S]*?<gmd:citation>([\s\S]*?)<\/gmd:citation>/);
  if (!citation) return undefined;

  const dates = [...citation[1].matchAll(/<gmd:CI_Date>([\s\S]*?)<\/gmd:CI_Date>/g)].map(([, ciDate]) => ({
    date: ciDate.match(/<gco:Date(?:Time)?>(\d{4}-\d{2}-\d{2})/)?.[1],
    type: ciDate.match(/codeListValue="(\w+)"/)?.[1],
  }));
  const latest = (list) => list.map(({ date }) => date).filter(Boolean).sort().at(-1);
  return latest(dates.filter(({ type }) => type === 'revision')) ?? latest(dates);
}

// The catalog is slow — 5 to 22 s for two records on 24 September 2026 — and its dates change once a day at most:
// a date read is kept an hour, for the preview and the maps that follow it.
const KEPT_MS = 60 * 60 * 1000;
const readDates = new Map();

function updateDateOf(metadataId, now = Date.now()) {
  const kept = readDates.get(metadataId);
  if (kept && now - kept.at < KEPT_MS) return kept.date;
  const date = fetchUpdateDate(metadataId);
  readDates.set(metadataId, { date, at: now });
  // A failed read is not kept: the next map asks again.
  date.catch(() => readDates.delete(metadataId));
  return date;
}

/**
 * Returns the data sources with their update date, when their metadata record can be read. A source whose date
 * is unavailable (network, catalog error) is returned as is, so that the map can still be generated. The dates
 * are only written at the very end of a map: start this early, and wait for it last.
 * `onProgress({ done, total, missing })` counts the dates read from the catalog, and those it did not give.
 */
export function withUpdateDates(sources, { onProgress = () => {} } = {}) {
  const total = sources.filter(({ metadataId }) => metadataId).length;
  let done = 0;
  let missing = 0;
  onProgress({ done, total, missing });
  return Promise.all(
    sources.map(async (source) => {
      // A source without a record in the catalog carries its own date, if it has one.
      if (!source.metadataId) return source;
      let updateDate;
      try {
        updateDate = await updateDateOf(source.metadataId);
      } catch {
        // Counted as missing below: the map is generated without this date, and says so.
      }
      done++;
      if (!updateDate) missing++;
      onProgress({ done, total, missing });
      return updateDate ? { ...source, updateDate } : source;
    }),
  );
}

/** Forgets the dates read, for the tests. */
export function forgetUpdateDates() {
  readDates.clear();
}
