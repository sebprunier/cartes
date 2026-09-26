// The name of the tool: its logo, its word and what it does, over the boundary of Colombiers drawn large.

import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { Boundary, figures } from '../components/map.jsx';
import { Appear } from '../components/ui.jsx';
import { COLORS, EASE_IN_OUT, FONT, progress } from '../theme.js';

const commune = figures.commune;

export const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: frame - 2, fps, config: { damping: 14, mass: 0.7 } });
  // The boundary, larger than the frame, turns slowly behind the name.
  const scale = 0.34 * (1 + 0.05 * progress(frame, 0, 140, (t) => t));

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          position: 'absolute',
          left: 960 - (commune.width * scale) / 2,
          top: 560 - (commune.height * scale) / 2,
          width: commune.width,
          height: commune.height,
          transformOrigin: '0 0',
          transform: `scale(${scale}) rotate(${-4 + 3 * progress(frame, 0, 140, (t) => t)}deg)`,
          opacity: 0.12,
        }}
      >
        <Boundary
          d={commune.boundary}
          width={commune.width}
          height={commune.height}
          drawn={progress(frame, 0, 70, EASE_IN_OUT)}
          strokeWidth={5 / scale}
          color={COLORS.brand}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ transform: `scale(${0.7 + 0.3 * logo})`, opacity: Math.min(1, logo * 1.4) }}>
          <Img src={staticFile('logo.png')} style={{ width: 196, height: 196, filter: 'drop-shadow(0 18px 30px rgba(14, 71, 119, 0.18))' }} />
        </div>
        <Appear at={8} y={20}>
          <div
            style={{
              marginTop: 18,
              fontFamily: FONT,
              fontSize: 168,
              fontWeight: 800,
              letterSpacing: '-0.05em',
              lineHeight: 1,
              color: COLORS.brand,
            }}
          >
            cartes
          </div>
        </Appear>
        <Appear at={18} y={16}>
          <div
            style={{
              marginTop: 26,
              fontFamily: FONT,
              fontSize: 42,
              fontWeight: 560,
              letterSpacing: '-0.015em',
              color: COLORS.ink,
            }}
          >
            Des cartes détaillées de votre commune, prêtes à imprimer.
          </div>
        </Appear>
        <Appear at={30} y={12}>
          <div
            style={{
              marginTop: 26,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 600,
              color: COLORS.accent,
            }}
          >
            <span>Libre et gratuit</span>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: COLORS.lineStrong }} />
            <span style={{ color: COLORS.muted, fontWeight: 520 }}>pour les communes de France</span>
          </div>
        </Appear>
      </div>
    </AbsoluteFill>
  );
};
