// Pieces of the interface of cartes, drawn again as the page draws them: its steps, its fields, its pointer, and
// the windows it opens in.

import { COLORS, FONT, MONO, SHADOW_LARGE } from '../theme.js';

/** The title of a step of the page: its number in a green disc, then its name. */
export const StepTitle = ({ number, children, size = 32 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size * 1.35,
        height: size * 1.35,
        borderRadius: '50%',
        background: COLORS.accentSoft,
        color: COLORS.accentDark,
        fontFamily: FONT,
        fontSize: size * 0.68,
        fontWeight: 700,
      }}
    >
      {number}
    </span>
    <span style={{ fontFamily: FONT, fontSize: size, fontWeight: 700, letterSpacing: '-0.02em', color: COLORS.ink }}>
      {children}
    </span>
  </div>
);

export const FieldLabel = ({ children, size = 21 }) => (
  <div style={{ fontFamily: FONT, fontSize: size, fontWeight: 620, color: COLORS.ink }}>{children}</div>
);

/** A field of the page, with its value, and a caret while it is being typed in. */
export const Field = ({ value, caret = false, select = false, size = 25, height = 64, style }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height,
      padding: '0 22px',
      border: `1.5px solid ${caret ? COLORS.accent : COLORS.lineStrong}`,
      boxShadow: caret ? '0 0 0 4px rgba(21, 129, 79, 0.16)' : 'none',
      borderRadius: 10,
      background: COLORS.card,
      fontFamily: FONT,
      fontSize: size,
      color: COLORS.ink,
      ...style,
    }}
  >
    <span style={{ whiteSpace: 'nowrap' }}>
      {value}
      {caret ? (
        <span
          style={{
            display: 'inline-block',
            width: 2,
            height: size * 1.1,
            marginLeft: 2,
            verticalAlign: 'text-bottom',
            background: COLORS.ink,
          }}
        />
      ) : null}
    </span>
    {select ? (
      <svg width={size * 0.6} height={size * 0.4} viewBox="0 0 12 8">
        <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke={COLORS.text} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ) : null}
  </div>
);

/** The pill of the page that confirms the municipality chosen: « ✓ Colombiers (86081) ». */
export const Chosen = ({ children, size = 24 }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 22px',
      border: `1px solid ${COLORS.accentLine}`,
      borderRadius: 999,
      background: COLORS.accentSoft,
      color: COLORS.accentDark,
      fontFamily: FONT,
      fontSize: size,
      fontWeight: 620,
    }}
  >
    <span>✓</span>
    {children}
  </div>
);

/** The pointer of the mouse, its tip at the top left of the box. */
export const Pointer = ({ x, y, pressed = 0 }) => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 24 24"
    style={{
      position: 'absolute',
      left: x - 6,
      top: y - 3,
      transform: `scale(${1 - 0.14 * pressed})`,
      transformOrigin: '6px 3px',
      filter: 'drop-shadow(0 3px 5px rgba(0, 0, 0, 0.28))',
    }}
  >
    <path
      d="M5.5 3.2 19 12.4l-6.1 1.1 3.6 6.9-2.6 1.4-3.6-6.9L5.9 19z"
      fill="#17232f"
      stroke="#ffffff"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

/** A window of macOS, with its three buttons and its title, or the address bar of a browser. */
export const Window = ({ title, address, width, height, dark = false, children, style }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 14,
      overflow: 'hidden',
      background: dark ? '#141c24' : COLORS.card,
      border: `1px solid ${dark ? '#26313c' : COLORS.line}`,
      boxShadow: SHADOW_LARGE,
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    <div
      style={{
        height: 40,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 14px',
        background: dark ? '#1c2630' : '#f1f3f5',
        borderBottom: `1px solid ${dark ? '#26313c' : COLORS.line}`,
        position: 'relative',
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((color) => (
        <span key={color} style={{ width: 12, height: 12, borderRadius: 6, background: color }} />
      ))}
      {address ? (
        <div
          style={{
            marginLeft: 18,
            flex: 1,
            height: 26,
            borderRadius: 7,
            background: COLORS.card,
            border: `1px solid ${COLORS.line}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 8,
            fontFamily: FONT,
            fontSize: 14,
            color: COLORS.text,
          }}
        >
          <svg width="11" height="13" viewBox="0 0 11 13">
            <rect x="1" y="5.5" width="9" height="7" rx="1.5" fill={COLORS.muted} />
            <path d="M3 5.5V4a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke={COLORS.muted} strokeWidth="1.4" />
          </svg>
          {address}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: dark ? MONO : FONT,
            fontSize: 14,
            fontWeight: 520,
            color: dark ? '#9aa8b5' : COLORS.text,
          }}
        >
          {title}
        </div>
      )}
    </div>
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
  </div>
);
