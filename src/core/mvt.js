// Reading of vector tiles (Mapbox Vector Tile). A tile is a protobuf message; only the fields a map needs are
// read here, which is little enough to avoid a protobuf library: layers, their features, and their geometry.

const GEOMETRY_TYPES = { 1: 'point', 2: 'line', 3: 'polygon' };
const DEFAULT_EXTENT = 4096;

/**
 * Layers of a decoded tile: `{ name, extent, features }`, a feature carrying its properties and its rings in
 * tile coordinates, from 0 to `extent`. Geometries may overflow slightly, tiles being drawn with a margin.
 */
export function readVectorTile(bytes) {
  const layers = [];
  eachField(bytes, (field, bytesOf) => {
    if (field === 3) layers.push(readLayer(bytesOf()));
  });
  return layers;
}

function readLayer(bytes) {
  const layer = { name: '', extent: DEFAULT_EXTENT, features: [] };
  const rawFeatures = [];
  const keys = [];
  const values = [];
  eachField(bytes, (field, bytesOf, numberOf) => {
    if (field === 1) layer.name = text(bytesOf());
    else if (field === 2) rawFeatures.push(bytesOf());
    else if (field === 3) keys.push(text(bytesOf()));
    else if (field === 4) values.push(readValue(bytesOf()));
    else if (field === 5) layer.extent = numberOf();
  });
  layer.features = rawFeatures.map((raw) => readFeature(raw, keys, values));
  return layer;
}

/** A property value, whose type is told by the field it is written in. */
function readValue(bytes) {
  let value;
  eachField(bytes, (field, bytesOf, numberOf) => {
    if (field === 1) value = text(bytesOf());
    else if (field === 4 || field === 5) value = numberOf();
    else if (field === 6) value = zigzag(numberOf());
    else if (field === 7) value = numberOf() !== 0;
    else bytesOf();
  });
  return value;
}

function readFeature(bytes, keys, values) {
  let tags = [];
  let geometry = [];
  let type = 0;
  eachField(bytes, (field, bytesOf, numberOf) => {
    if (field === 2) tags = packedNumbers(bytesOf());
    else if (field === 3) type = numberOf();
    else if (field === 4) geometry = packedNumbers(bytesOf());
    else if (field === 1) numberOf();
    else bytesOf();
  });

  const properties = {};
  for (let index = 0; index + 1 < tags.length; index += 2) properties[keys[tags[index]]] = values[tags[index + 1]];
  return { shape: GEOMETRY_TYPES[type], properties, rings: readGeometry(geometry) };
}

/**
 * Rings of a geometry, from its drawing commands: move to (1), line to (2) and close path (7), each followed
 * by its points, written as differences from the previous one.
 */
function readGeometry(geometry) {
  const rings = [];
  let ring;
  let x = 0;
  let y = 0;
  let index = 0;
  while (index < geometry.length) {
    const command = geometry[index] & 0x7;
    const count = geometry[index++] >> 3;
    if (command === 1) {
      for (let step = 0; step < count; step++) {
        x += zigzag(geometry[index++]);
        y += zigzag(geometry[index++]);
        ring = [[x, y]];
        rings.push(ring);
      }
    } else if (command === 2 && ring) {
      for (let step = 0; step < count; step++) {
        x += zigzag(geometry[index++]);
        y += zigzag(geometry[index++]);
        ring.push([x, y]);
      }
    } else if (command === 7 && ring) {
      ring.push([...ring[0]]);
    } else break; // Unknown command: the rest of the geometry cannot be trusted.
  }
  return rings;
}

/** Walks the fields of a protobuf message, giving the reader what it needs to take the value, or skip it. */
function eachField(bytes, onField) {
  let offset = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      byte = bytes[offset++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  };

  while (offset < bytes.length) {
    const tag = varint();
    const field = tag >> 3;
    switch (tag & 0x7) {
      case 0: {
        const value = varint();
        onField(field, () => new Uint8Array(0), () => value);
        break;
      }
      case 2: {
        const length = varint();
        const start = offset;
        offset += length;
        onField(field, () => bytes.subarray(start, start + length), () => 0);
        break;
      }
      case 5:
        offset += 4;
        break;
      case 1:
        offset += 8;
        break;
      default:
        return; // Unknown wire type: nothing readable follows.
    }
  }
}

/** Numbers written one after the other, as varints, in a single field. */
function packedNumbers(bytes) {
  const values = [];
  let offset = 0;
  while (offset < bytes.length) {
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
  return values;
}

// Signed numbers are written with their sign in the lowest bit, so that small negatives stay short.
const zigzag = (value) => (value >>> 1) ^ -(value & 1);

const text = (bytes) => new TextDecoder().decode(bytes);
