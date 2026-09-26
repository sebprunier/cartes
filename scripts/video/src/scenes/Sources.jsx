// The sources of the map: the mention the tool writes at the bottom of it, brought forward, each date lit in turn.

import { BadgeCheck } from 'lucide-react';
import { Fragment } from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';

import { figures } from '../components/map.jsx';
import { Appear, Chip, SceneTitle } from '../components/ui.jsx';
import { COLORS, EASE_OUT, MAP_FONT, SHADOW_LARGE, progress } from '../theme.js';

const map = figures.map;
const commune = figures.commune;
// The mention, cut around its dates: every other piece is a date.
const PIECES = map.attribution.split(/(\d{2}\/\d{2}\/\d{4})/);
const DATE_AT = (index) => 44 + index * 17;

// The map, large, its bottom — where the tool writes the sources — just above the bottom of the frame.
const MAP_WIDTH = 1520;
const MAP_HEIGHT = (MAP_WIDTH * commune.height) / commune.width;
const MAP_LEFT = 500;
const MAP_BOTTOM = 1050;

export const Sources = () => {
  const frame = useCurrentFrame();
  const lift = progress(frame, 20, 30, EASE_OUT);
  let date = -1;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: MAP_LEFT,
          top: MAP_BOTTOM - MAP_HEIGHT,
          width: MAP_WIDTH,
          height: MAP_HEIGHT,
          opacity: 0.9,
          boxShadow: SHADOW_LARGE,
        }}
      >
        <Img src={staticFile(map.files[1])} style={{ width: MAP_WIDTH, height: MAP_HEIGHT, display: 'block' }} />
        <div
          style={{
            position: 'absolute',
            left: MAP_WIDTH * 0.395,
            right: 4,
            bottom: 2,
            height: 34,
            borderRadius: 6,
            border: `3px solid ${COLORS.accent}`,
            opacity: progress(frame, 8, 12) * (1 - 0.6 * progress(frame, 40, 20)),
          }}
        />
      </div>
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(247, 246, 241, 0.98) 0%, rgba(247, 246, 241, 0.9) 34%, rgba(247, 246, 241, 0.25) 62%, rgba(247, 246, 241, 0) 100%)',
        }}
      />

      <SceneTitle kicker="Les sources" first="Chaque source citée." second="Chaque date aussi." />

      <div
        style={{
          position: 'absolute',
          left: 360,
          top: 390,
          width: 1300,
          padding: '34px 44px',
          borderRadius: 18,
          background: 'rgba(255, 255, 255, 0.97)',
          boxShadow: SHADOW_LARGE,
          opacity: lift,
          transformOrigin: '70% 100%',
          transform: `translateY(${(1 - lift) * 260}px) scale(${0.86 + 0.14 * lift})`,
          fontFamily: MAP_FONT,
          fontSize: 35,
          lineHeight: 1.6,
          color: '#333333',
        }}
      >
        {PIECES.map((piece, index) => {
          if (index % 2 === 0) return <Fragment key={index}>{piece}</Fragment>;
          date++;
          const lit = progress(frame, DATE_AT(date), 12);
          return (
            <span
              key={index}
              style={{
                padding: '2px 8px',
                margin: '0 -2px',
                borderRadius: 8,
                background: `rgba(21, 129, 79, ${0.16 * lit})`,
                boxShadow: `inset 0 0 0 2px rgba(21, 129, 79, ${0.5 * lit})`,
                color: lit > 0.5 ? COLORS.accentDark : '#333333',
                fontWeight: lit > 0.5 ? 700 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {piece}
            </span>
          );
        })}
      </div>

      <Appear at={DATE_AT(3) + 22} style={{ position: 'absolute', left: 360, top: 730 }}>
        <Chip icon={BadgeCheck}>Écrites sur la carte, comme la licence l'exige.</Chip>
      </Appear>
    </AbsoluteFill>
  );
};
