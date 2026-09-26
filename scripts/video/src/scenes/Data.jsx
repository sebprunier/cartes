// The data of the municipality: the list of addresses of the examples, geocoded by the tool — each row found or
// to check —, its points falling on the map in the color of their category, and the legend being written.

import { FileSpreadsheet, Lock } from 'lucide-react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { Boundary, figures } from '../components/map.jsx';
import { Appear, Badge, Card, Chip, SceneTitle } from '../components/ui.jsx';
import { COLORS, CONTENT_TOP, FONT, MAP_FONT, MARGIN, progress } from '../theme.js';

const data = figures.data;
const commune = figures.commune;

const STATUS_AT = (index) => 48 + index * 5;
const SUMMARY_AT = STATUS_AT(data.rows.length) + 6;
const POINT_AT = (index) => 128 + index * 9;
const LEGEND_AT = POINT_AT(data.points.length) + 8;

const MAP_LEFT = 980;
const MAP_WIDTH = 820;
const MAP_HEIGHT = (MAP_WIDTH * commune.height) / commune.width;
const MAP_SCALE = MAP_WIDTH / commune.width;

// Where each label goes beside its point, where points fall close together: [dx, dy, anchor].
const LABELS = {
  'CTM Colombiers': [-15, -3, 'end'],
  'Place mairie': [15, 5, 'start'],
  'Salle des Fêtes': [15, 22, 'start'],
  'Tour Savary Sud': [-15, 10, 'end'],
  'Tour Savary Nord': [15, -4, 'start'],
};

export const Data = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <SceneTitle kicker="Vos données" first="Vos données sur la carte." second="Même une liste d'adresses." size={72} />

      <Appear at={8} style={{ position: 'absolute', left: MARGIN, top: CONTENT_TOP }}>
        <Card style={{ width: 850, padding: '20px 0 8px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px 16px' }}>
            <FileSpreadsheet size={26} color={COLORS.accent} strokeWidth={2} />
            <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 650, color: COLORS.ink, flex: 1 }}>{data.file}</div>
            <Appear at={SUMMARY_AT} y={0} x={16} blur={0}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Badge tone="accent">{data.summary.found} trouvées</Badge>
                <Badge tone="warning">{data.summary.check} à vérifier</Badge>
              </div>
            </Appear>
          </div>
          <TableRow header cells={['nom', 'adresse', 'géocodage']} />
          {data.rows.map((row, index) => {
            const point = data.points.findIndex(({ name }) => name === row.name);
            const flash = point === -1 ? 0 : bump(frame, POINT_AT(point) + 4, 16);
            return (
              <Appear key={row.name} at={10 + index * 2} y={8} blur={0}>
                <TableRow
                  flash={flash}
                  cells={[
                    row.name,
                    row.address,
                    frame >= STATUS_AT(index) ? <Status key="status" status={row.status} at={STATUS_AT(index)} /> : null,
                  ]}
                />
              </Appear>
            );
          })}
        </Card>
      </Appear>

      <Appear at={SUMMARY_AT + 90} style={{ position: 'absolute', left: MARGIN, top: 955 }}>
        <Chip icon={Lock}>Vos fichiers ne quittent pas votre ordinateur.</Chip>
      </Appear>

      <Appear at={40} x={80} y={0} style={{ position: 'absolute', left: MAP_LEFT, top: CONTENT_TOP }}>
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
              <Boundary d={commune.boundary} width={commune.width} height={commune.height} strokeWidth={3 / MAP_SCALE} />
            </div>
            <svg width={MAP_WIDTH} height={MAP_HEIGHT} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              {data.points.map((point, index) => {
                const fall = spring({ frame: frame - POINT_AT(index), fps, config: { damping: 11, mass: 0.6 } });
                if (frame < POINT_AT(index)) return null;
                const x = point.position[0] * MAP_SCALE;
                const y = point.position[1] * MAP_SCALE;
                const [dx, dy, anchor] = LABELS[point.name] ?? [15, 0, 'start'];
                const label = progress(frame, POINT_AT(index) + 6, 12);
                return (
                  <g key={point.name}>
                    <g transform={`translate(${x}, ${y - (1 - fall) * 60})`} opacity={Math.min(1, fall * 2)}>
                      <circle r={8.5} fill={point.color} stroke="#ffffff" strokeWidth={2.6} />
                    </g>
                    <text
                      x={x + dx}
                      y={y + dy + 6}
                      textAnchor={anchor}
                      opacity={label}
                      fontFamily={MAP_FONT}
                      fontSize={17}
                      fontWeight={600}
                      fill={point.color}
                      stroke="#ffffff"
                      strokeWidth={4}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                    >
                      {point.name}
                    </text>
                  </g>
                );
              })}
            </svg>
            <Legend />
          </div>
        </Card>
      </Appear>
    </AbsoluteFill>
  );
};

/** A flash of 0 → 1 → 0 around frame `at`, lasting `duration` frames. */
function bump(frame, at, duration) {
  return interpolate(frame, [at, at + duration / 3, at + duration], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

const WIDTHS = [210, 430, 150];

const TableRow = ({ cells, header = false, flash = 0 }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      height: header ? 38 : 35,
      padding: '0 24px',
      gap: 14,
      borderTop: `1px solid ${COLORS.line}`,
      background: header ? COLORS.soft : `rgba(21, 129, 79, ${0.14 * flash})`,
      fontFamily: FONT,
      fontSize: header ? 15 : 17,
      fontWeight: header ? 650 : 450,
      letterSpacing: header ? '0.06em' : 0,
      textTransform: header ? 'uppercase' : 'none',
      color: header ? COLORS.muted : COLORS.text,
    }}
  >
    {cells.map((cell, index) => (
      <div
        key={index}
        style={{
          width: WIDTHS[index],
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: index === 0 && !header ? 600 : undefined,
          color: index === 0 && !header ? COLORS.ink : undefined,
        }}
      >
        {cell}
      </div>
    ))}
  </div>
);

const Status = ({ status, at }) => {
  const frame = useCurrentFrame();
  const shown = progress(frame, at, 10);
  return (
    <span style={{ display: 'inline-block', opacity: shown, transform: `scale(${0.8 + 0.2 * shown})` }}>
      <Badge tone={status === 'trouvée' ? 'accent' : 'warning'} size={15}>
        {status}
      </Badge>
    </span>
  );
};

/** The legend of the data, in the style the tool writes it on the map. */
const Legend = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        padding: '12px 18px 10px',
        background: 'rgba(255, 255, 255, 0.92)',
        borderRadius: 6,
        boxShadow: '0 2px 10px rgba(23, 35, 47, 0.12)',
        opacity: progress(frame, LEGEND_AT, 12),
        fontFamily: MAP_FONT,
        color: '#333333',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{data.title}</div>
      {data.categories.map((category, index) => (
        <div
          key={category.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 25,
            fontSize: 16,
            opacity: progress(frame, LEGEND_AT + 4 + index * 4, 10),
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 6, background: category.color }} />
          {category.name}
        </div>
      ))}
    </div>
  );
};
