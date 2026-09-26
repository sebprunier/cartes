// The zoom chosen from the paper: the table of the page, zoom by zoom, and the map printed at 150 dpi growing
// from the A4 to the A0; then the preview at real scale, where the labels read as they will once printed.

import { ScanSearch } from 'lucide-react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { figures } from '../components/map.jsx';
import { Appear, Card, Chip, SceneTitle } from '../components/ui.jsx';
import { COLORS, CONTENT_TOP, EASE_IN_OUT, FONT, MARGIN, SHADOW_LARGE, progress } from '../theme.js';

const rows = figures.estimates;
const map = figures.map;
const commune = figures.commune;
const CHOSEN_ZOOM = commune.zoom;
// The zooms the highlight passes through, one after the other, before it stays on the one of the video.
const STEPS = rows.filter(({ zoom }) => zoom <= CHOSEN_ZOOM);
const STEP_AT = (index) => 40 + index * 22;
const LOUPE_AT = 165;

// ISO paper, landscape, in millimetres, from the largest.
const SHEETS = [
  ['A0', 1189, 841],
  ['A1', 841, 594],
  ['A2', 594, 420],
  ['A3', 420, 297],
  ['A4', 297, 210],
];
const PAPER_SCALE = 0.66; // pixels of the frame per millimetre
const PAPER_LEFT = 1040;
const PAPER_BOTTOM = 950;

const COLUMNS = [
  ['Zoom', 60, 'left'],
  ['m/pixel', 95, 'right'],
  ['Image', 180, 'right'],
  ['Tuiles', 80, 'right'],
  ['Impression', 300, 'right'],
  ['Mémoire', 100, 'right'],
];
const ROW_HEIGHT = 50;

export const Print = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Where the highlight is: an index among the rows, eased from one to the next.
  let position = 0;
  STEPS.forEach((_, index) => {
    if (index > 0) position += progress(frame, STEP_AT(index), 16, EASE_IN_OUT);
  });
  const shown = progress(frame, STEP_AT(0), 12);
  const current = rows[Math.round(position)];
  const lower = rows[Math.floor(position)];
  const upper = rows[Math.min(rows.length - 1, Math.ceil(position))];
  const blend = position - Math.floor(position);
  const widthMm = interpolate(blend, [0, 1], [lower.widthMm, upper.widthMm]);
  const heightMm = interpolate(blend, [0, 1], [lower.heightMm, upper.heightMm]);
  const landed = frame >= STEP_AT(STEPS.length - 1) + 16;

  const loupe = spring({ frame: frame - LOUPE_AT, fps, config: { damping: 20, mass: 0.9 } });
  const dim = 1 - 0.55 * progress(frame, LOUPE_AT, 20);

  return (
    <AbsoluteFill>
      <SceneTitle kicker="L'impression" first="Le format papier" second="choisit le zoom." />

      <Appear at={10} style={{ position: 'absolute', left: MARGIN, top: CONTENT_TOP, opacity: dim }}>
        <Card style={{ padding: '28px 24px 18px', width: 900 }}>
          <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, color: COLORS.ink, marginLeft: 4 }}>
            Dimensions selon le niveau de zoom
          </div>
          <div style={{ position: 'relative', marginTop: 18 }}>
            <Row cells={COLUMNS.map(([name]) => name)} header />
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: position * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  background: COLORS.accentSoft,
                  borderLeft: `5px solid ${COLORS.accent}`,
                  opacity: shown,
                }}
              />
              {rows.map((row, index) => (
                <Appear key={row.zoom} at={12 + index * 3} y={10} blur={0}>
                  <Row
                    bold={Math.round(position) === index && shown > 0}
                    cells={[
                      row.zoom,
                      row.metersPerPixel,
                      `${row.width} × ${row.height}`,
                      row.tiles,
                      `${row.widthMm} × ${row.heightMm} mm (${row.paper})`,
                      row.memory,
                    ]}
                  />
                </Appear>
              ))}
            </div>
          </div>
        </Card>
      </Appear>

      <div style={{ position: 'absolute', inset: 0, opacity: dim }}>
        {SHEETS.map(([name, long, short], index) => {
          const active = current.paper === name && shown > 0;
          const appeared = progress(frame, 16 + index * 4, 18);
          return (
            <div
              key={name}
              style={{
                position: 'absolute',
                left: PAPER_LEFT,
                top: PAPER_BOTTOM - short * PAPER_SCALE,
                width: long * PAPER_SCALE,
                height: short * PAPER_SCALE,
                opacity: appeared,
                transformOrigin: '0 100%',
                transform: `scale(${0.96 + 0.04 * appeared})`,
                background: index === 0 ? COLORS.card : 'transparent',
                border: `1.5px solid ${active ? COLORS.accent : COLORS.lineStrong}`,
                borderRadius: 4,
                boxShadow: index === 0 ? SHADOW_LARGE : 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  top: 6,
                  fontFamily: FONT,
                  fontSize: index === 0 ? 24 : 19,
                  fontWeight: 700,
                  color: active ? COLORS.accent : COLORS.muted,
                }}
              >
                {name}
              </div>
            </div>
          );
        })}
        {shown > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: PAPER_LEFT + 2,
              top: PAPER_BOTTOM - heightMm * PAPER_SCALE - 2,
              width: widthMm * PAPER_SCALE,
              height: heightMm * PAPER_SCALE,
              outline: `2px solid ${COLORS.accent}`,
              opacity: shown,
              overflow: 'hidden',
            }}
          >
            <Img src={staticFile(map.files[2])} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        ) : null}
        {shown > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: PAPER_LEFT + widthMm * PAPER_SCALE + 14,
              top: PAPER_BOTTOM - heightMm * PAPER_SCALE - 8,
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 650,
              color: COLORS.accentDark,
              whiteSpace: 'nowrap',
              opacity: shown,
            }}
          >
            {Math.round(widthMm)} × {Math.round(heightMm)} mm
          </div>
        ) : null}
        <Appear at={STEP_AT(STEPS.length - 1) + 18} style={{ position: 'absolute', left: PAPER_LEFT, top: PAPER_BOTTOM + 22 }}>
          <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 560, color: COLORS.text }}>
            Zoom {CHOSEN_ZOOM} :{' '}
            <span style={{ color: COLORS.accent, fontWeight: 720 }}>
              {landed ? `${current.paper}, ${Math.round(current.widthMm / 10)} × ${Math.round(current.heightMm / 10)} cm` : ''}
            </span>{' '}
            à {figures.dpi} dpi
          </div>
        </Appear>
      </div>

      {frame >= LOUPE_AT ? <Loupe grow={loupe} /> : null}
    </AbsoluteFill>
  );
};

const Row = ({ cells, header = false, bold = false }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      height: header ? 44 : ROW_HEIGHT,
      padding: '0 14px',
      borderBottom: `1px solid ${COLORS.line}`,
      background: header ? COLORS.soft : 'transparent',
      fontFamily: FONT,
      fontSize: header ? 18 : 20,
      fontWeight: header ? 650 : bold ? 700 : 450,
      color: header ? COLORS.ink : COLORS.text,
      fontVariantNumeric: 'tabular-nums',
      position: 'relative',
    }}
  >
    {cells.map((cell, index) => (
      <div key={index} style={{ width: COLUMNS[index][1], textAlign: COLUMNS[index][2], whiteSpace: 'nowrap' }}>
        {cell}
      </div>
    ))}
  </div>
);

// The extract of the preview: the centre of the map at its real size, one pixel of the map for one of the frame.
const LOUPE_WIDTH = 900;
const LOUPE_HEIGHT = 560;

const Loupe = ({ grow }) => {
  const [x, y] = commune.townHall;
  // The whole map is 5 104 pixels wide: it is shown at its real size, around the town hall.
  const left = -(x - LOUPE_WIDTH / 2 + 60);
  const top = -(y - LOUPE_HEIGHT / 2 + 20);
  return (
    <div
      style={{
        position: 'absolute',
        left: 900,
        top: 250,
        transformOrigin: '400px 600px',
        transform: `scale(${0.3 + 0.7 * grow})`,
        opacity: Math.min(1, grow * 1.6),
      }}
    >
      <Card style={{ padding: 12, borderRadius: 20, boxShadow: SHADOW_LARGE }}>
        <div style={{ position: 'relative', width: LOUPE_WIDTH, height: LOUPE_HEIGHT, overflow: 'hidden', borderRadius: 10 }}>
          <Img
            src={staticFile(map.files[0])}
            style={{ position: 'absolute', left, top, width: commune.width, height: commune.height, maxWidth: 'none' }}
          />
        </div>
        <div style={{ padding: '16px 10px 6px', fontFamily: FONT, fontSize: 21, color: COLORS.muted, width: LOUPE_WIDTH }}>
          Extrait au zoom {commune.zoom}, à l'échelle réelle : un pixel de l'aperçu est un pixel de la carte.
        </div>
      </Card>
      <div style={{ position: 'absolute', left: -40, top: -26 }}>
        <Chip icon={ScanSearch}>Aperçu à l'échelle réelle</Chip>
      </div>
    </div>
  );
};
