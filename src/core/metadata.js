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

/**
 * Returns the data sources with their update date, when their metadata record can be read. A source whose date
 * is unavailable (network, catalog error) is returned as is, so that the map can still be generated.
 */
export function withUpdateDates(sources) {
  return Promise.all(
    sources.map(async (source) => {
      // A source without a record in the catalog carries its own date, if it has one.
      if (!source.metadataId) return source;
      try {
        const updateDate = await fetchUpdateDate(source.metadataId);
        return updateDate ? { ...source, updateDate } : source;
      } catch {
        return source;
      }
    }),
  );
}
