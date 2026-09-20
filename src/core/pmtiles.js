// Reading of a PMTiles archive: a single file holding every tile of a dataset, with a table of contents that
// says where each tile sits. Only the few kilobytes needed are downloaded, through byte range requests, which
// avoids pulling a file of more than a hundred megabytes to draw one municipality.

import { gunzip } from './http.js';

const HEADER_LENGTH = 127;
const MAGIC = 'PMTiles';
const GZIP = 2;
const MVT = 1;

export class PmtilesError extends Error {}

/**
 * Opens an archive: reads its header and its root directory, then answers for each tile. The directories
 * already read are kept, a map asking for neighbouring tiles that share them.
 * `fetchRange(url, start, length)` is left to the platform, which knows how it fetches.
 */
export async function openArchive(url, fetchRange) {
  const header = readHeader(await fetchRange(url, 0, HEADER_LENGTH));
  const root = await readDirectory(url, fetchRange, header, header.rootOffset, header.rootLength);
  const leaves = new Map();

  return {
    header,
    /** Bytes of a tile, decompressed, or undefined when the archive holds nothing there. */
    async tile(z, x, y) {
      if (z < header.minZoom || z > header.maxZoom) return undefined;
      const id = tileId(z, x, y);
      let entry = find(root, id);
      if (entry?.runLength === 0) {
        const key = `${entry.offset}/${entry.length}`;
        if (!leaves.has(key)) {
          leaves.set(key, await readDirectory(url, fetchRange, header, header.leavesOffset + entry.offset, entry.length));
        }
        entry = find(leaves.get(key), id);
      }
      if (!entry || entry.runLength === 0) return undefined;
      const bytes = await fetchRange(url, header.tileDataOffset + entry.offset, entry.length);
      return header.tileCompression === GZIP ? gunzip(bytes) : bytes;
    },
  };
}

/** The 127 bytes that open an archive, and tell where everything else is. */
export function readHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const number = (offset) => Number(view.getBigUint64(offset, true));
  const magic = new TextDecoder().decode(bytes.subarray(0, 7));
  if (magic !== MAGIC) throw new PmtilesError(`Ce fichier n’est pas une archive PMTiles (en-tête « ${magic} »).`);
  if (bytes[7] !== 3) throw new PmtilesError(`Archive PMTiles en version ${bytes[7]}, seule la version 3 est lue.`);

  const header = {
    rootOffset: number(8),
    rootLength: number(16),
    metadataOffset: number(24),
    metadataLength: number(32),
    leavesOffset: number(40),
    leavesLength: number(48),
    tileDataOffset: number(56),
    internalCompression: bytes[97],
    tileCompression: bytes[98],
    tileType: bytes[99],
    minZoom: bytes[100],
    maxZoom: bytes[101],
  };
  if (header.tileType !== MVT) {
    throw new PmtilesError(`Archive PMTiles de type ${header.tileType} : seules les tuiles vectorielles sont lues.`);
  }
  return header;
}

/** Entries of a directory: their tile identifier, then their run length, length and offset, each as varints. */
export function readDirectoryBytes(bytes) {
  const numbers = (count, from) => {
    const values = [];
    let offset = from;
    for (let index = 0; index < count; index++) {
      let value = 0;
      let shift = 0;
      let byte;
      do {
        byte = bytes[offset++];
        value += (byte & 0x7f) * 2 ** shift;
        shift += 7;
      } while (byte & 0x80);
      values.push(value);
    }
    return { values, offset };
  };

  const first = numbers(1, 0);
  const count = first.values[0];
  const entries = Array.from({ length: count }, () => ({}));

  let read = numbers(count, first.offset);
  let previous = 0;
  read.values.forEach((delta, index) => (entries[index].tileId = previous += delta));
  read = numbers(count, read.offset);
  read.values.forEach((value, index) => (entries[index].runLength = value));
  read = numbers(count, read.offset);
  read.values.forEach((value, index) => (entries[index].length = value));
  read = numbers(count, read.offset);
  read.values.forEach((value, index) => {
    // An offset of zero means the entry follows the previous one, which saves writing it.
    entries[index].offset = value === 0 && index > 0 ? entries[index - 1].offset + entries[index - 1].length : value - 1;
  });
  return entries;
}

async function readDirectory(url, fetchRange, header, offset, length) {
  const bytes = await fetchRange(url, offset, length);
  return readDirectoryBytes(header.internalCompression === GZIP ? await gunzip(bytes) : bytes);
}

/**
 * Identifier of a tile in an archive, which orders them along a Hilbert curve: tiles that are close on the map
 * are close in the file, so that neighbouring tiles come in the same directory and often the same request.
 */
export function tileId(z, x, y) {
  let identifier = 0;
  for (let level = 0; level < z; level++) identifier += 4 ** level;

  let size = 1 << z;
  let tileX = x;
  let tileY = y;
  for (let side = size >> 1; side > 0; side >>= 1) {
    const right = (tileX & side) > 0 ? 1 : 0;
    const bottom = (tileY & side) > 0 ? 1 : 0;
    identifier += side * side * ((3 * right) ^ bottom);
    if (bottom === 0) {
      if (right === 1) {
        tileX = side - 1 - tileX;
        tileY = side - 1 - tileY;
      }
      [tileX, tileY] = [tileY, tileX];
    }
  }
  return identifier;
}

/** The entry holding a tile identifier: the last one that starts at or before it, if it reaches that far. */
function find(entries, id) {
  let found;
  for (const entry of entries) {
    if (entry.tileId > id) break;
    found = entry;
  }
  if (!found) return undefined;
  if (found.runLength === 0) return found; // A leaf directory to read in turn.
  return id < found.tileId + found.runLength ? found : undefined;
}
