// The opening: the boundary of Colombiers is drawn, its tiles of the Plan IGN arrive one by one and make its map,
// then the camera dives to the town hall, where the names of the streets can be read.

import { useMemo } from 'react';
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from 'remotion';

import { Boundary, OutsideVeil, cameraTransform, figures, lerp, logLerp } from '../components/map.jsx';
import { Appear, Headline, Stat } from '../components/ui.jsx';
import { COLORS, EASE_IN_OUT, FONT, MARGIN, frenchNumber, progress } from '../theme.js';

const commune = figures.commune;
const centre = figures.centre;
const selected = figures.estimates.find(({ zoom }) => zoom === commune.zoom);

const TILES_START = 16;
const TILES_DURATION = 84;
const TILE_FADE = 9;
const DIVE_START = 132;
const DIVE_DURATION = 118;

// The whole municipality, on the right of the frame; the town hall, where the dive ends.
const START_SCALE = 0.215;
const END_SCALE = 3.0;
const START_POINT = [commune.width / 2, commune.height / 2];
const START_SCREEN = [1318, 560];
const END_SCREEN = [1300, 640];

// Where the image of the centre, one zoom further, lies in the image of the municipality.
const centreBox = {
  left: centre.xMin / 2 - commune.xMin,
  top: centre.yMin / 2 - commune.yMin,
  width: centre.width / 2,
  height: centre.height / 2,
};

/** The tiles of the map, each with the frame it arrives at: from the town hall outwards, six at a time or so. */
function useTiles() {
  return useMemo(() => {
    const { columns, rows, left, top, size } = commune.tiles;
    const cells = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = left + column * size;
        const y = top + row * size;
        const distance = Math.hypot(x + size / 2 - commune.townHall[0], y + size / 2 - commune.townHall[1]);
        cells.push({ x, y, size, order: distance + random(`tile-${column}-${row}`) * 900 });
      }
    }
    cells.sort((a, b) => a.order - b.order);
    return cells.map((cell, rank) => ({ ...cell, at: TILES_START + (rank / cells.length) * TILES_DURATION }));
  }, []);
}

export const Hook = () => {
  const frame = useCurrentFrame();
  const tiles = useTiles();

  const dive = progress(frame, DIVE_START, DIVE_DURATION, EASE_IN_OUT);
  const pan = progress(frame, DIVE_START, DIVE_DURATION * 0.78, EASE_IN_OUT);
  const drift = 1 + 0.035 * progress(frame, DIVE_START + DIVE_DURATION, 60, (t) => t);
  const scale = logLerp(START_SCALE, END_SCALE, dive) * drift;
  const point = [lerp(START_POINT[0], commune.townHall[0], pan), lerp(START_POINT[1], commune.townHall[1], pan)];
  const screen = [lerp(START_SCREEN[0], END_SCREEN[0], pan), lerp(START_SCREEN[1], END_SCREEN[1], pan)];

  const arrived = tiles.filter((tile) => frame >= tile.at).length;
  const ramp = (from, to) => interpolate(scale, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const images = [
    { file: commune.files[2], opacity: 1 },
    { file: commune.files[1], opacity: ramp(0.27, 0.36) },
    { file: commune.files[0], opacity: ramp(0.55, 0.7) },
  ];
  const veil =
    0.5 * progress(frame, TILES_START + TILES_DURATION, 26) * (1 - progress(frame, DIVE_START + 12, 34, EASE_IN_OUT));
  const panel = progress(frame, DIVE_START + 10, 40, EASE_IN_OUT);
  const grid = 1 - progress(frame, TILES_START + TILES_DURATION, 24);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: commune.width,
          height: commune.height,
          transformOrigin: '0 0',
          transform: cameraTransform(point, screen, scale),
        }}
      >
        {frame < DIVE_START ? (
          tiles.map((tile) => {
            const p = progress(frame, tile.at, TILE_FADE);
            if (p === 0) return null;
            return (
              <div
                key={`${tile.x}/${tile.y}`}
                style={{
                  position: 'absolute',
                  left: tile.x,
                  top: tile.y,
                  width: tile.size,
                  height: tile.size,
                  overflow: 'hidden',
                  opacity: p,
                  transform: `scale(${0.86 + 0.14 * p})`,
                }}
              >
                <Img
                  src={staticFile(images[0].file)}
                  style={{
                    position: 'absolute',
                    left: -tile.x,
                    top: -tile.y,
                    width: commune.width,
                    height: commune.height,
                    maxWidth: 'none',
                  }}
                />
              </div>
            );
          })
        ) : (
          <>
            {images.map(({ file, opacity }) =>
              opacity > 0 ? (
                <Img
                  key={file}
                  src={staticFile(file)}
                  style={{ position: 'absolute', left: 0, top: 0, width: commune.width, height: commune.height, opacity }}
                />
              ) : null,
            )}
            {ramp(1.15, 1.55) > 0 ? (
              <Img
                src={staticFile(centre.file)}
                style={{ position: 'absolute', ...centreBox, opacity: ramp(1.15, 1.55) }}
              />
            ) : null}
          </>
        )}
        {grid > 0 ? <TileGrid opacity={0.5 * grid} scale={scale} /> : null}
        <OutsideVeil d={commune.boundary} width={commune.width} height={commune.height} opacity={veil} margin={0} />
        <Boundary
          d={commune.boundary}
          width={commune.width}
          height={commune.height}
          drawn={progress(frame, 6, 56, EASE_IN_OUT)}
          strokeWidth={3.4 / scale}
        />
      </div>

      <AbsoluteFill
        style={{
          opacity: panel,
          background: `linear-gradient(90deg, rgba(247, 246, 241, 0.97) 0%, rgba(247, 246, 241, 0.94) 33%, rgba(247, 246, 241, 0) 52%)`,
        }}
      />

      <div style={{ position: 'absolute', left: MARGIN, top: 84, width: 740 }}>
        <Appear at={0} y={10} blur={4}>
          <Place />
        </Appear>
        <div style={{ marginTop: 28 }}>
          <Headline first="Toute votre commune." second="Chaque rue lisible." at={4} secondAt={DIVE_START + 22} size={70} />
        </div>
        <Appear at={TILES_START} style={{ marginTop: 40 }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 120,
              fontWeight: 780,
              letterSpacing: '-0.045em',
              lineHeight: 1,
              color: COLORS.ink,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {frenchNumber(arrived)}
          </div>
          <div style={{ marginTop: 10, fontFamily: FONT, fontSize: 27, fontWeight: 500, color: COLORS.muted }}>
            tuiles du Plan IGN, recollées en une seule image
          </div>
        </Appear>
        <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
          <Appear at={TILES_START + TILES_DURATION - 4}>
            <Stat value={`${frenchNumber(commune.width)} × ${frenchNumber(commune.height)}`} label="pixels" size={34} />
          </Appear>
          <Appear at={TILES_START + TILES_DURATION + 2}>
            <Stat value={selected.paper} label={`à ${figures.dpi} dpi`} size={34} color={COLORS.accent} />
          </Appear>
          <Appear at={TILES_START + TILES_DURATION + 8}>
            <Stat
              value={`${frenchNumber(Number(selected.metersPerPixel), 2)} m`}
              label="par pixel"
              size={34}
              color={COLORS.brand}
            />
          </Appear>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The pill naming the municipality, as the page shows it once chosen. */
const Place = () => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '9px 18px 9px 14px',
      borderRadius: 999,
      border: `1px solid ${COLORS.accentLine}`,
      background: COLORS.accentSoft,
      color: COLORS.accentDark,
      fontFamily: FONT,
      fontSize: 21,
      fontWeight: 620,
    }}
  >
    <span style={{ width: 10, height: 10, borderRadius: 5, background: COLORS.accent }} />
    {commune.name} (86) · Vienne
  </div>
);

/** The grid of the tiles, as they are asked for, before the map is whole. */
const TileGrid = ({ opacity, scale }) => {
  const { columns, rows, left, top, size } = commune.tiles;
  const width = columns * size;
  const height = rows * size;
  const lines = [
    ...Array.from({ length: columns + 1 }, (_, i) => `M${left + i * size},${top}v${height}`),
    ...Array.from({ length: rows + 1 }, (_, i) => `M${left},${top + i * size}h${width}`),
  ].join('');
  return (
    <svg
      width={commune.width}
      height={commune.height}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity }}
    >
      <path d={lines} stroke={COLORS.brand} strokeOpacity={0.35} strokeWidth={1.2 / scale} fill="none" />
    </svg>
  );
};
