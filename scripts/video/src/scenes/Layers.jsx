// The layers of the catalog, drawn by cartes over the village of Colombiers, laid one above the other in relief
// over the Plan IGN, each named with who publishes it.

import { Layers as LayersIcon, LayoutGrid, Mountain, TriangleAlert } from 'lucide-react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';

import { Boundary, figures } from '../components/map.jsx';
import { Appear, Badge, Card, SceneTitle } from '../components/ui.jsx';
import { COLORS, CONTENT_TOP, EASE_IN_OUT, EASE_OUT, FONT, MARGIN, progress } from '../theme.js';

const extract = figures.layers;
// The layers shown, from the lowest: those that tell the most about Colombiers, one of each theme at least.
const SHOWN = ['cadastre', 'plu', 'argiles', 'courbes'];
const layers = SHOWN.map((id) => extract.drawn.find((layer) => layer.id === id));
const THEMES = Object.fromEntries(extract.themes.map(({ id, name }) => [id, name]));
const ICONS = { urbanisme: LayoutGrid, territoire: Mountain, risques: TriangleAlert };
const ICON_COLORS = { urbanisme: COLORS.brand, territoire: COLORS.accent, risques: '#b3261e' };

const PLANE_WIDTH = 740;
const PLANE_HEIGHT = (PLANE_WIDTH * extract.height) / extract.width;
const GAP = 150;
const FIRST_DROP = 34;
const DROP_EVERY = 40;
const STAGE = [1395, 700];

export const Layers = () => (
  <AbsoluteFill>
    <LayerStack stage={STAGE} />

    <SceneTitle kicker="Les couches" first="Cadastre, PLU, risques." second="En un clic." />

    <div style={{ position: 'absolute', left: MARGIN, top: CONTENT_TOP, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {layers.map((layer, index) => (
        <Appear key={layer.id} at={FIRST_DROP + index * DROP_EVERY + 6} x={-30} y={0}>
          <LayerCard layer={layer} />
        </Appear>
      ))}
      <Appear at={FIRST_DROP + layers.length * DROP_EVERY + 10} style={{ marginTop: 14 }}>
        {/* No count of the layers: the catalog grows from one version to the next. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, width: 660 }}>
          <div
            style={{
              width: 76,
              height: 76,
              flex: 'none',
              borderRadius: 20,
              display: 'grid',
              placeItems: 'center',
              background: COLORS.accentSoft,
            }}
          >
            <LayersIcon size={40} color={COLORS.accent} strokeWidth={2.1} />
          </div>
          <div style={{ fontFamily: FONT, fontSize: 25, fontWeight: 520, color: COLORS.text, lineHeight: 1.3 }}>
            Un catalogue de couches ouvertes,
            <br />
            <span style={{ color: COLORS.muted }}>et celles de votre commune, par leur adresse.</span>
          </div>
        </div>
      </Appear>
    </div>
  </AbsoluteFill>
);

/**
 * The basemap and the layers above it, in relief, centred on the point `stage` of the frame: each layer drops into
 * its place in turn, and the whole turns slowly.
 */
export const LayerStack = ({ stage }) => {
  const frame = useCurrentFrame();
  const turn = progress(frame, 0, 315, (t) => t);
  const tiltX = 60 - 4 * turn;
  const tiltZ = -40 + 8 * turn;
  const lift = progress(frame, 0, 40, EASE_OUT);

  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 3200, perspectiveOrigin: `${stage[0]}px 260px` }}>
      <div
        style={{
          position: 'absolute',
          left: stage[0] - PLANE_WIDTH / 2,
          top: stage[1] - PLANE_HEIGHT / 2,
          width: PLANE_WIDTH,
          height: PLANE_HEIGHT,
          transformStyle: 'preserve-3d',
          transform: `translateY(${(1 - lift) * 60}px) rotateX(${tiltX}deg) rotateZ(${tiltZ}deg)`,
          opacity: lift,
        }}
      >
        <Plane z={0} opacity={1} base>
          <Img src={staticFile(extract.base)} style={{ width: '100%', height: '100%' }} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: extract.width,
              height: extract.height,
              transformOrigin: '0 0',
              transform: `scale(${PLANE_WIDTH / extract.width})`,
            }}
          >
            <Boundary d={extract.boundary} width={extract.width} height={extract.height} strokeWidth={10} />
          </div>
        </Plane>
        {layers.map((layer, index) => {
          const at = FIRST_DROP + index * DROP_EVERY;
          const drop = progress(frame, at, 30, EASE_OUT);
          return (
            <Plane key={layer.id} z={GAP * (index + 1) + (1 - drop) * 520} opacity={progress(frame, at, 12, EASE_IN_OUT)}>
              <Img src={staticFile(layer.file)} style={{ width: '100%', height: '100%' }} />
            </Plane>
          );
        })}
      </div>
    </div>
  );
};

/** A sheet of the stack, raised `z` pixels above the basemap. */
const Plane = ({ z, opacity, base = false, children }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      transform: `translateZ(${z}px)`,
      opacity,
      borderRadius: 6,
      overflow: 'hidden',
      border: base ? '6px solid #ffffff' : `2px solid rgba(14, 71, 119, 0.32)`,
      background: base ? '#ffffff' : 'rgba(255, 255, 255, 0.34)',
      boxShadow: base ? '0 40px 80px rgba(23, 35, 47, 0.25)' : 'none',
    }}
  >
    {children}
  </div>
);

/** A layer as the catalog of the page presents it: its name, its theme and who publishes it. */
const LayerCard = ({ layer }) => {
  const Icon = ICONS[layer.theme];
  return (
    <Card style={{ width: 640, padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 18, borderRadius: 16 }}>
      <div
        style={{
          width: 50,
          height: 50,
          flex: 'none',
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: COLORS.soft,
        }}
      >
        <Icon size={26} color={ICON_COLORS[layer.theme]} strokeWidth={2.1} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 650, color: COLORS.ink, whiteSpace: 'nowrap' }}>
          {layer.name}
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 650,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: COLORS.muted,
          }}
        >
          {THEMES[layer.theme]}
        </div>
      </div>
      <Badge>{layer.provider}</Badge>
    </Card>
  );
};
