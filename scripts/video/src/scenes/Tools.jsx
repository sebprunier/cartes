// The four ways to make the same map: the page, the desktop application, the command line — replaying its real
// output — and the API.

import { Braces, Globe, Monitor, Terminal as TerminalIcon } from 'lucide-react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { Field, FieldLabel, StepTitle, Window } from '../components/interface.jsx';
import { figures } from '../components/map.jsx';
import { Appear, Card, SceneTitle } from '../components/ui.jsx';
import { COLORS, CONTENT_TOP, FONT, MARGIN, MONO, progress } from '../theme.js';

const CARD_WIDTH = 854;
const CARD_HEIGHT = 316;
const GAP = 20;
const VISUAL_WIDTH = 540;
const VISUAL_HEIGHT = 272;
const CARD_AT = [14, 40, 66, 92];

const large = figures.estimates.find(({ zoom }) => zoom === 17);

export const Tools = () => (
  <AbsoluteFill>
    <SceneTitle kicker="Les outils" first="La même carte." second="Quatre façons de la faire." />
    <ToolCard
      index={0}
      icon={Globe}
      title="Page web"
      text="Rien à installer : un navigateur suffit. Jusqu'à l'A0, pour la plupart des communes."
    >
      <WebPage />
    </ToolCard>
    <ToolCard
      index={1}
      icon={Monitor}
      title="Application de bureau"
      text="Windows, macOS et Linux. Les très grandes cartes, et le TIFF des imprimeurs."
    >
      <DesktopApp />
    </ToolCard>
    <ToolCard index={2} icon={TerminalIcon} title="Ligne de commande" text="Pour automatiser, ou faire les cartes de plusieurs communes d'un coup.">
      <Terminal />
    </ToolCard>
    <ToolCard index={3} icon={Braces} title="API" text="Pour intégrer cartes à un autre logiciel, sur un serveur que chacun héberge.">
      <Api />
    </ToolCard>
    <Appear at={150} style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1004, textAlign: 'center' }}>
      <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 540, color: COLORS.text }}>
        Toutes produisent exactement la même carte :{' '}
        <span style={{ color: COLORS.accent, fontWeight: 680 }}>elles partagent le même code.</span>
      </div>
    </Appear>
  </AbsoluteFill>
);

const ToolCard = ({ index, icon: Icon, title, text, children }) => {
  const left = MARGIN + (index % 2) * (CARD_WIDTH + GAP);
  const top = CONTENT_TOP + Math.floor(index / 2) * (CARD_HEIGHT + GAP);
  return (
    <Appear at={CARD_AT[index]} style={{ position: 'absolute', left, top }}>
      <Card style={{ width: CARD_WIDTH, height: CARD_HEIGHT, padding: 22, display: 'flex', gap: 22 }}>
        <div style={{ width: 246, flex: 'none', paddingTop: 6 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              display: 'grid',
              placeItems: 'center',
              background: COLORS.accentSoft,
            }}
          >
            <Icon size={28} color={COLORS.accent} strokeWidth={2.1} />
          </div>
          <div style={{ marginTop: 18, fontFamily: FONT, fontSize: 28, fontWeight: 720, letterSpacing: '-0.02em', color: COLORS.ink }}>
            {title}
          </div>
          <div style={{ marginTop: 10, fontFamily: FONT, fontSize: 19, lineHeight: 1.4, color: COLORS.muted }}>{text}</div>
        </div>
        <div style={{ width: VISUAL_WIDTH, height: VISUAL_HEIGHT, position: 'relative' }}>{children}</div>
      </Card>
    </Appear>
  );
};

/** The second step of the page, the zoom going from 15 to 16. */
const WebPage = () => {
  const frame = useCurrentFrame();
  const zoom = frame < CARD_AT[0] + 46 ? '15' : '16';
  const changed = frame >= CARD_AT[0] + 46 && frame < CARD_AT[0] + 70;
  return (
    <Window address="sebprunier.github.io/cartes/generer/" width={VISUAL_WIDTH} height={VISUAL_HEIGHT}>
      <div style={{ padding: '16px 22px', background: COLORS.soft, height: '100%' }}>
        <StepTitle number={2} size={21}>
          Régler la carte
        </StepTitle>
        <div style={{ marginTop: 12 }}>
          <FieldLabel size={14}>Fond de carte</FieldLabel>
          <Field value="Plan IGN v2 (Géoplateforme)" select size={15} height={34} style={{ marginTop: 5 }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel size={14}>Niveau de zoom</FieldLabel>
            <Field value={zoom} select caret={changed} size={15} height={34} style={{ marginTop: 5 }} />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel size={14}>Format du fichier</FieldLabel>
            <Field value="PNG" select size={15} height={34} style={{ marginTop: 5 }} />
          </div>
        </div>
      </div>
    </Window>
  );
};

/** The last step of the application, its lines of progress filling for a map at zoom 17. */
const DesktopApp = () => {
  const frame = useCurrentFrame();
  const start = CARD_AT[1] + 16;
  const tiles = Math.round(large.tiles * progress(frame, start, 90, (t) => t));
  const layer = Math.round(large.tiles * progress(frame, start + 20, 90, (t) => t));
  const dates = progress(frame, start + 6, 30, (t) => t);
  const lines = [
    ['Plan IGN v2 (Géoplateforme)', tiles / large.tiles, tiles < large.tiles ? `${tiles} / ${large.tiles} tuiles` : `${large.tiles} tuiles`],
    ['Parcelles cadastrales', layer / large.tiles, layer < large.tiles ? `${layer} / ${large.tiles} tuiles` : `${large.tiles} tuiles`],
    ['Mention des sources', dates, dates < 1 ? `${Math.round(dates * 3)} / 3 dates` : 'dates lues'],
  ];
  return (
    <Window title="cartes — cartes détaillées des communes de France" width={VISUAL_WIDTH} height={VISUAL_HEIGHT}>
      <div style={{ padding: '16px 22px', background: COLORS.soft, height: '100%' }}>
        <StepTitle number={5} size={21}>
          Générer la carte
        </StepTitle>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lines.map(([name, share, status]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT, fontSize: 14 }}>
              <div style={{ width: 190, color: COLORS.ink, fontWeight: 560, whiteSpace: 'nowrap' }}>{name}</div>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: COLORS.line, overflow: 'hidden' }}>
                <div style={{ width: `${share * 100}%`, height: '100%', background: COLORS.accent }} />
              </div>
              <div
                style={{
                  width: 118,
                  textAlign: 'right',
                  color: share >= 1 ? COLORS.accentDark : COLORS.muted,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
};

/** The command typed, then its real output, line after line, the terminal scrolling as it fills. */
const Terminal = () => {
  const frame = useCurrentFrame();
  const start = CARD_AT[2] + 14;
  const command = figures.cli.command;
  const typed = command.slice(0, Math.max(0, Math.floor((frame - start) * 1.6)));
  const typedAt = start + command.length / 1.6;
  const shown = Math.max(0, Math.floor((frame - typedAt - 6) / 3));
  const output = figures.cli.output.slice(0, shown);
  const lineHeight = 13;
  const visible = Math.floor((VISUAL_HEIGHT - 40 - 20) / lineHeight);
  const scroll = Math.max(0, output.length + 1 - visible) * lineHeight;
  return (
    <Window title="Terminal — zsh" width={VISUAL_WIDTH} height={VISUAL_HEIGHT} dark>
      <div style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 10, lineHeight: `${lineHeight}px`, color: '#c7d2dc' }}>
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          <div style={{ whiteSpace: 'pre', color: '#ffffff', fontWeight: 600 }}>
            <span style={{ color: '#5fd3a0' }}>$ </span>
            {typed}
            {shown === 0 ? <span style={{ display: 'inline-block', width: 6, height: 12, background: '#c7d2dc', verticalAlign: 'middle' }} /> : null}
          </div>
          {output.map((line, index) => (
            <div
              key={index}
              style={{
                whiteSpace: 'pre',
                color: line.startsWith(' →') ? '#5fd3a0' : line.startsWith('Terminé') ? '#ffffff' : undefined,
                fontWeight: line.startsWith('Terminé') ? 700 : 400,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
};

/** A map asked for, followed, then fetched, as the documentation of the API does it. */
const Api = () => {
  const frame = useCurrentFrame();
  const start = CARD_AT[3] + 16;
  const lines = [
    ['#8fb7ff', 'POST /cartes'],
    ['#c7d2dc', '{ "commune": "86081", "zoom": 16, "couches": ["cadastre"] }'],
    ['#5fd3a0', '← 202  { "id": "3f2a…", "statut": "en attente", … }'],
    ['#8fb7ff', 'GET /cartes/3f2a…'],
    ['#5fd3a0', '← 200  { "statut": "terminée", "fichier": "/cartes/3f2a…/fichier" }'],
    ['#8fb7ff', 'GET /cartes/3f2a…/fichier'],
    ['#5fd3a0', '← 86081-colombiers-plan-ign-cadastre-z16.png'],
  ];
  return (
    <Window title="API HTTP — cartes serveur" width={VISUAL_WIDTH} height={VISUAL_HEIGHT} dark>
      <div style={{ padding: '16px 16px', fontFamily: MONO, fontSize: 11.5, lineHeight: '28px' }}>
        {lines.map(([color, text], index) => (
          <div
            key={index}
            style={{
              whiteSpace: 'pre',
              color,
              opacity: progress(frame, start + index * 9, 8),
              transform: `translateX(${interpolate(progress(frame, start + index * 9, 8), [0, 1], [8, 0])}px)`,
            }}
          >
            {text}
          </div>
        ))}
      </div>
    </Window>
  );
};
