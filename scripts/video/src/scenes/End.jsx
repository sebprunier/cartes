// The end: where to find the tool, with its QR code, beside the map of Colombiers as it prints.

import { ArrowRight } from 'lucide-react';
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { figures } from '../components/map.jsx';
import { Appear, Card, Headline } from '../components/ui.jsx';
import { COLORS, FONT, MARGIN, SHADOW_LARGE } from '../theme.js';

const map = figures.map;
const commune = figures.commune;
const address = figures.documentation.replace(/^https:\/\//, '').replace(/\/$/, '');

export const End = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const poster = spring({ frame: frame - 6, fps, config: { damping: 18, mass: 1.1 } });
  const float = Math.sin(frame / 38) * 6;
  const posterWidth = 820;
  const posterHeight = (posterWidth * commune.height) / commune.width;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 1010,
          top: 540 - posterHeight / 2 - 16,
          width: posterWidth + 36,
          padding: 18,
          background: '#ffffff',
          borderRadius: 6,
          boxShadow: SHADOW_LARGE,
          transform: `translate(${(1 - poster) * 260}px, ${float}px) rotate(${2.5 - 1.2 * poster}deg)`,
          opacity: Math.min(1, poster * 1.5),
        }}
      >
        <Img src={staticFile(map.files[2])} style={{ width: posterWidth, height: posterHeight, display: 'block' }} />
      </div>

      <div style={{ position: 'absolute', left: MARGIN, top: 150, width: 860 }}>
        <Appear at={0} y={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Img src={staticFile('logo.png')} style={{ width: 92, height: 92 }} />
            <div
              style={{
                fontFamily: FONT,
                fontSize: 76,
                fontWeight: 800,
                letterSpacing: '-0.05em',
                color: COLORS.brand,
              }}
            >
              cartes
            </div>
          </div>
        </Appear>
        <div style={{ marginTop: 40 }}>
          <Headline first="Générez la carte" second="de votre commune." at={8} size={84} />
        </div>
        <Appear at={24}>
          <div style={{ marginTop: 26, fontFamily: FONT, fontSize: 30, fontWeight: 520, color: COLORS.muted }}>
            Libre, gratuit, sans compte.
          </div>
        </Appear>
        <Appear at={34} style={{ marginTop: 44 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 16,
              padding: '22px 34px',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${COLORS.brand}, ${COLORS.accent})`,
              boxShadow: '0 16px 36px rgba(14, 71, 119, 0.28)',
              fontFamily: FONT,
              fontSize: 36,
              fontWeight: 680,
              color: '#ffffff',
              letterSpacing: '-0.01em',
            }}
          >
            {address}
            <ArrowRight size={36} color="#ffffff" strokeWidth={2.6} />
          </div>
        </Appear>
        <Appear at={44} style={{ marginTop: 34 }}>
          <Card style={{ display: 'inline-flex', alignItems: 'center', gap: 24, padding: 18, paddingRight: 32 }}>
            <Img src={staticFile('qr-documentation.svg')} style={{ width: 150, height: 150 }} />
            <div style={{ fontFamily: FONT }}>
              <div style={{ fontSize: 25, fontWeight: 680, color: COLORS.ink }}>Documentation et page de génération</div>
              <div style={{ marginTop: 6, fontSize: 21, color: COLORS.muted }}>Rien à installer : un navigateur suffit.</div>
            </div>
          </Card>
        </Appear>
      </div>

      <Appear at={56} y={8} blur={0} style={{ position: 'absolute', left: MARGIN, bottom: 64 }}>
        <div style={{ fontFamily: FONT, fontSize: 21, fontWeight: 520, color: COLORS.muted }}>
          Un projet né à Colombiers (Vienne) · code ouvert, licence MIT
        </div>
      </Appear>
    </AbsoluteFill>
  );
};
