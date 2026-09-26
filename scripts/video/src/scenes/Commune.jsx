// Choosing the municipality, as the page does it: its name typed, its namesakes listed with their department and
// their population, the one of the Vienne chosen, and its official boundary drawn.

import { MapPin } from 'lucide-react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { FieldLabel, Field, Chosen, Pointer, StepTitle } from '../components/interface.jsx';
import { Boundary, OutsideVeil, figures } from '../components/map.jsx';
import { Appear, Card, Chip, SceneTitle } from '../components/ui.jsx';
import { COLORS, CONTENT_TOP, EASE_IN_OUT, FONT, MARGIN, SHADOW, progress } from '../theme.js';

const commune = figures.commune;
const QUERY = figures.search.query;
const RESULTS = figures.search.results.slice(0, 7);
const CHOSEN = RESULTS.findIndex(({ inseeCode }) => inseeCode === '86081');

const TYPE_START = 22;
const TYPE_EVERY = 3;
const LIST_AT = TYPE_START + QUERY.length * TYPE_EVERY + 6;
const CLICK = 106;
const MOVE = 118;

// The layout of the card, fixed so that the pointer finds the row it clicks.
const CARD_WIDTH = 860;
const CARD_PADDING = 34;
const FIELD_TOP = 108;
const FIELD_HEIGHT = 64;
const ROW_HEIGHT = 50;
const LIST_TOP = FIELD_TOP + FIELD_HEIGHT + 10;
const CARD_START_LEFT = 530;

const MAP_LEFT = 950;
const MAP_TOP = 250;
const MAP_WIDTH = 850;
const MAP_HEIGHT = (MAP_WIDTH * commune.height) / commune.width;
const MAP_SCALE = MAP_WIDTH / commune.width;

export const Commune = () => {
  const frame = useCurrentFrame();
  const typed = QUERY.slice(0, Math.max(0, Math.floor((frame - TYPE_START) / TYPE_EVERY) + 1));
  const moved = progress(frame, MOVE, 30, EASE_IN_OUT);
  const left = interpolate(moved, [0, 1], [CARD_START_LEFT, MARGIN]);
  const listShown = progress(frame, LIST_AT, 10) * (1 - progress(frame, CLICK + 6, 10, EASE_IN_OUT));

  // The pointer comes to the row of Colombiers (Vienne), clicks it, and leaves.
  const rowY = CONTENT_TOP + CARD_PADDING + LIST_TOP + 8 + ROW_HEIGHT * CHOSEN + ROW_HEIGHT / 2;
  const target = [CARD_START_LEFT + CARD_PADDING + 330, rowY];
  const approach = progress(frame, 70, 32, EASE_IN_OUT);
  const pointer = [
    interpolate(approach, [0, 1], [1480, target[0]]),
    interpolate(approach, [0, 1], [1010, target[1]]),
  ];
  const pressed = interpolate(frame, [CLICK - 3, CLICK, CLICK + 4], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pointerOpacity = progress(frame, 66, 8) * (1 - progress(frame, CLICK + 10, 10));
  const hovered = frame >= 96 && frame < CLICK + 14;

  return (
    <AbsoluteFill>
      <SceneTitle kicker="La commune" first="Une commune." second="Son contour officiel." />

      <div style={{ position: 'absolute', left, top: CONTENT_TOP }}>
        <Appear at={8}>
          <Card style={{ width: CARD_WIDTH, padding: CARD_PADDING }}>
            <StepTitle number={1} size={30}>
              Choisir la commune
            </StepTitle>
            <div style={{ marginTop: 24 }}>
              <FieldLabel>Nom de la commune</FieldLabel>
            </div>
            <Field value={typed} caret={frame >= TYPE_START - 6 && frame < CLICK} height={FIELD_HEIGHT} style={{ marginTop: 12 }} />
            <div style={{ height: listShown * (ROW_HEIGHT * RESULTS.length + 16 + 10), overflow: 'hidden' }}>
              <div
                style={{
                  marginTop: 10,
                  padding: 8,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 12,
                  boxShadow: SHADOW,
                  background: COLORS.card,
                  opacity: listShown,
                }}
              >
                {RESULTS.map((result, index) => (
                  <div
                    key={result.inseeCode}
                    style={{
                      height: ROW_HEIGHT,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 14px',
                      borderRadius: 8,
                      background: hovered && index === CHOSEN ? COLORS.brandSoft : 'transparent',
                      fontFamily: FONT,
                      fontSize: 18,
                      color: COLORS.text,
                      whiteSpace: 'nowrap',
                      opacity: progress(frame, LIST_AT + index * 3, 10),
                    }}
                  >
                    {result.label}
                  </div>
                ))}
              </div>
            </div>
            {frame >= CLICK + 8 ? (
              <Appear at={CLICK + 10} y={10} style={{ marginTop: 18 }}>
                <Chosen>
                  {commune.name} ({RESULTS[CHOSEN].inseeCode})
                </Chosen>
              </Appear>
            ) : null}
          </Card>
        </Appear>
      </div>

      <Appear at={MOVE + 8} x={80} y={0} style={{ position: 'absolute', left: MAP_LEFT, top: MAP_TOP }}>
        <Card style={{ padding: 12, borderRadius: 20 }}>
          <div style={{ position: 'relative', width: MAP_WIDTH, height: MAP_HEIGHT, overflow: 'hidden', borderRadius: 10 }}>
            <Img src={staticFile(commune.files[1])} style={{ width: MAP_WIDTH, height: MAP_HEIGHT, display: 'block' }} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: commune.width,
                height: commune.height,
                transformOrigin: '0 0',
                transform: `scale(${MAP_SCALE})`,
              }}
            >
              <OutsideVeil
                d={commune.boundary}
                width={commune.width}
                height={commune.height}
                opacity={0.45 * progress(frame, MOVE + 70, 24)}
                margin={0}
              />
              <Boundary
                d={commune.boundary}
                width={commune.width}
                height={commune.height}
                drawn={progress(frame, MOVE + 16, 58, EASE_IN_OUT)}
                strokeWidth={3.4 / MAP_SCALE}
                fill={COLORS.outline}
                fillOpacity={0.045 * progress(frame, MOVE + 70, 24)}
              />
            </div>
          </div>
        </Card>
      </Appear>

      <Appear at={MOVE + 62} style={{ position: 'absolute', left: MAP_LEFT + 36, top: MAP_TOP + MAP_HEIGHT - 50 }}>
        <Chip icon={MapPin} color={COLORS.outline}>
          Contour officiel · © IGN – ADMIN EXPRESS
        </Chip>
      </Appear>

      {pointerOpacity > 0 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: pointerOpacity }}>
          <Pointer x={pointer[0]} y={pointer[1]} pressed={pressed} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
