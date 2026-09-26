// The cover of the video: its name and what it does, beside the layers of Colombiers in relief. Rendered as a
// still, at its last frame, once every layer is in place.

import { AbsoluteFill, Img, staticFile } from 'remotion';

import { Headline, Paper } from './components/ui.jsx';
import { figures } from './components/map.jsx';
import { LayerStack } from './scenes/Layers.jsx';
import { COLORS, FONT, MARGIN } from './theme.js';

export const COVER_DURATION = 300;

const address = figures.documentation.replace(/^https:\/\//, '').replace(/\/$/, '');

export const Cover = () => (
  <AbsoluteFill>
    <Paper />
    <LayerStack stage={[1390, 650]} />
    <div style={{ position: 'absolute', left: MARGIN, top: 200, width: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <Img src={staticFile('logo.png')} style={{ width: 104, height: 104 }} />
        <div style={{ fontFamily: FONT, fontSize: 92, fontWeight: 800, letterSpacing: '-0.05em', color: COLORS.brand }}>
          cartes
        </div>
      </div>
      <div style={{ marginTop: 46 }}>
        <Headline first="Des cartes détaillées" second="de votre commune." size={84} />
      </div>
      <div style={{ marginTop: 28, fontFamily: FONT, fontSize: 31, fontWeight: 520, color: COLORS.muted, lineHeight: 1.4 }}>
        Prêtes à imprimer, de l'A3 à l'affiche.
        <br />
        Libre et gratuit.
      </div>
      <div
        style={{
          marginTop: 40,
          display: 'inline-block',
          padding: '16px 28px',
          borderRadius: 999,
          background: `linear-gradient(90deg, ${COLORS.brand}, ${COLORS.accent})`,
          fontFamily: FONT,
          fontSize: 30,
          fontWeight: 680,
          color: '#ffffff',
        }}
      >
        {address}
      </div>
    </div>
  </AbsoluteFill>
);
