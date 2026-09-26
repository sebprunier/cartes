// The pieces every scene is built from: the titles, the cards, the chips and their appearance.

import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { COLORS, FONT, MARGIN, SHADOW, progress } from '../theme.js';

/** The paper every scene is laid on, lit a little brighter at its centre. */
export const Paper = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 80% 70% at 55% 45%, #fbfaf6 0%, ${COLORS.paper} 55%, ${COLORS.paperDeep} 100%)`,
    }}
  />
);

/** Its children rise into place, fading and coming into focus, from frame `at`. */
export const Appear = ({ at = 0, duration = 22, y = 26, x = 0, blur = 8, scale = 1, style, children }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, at, duration);
  const s = scale + (1 - scale) * p;
  return (
    <div
      style={{
        opacity: p,
        transform: `translate(${(1 - p) * x}px, ${(1 - p) * y}px) scale(${s})`,
        filter: blur && p < 1 ? `blur(${(1 - p) * blur}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** The small title above a headline: « — LES COUCHES ». */
export const Kicker = ({ at = 0, children }) => (
  <Appear at={at} y={10} blur={4}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: FONT,
        fontSize: 19,
        fontWeight: 650,
        letterSpacing: '0.17em',
        textTransform: 'uppercase',
        color: COLORS.accent,
      }}
    >
      <span style={{ width: 34, height: 2, borderRadius: 2, background: COLORS.accent }} />
      {children}
    </div>
  </Appear>
);

const gradientText = {
  display: 'inline-block',
  paddingBottom: '0.08em',
  backgroundImage: `linear-gradient(90deg, ${COLORS.brand} 0%, #11607a 45%, ${COLORS.accent} 100%)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

/** A headline of two lines, the second in the colors of the logo. */
export const Headline = ({ first, second, at = 0, secondAt, size = 76, align = 'left' }) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: size,
      fontWeight: 760,
      letterSpacing: '-0.035em',
      lineHeight: 1.05,
      color: COLORS.ink,
      textAlign: align,
    }}
  >
    <Appear at={at}>
      <div>{first}</div>
    </Appear>
    <Appear at={secondAt ?? at + 8}>
      <div style={gradientText}>{second}</div>
    </Appear>
  </div>
);

/** The kicker and the headline of a scene, in the top left corner. */
export const SceneTitle = ({ kicker, first, second, at = 0, secondAt, size }) => (
  <div style={{ position: 'absolute', left: MARGIN, top: 84, display: 'flex', flexDirection: 'column', gap: 22 }}>
    <Kicker at={at}>{kicker}</Kicker>
    <Headline first={first} second={second} at={at + 4} secondAt={secondAt} size={size} />
  </div>
);

export const Card = ({ style, children }) => (
  <div
    style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.line}`,
      borderRadius: 18,
      boxShadow: SHADOW,
      ...style,
    }}
  >
    {children}
  </div>
);

/** A pill with an icon, for what a scene wants said in passing. */
export const Chip = ({ icon: Icon, color = COLORS.accent, children, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 20px 12px 16px',
      borderRadius: 999,
      background: COLORS.card,
      border: `1px solid ${COLORS.line}`,
      boxShadow: SHADOW,
      fontFamily: FONT,
      fontSize: 22,
      fontWeight: 560,
      color: COLORS.text,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {Icon ? <Icon size={24} color={color} strokeWidth={2.2} /> : null}
    {children}
  </div>
);

/** The badge of the page that says who publishes a layer: « IGN », « Géorisques ». */
export const Badge = ({ children, tone = 'brand', size = 17 }) => {
  const tones = {
    brand: [COLORS.brandSoft, COLORS.brand],
    accent: [COLORS.accentSoft, COLORS.accentDark],
    warning: [COLORS.warningSoft, COLORS.warning],
    muted: [COLORS.soft, COLORS.muted],
  };
  const [background, color] = tones[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 999,
        background,
        color,
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
};

/** A figure with its label, in a card. */
export const Stat = ({ value, label, color = COLORS.ink, size = 54, style }) => (
  <Card style={{ padding: '18px 26px 20px', ...style }}>
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 760,
        letterSpacing: '-0.03em',
        color,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.05,
        whiteSpace: 'nowrap',
      }}
    >
      {value}
    </div>
    <div
      style={{
        marginTop: 8,
        fontFamily: FONT,
        fontSize: 16,
        fontWeight: 650,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: COLORS.muted,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  </Card>
);
