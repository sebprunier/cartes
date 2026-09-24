// Worker of the measurement page: canvases are made here, as the page that generates the maps makes them —
// an OffscreenCanvas in a worker. Nothing is asked of any service: the tiles come from the local server.

const post = (type, data) => postMessage({ type, ...data });

onmessage = async ({ data }) => {
  try {
    if (data.task === 'limites') await limits();
    if (data.task === 'encodage') await encodings();
    if (data.task === 'grandes') await large(data.sizes);
    post('fin', { task: data.task });
  } catch (error) {
    post('erreur', { task: data.task, message: `${error.name} : ${error.message}` });
  }
};

/** The test of the page that generates the maps (canRender), step by step, saying how it failed. */
function probe(width, height) {
  let canvas;
  try {
    canvas = new OffscreenCanvas(width, height);
  } catch (error) {
    return { ok: false, how: `constructeur : ${error.name}` };
  }
  let context;
  try {
    context = canvas.getContext('2d');
  } catch (error) {
    return { ok: false, how: `getContext lève ${error.name}` };
  }
  if (!context) return { ok: false, how: 'getContext renvoie null' };
  try {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#000000';
    context.fillRect(width - 1, height - 1, 1, 1);
    const pixel = context.getImageData(width - 1, height - 1, 1, 1).data;
    const ok = pixel[0] === 0 && pixel[3] === 255;
    return { ok, how: ok ? 'dessiné' : `canevas vide, sans erreur (pixel ${[...pixel].join(',')})` };
  } catch (error) {
    return { ok: false, how: `dessin : ${error.name}` };
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** The largest value for which `test(value)` holds, between `low` (holds) and `high` (fails). */
function largest(low, high, test) {
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (test(middle)) low = middle;
    else high = middle;
  }
  return low;
}

async function limits() {
  let start = performance.now();
  const side = largest(1, 131073, (width) => probe(width, 1).ok);
  post('ligne', { text: `Côté maximal : ${side} px (${Math.round(performance.now() - start)} ms)` });
  post('ligne', { text: `  au-delà, ${side + 1} × 1 : ${probe(side + 1, 1).how}` });

  start = performance.now();
  const square = largest(1, side + 1, (length) => probe(length, length).ok);
  post('ligne', {
    text: `Plus grand carré : ${square} × ${square} = ${(square * square / 1e6).toFixed(1)} millions de pixels (${Math.round(performance.now() - start)} ms)`,
  });
  post('ligne', { text: `  au-delà, ${square + 1} × ${square + 1} : ${probe(square + 1, square + 1).how}` });

  // A map is wider than tall: the largest height at the full width tells whether the limit is an area.
  const height = largest(1, side + 1, (value) => probe(side, value).ok);
  post('ligne', {
    text: `À ${side} px de large, hauteur maximale : ${height} px = ${(side * height / 1e6).toFixed(1)} millions de pixels`,
  });
  post('ligne', { text: `  au-delà, ${side} × ${height + 1} : ${probe(side, height + 1).how}` });

  // The page drew the basemap in grayscale with this filter until Safari was found to ignore it (#5).
  const canvas = new OffscreenCanvas(1, 1);
  const context = canvas.getContext('2d');
  context.filter = 'grayscale(1)';
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  post('ligne', { text: `Filtre « grayscale » du canevas : ${r === g && g === b ? 'appliqué' : `ignoré (rouge dessiné ${r},${g},${b})`}` });
}

/** The maps of Colombiers at zoom 15 and 16, assembled and encoded as the page does, in color and in grayscale. */
async function encodings() {
  const manifest = await (await fetch('carte.json')).json();
  for (const map of manifest.maps) {
    for (const grayscale of [false, true]) {
      const canvas = new OffscreenCanvas(map.width, map.height);
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, map.width, map.height);
      for (const { x, y } of map.tiles) {
        const bytes = await (await fetch(`tuiles/${map.zoom}-${x}-${y}.png`)).arrayBuffer();
        let bitmap = await createImageBitmap(new Blob([bytes]));
        // Turned gray pixel by pixel, as the page that generates the maps does since Safari was found to ignore
        // the filter of its canvas: the coefficients of sharp (Rec. 601).
        if (grayscale) bitmap = await gray(bitmap);
        context.drawImage(bitmap, x * 256 - map.xMin, y * 256 - map.yMin);
        bitmap.close();
      }
      const mode = grayscale ? 'gris' : 'couleur';
      const ratios = manifest.basemapRatios[grayscale ? 'grayscale' : 'color'];
      for (const [format, type, options] of [
        ['png', 'image/png', {}],
        ['jpg', 'image/jpeg', { quality: 0.92 }],
      ]) {
        const start = performance.now();
        const blob = await canvas.convertToBlob({ type, ...options });
        const ratio = blob.size / map.tileBytes;
        const sharp = map.sharp[`${mode}-${format}`];
        post('ligne', {
          text:
            `Zoom ${map.zoom}, ${mode}, ${format.toUpperCase()} : ${(blob.size / 1e6).toFixed(2)} Mo en ` +
            `${Math.round(performance.now() - start)} ms — coefficient ${ratio.toFixed(2)} ` +
            `(catalogue ${ratios[format]}, sharp ${(sharp / map.tileBytes).toFixed(2)})`,
        });
      }
      canvas.width = canvas.height = 0;
    }
  }
}

async function gray(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
    data[index] = data[index + 1] = data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas.transferToImageBitmap();
}

/** Very large images, filled with the map of zoom 16 repeated: encoded, then offered for download. */
async function large(sizes) {
  const manifest = await (await fetch('carte.json')).json();
  const map = manifest.maps.find(({ zoom }) => zoom === 16);
  const pattern = new OffscreenCanvas(map.width, map.height);
  const patternContext = pattern.getContext('2d');
  for (const { x, y } of map.tiles) {
    const bytes = await (await fetch(`tuiles/${map.zoom}-${x}-${y}.png`)).arrayBuffer();
    const bitmap = await createImageBitmap(new Blob([bytes]));
    patternContext.drawImage(bitmap, x * 256 - map.xMin, y * 256 - map.yMin);
    bitmap.close();
  }
  for (const [width, height] of sizes) {
    const label = `${width} × ${height} (${(width * height / 1e6).toFixed(0)} millions de pixels)`;
    post('ligne', { text: `${label} : dessin…` });
    const check = probe(width, height);
    if (!check.ok) {
      post('ligne', { text: `${label} : refusée par le garde-fou — ${check.how}` });
      continue;
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    for (let top = 0; top < height; top += map.height) {
      for (let left = 0; left < width; left += map.width) context.drawImage(pattern, left, top);
    }
    const start = performance.now();
    post('ligne', { text: `${label} : encodage PNG…` });
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    post('ligne', { text: `${label} : ${(blob.size / 1e6).toFixed(0)} Mo en ${((performance.now() - start) / 1000).toFixed(1)} s` });
    post('fichier', { blob, name: `mesure-${width}x${height}.png` });
    canvas.width = canvas.height = 0;
  }
}
