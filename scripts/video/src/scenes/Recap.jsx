// What the tool does, in twelve tiles.

import {
  BadgeCheck,
  Code,
  FileSpreadsheet,
  Layers,
  LandPlot,
  Lock,
  Map,
  MapPin,
  Printer,
  ScanSearch,
  TriangleAlert,
  Waypoints,
} from 'lucide-react';
import { AbsoluteFill } from 'remotion';

import { Appear, Card, Headline } from '../components/ui.jsx';
import { COLORS, FONT } from '../theme.js';

const TILES = [
  [Map, 'Plan IGN et photos aériennes', "Jusqu'au zoom 19"],
  [LandPlot, 'Cadastre et PLU', 'Parcelles, zonage, prescriptions'],
  [TriangleAlert, 'Risques', 'Argiles, inondation, cavités…'],
  [FileSpreadsheet, 'Vos données', 'GeoJSON ou CSV, avec leur légende'],
  [MapPin, 'Géocodage', "Une liste d'adresses suffit"],
  [Layers, 'Vos couches', "Par l'adresse de leurs tuiles, ou en WMS"],
  [ScanSearch, "Aperçu à l'échelle réelle", 'Avant de lancer la génération'],
  [Printer, 'Grand format', "De l'A3 à l'affiche, TIFF compris"],
  [BadgeCheck, 'Sources et dates', 'Écrites sur la carte'],
  [Lock, 'Sans compte', 'Vos fichiers restent chez vous'],
  [Waypoints, 'Quatre outils', 'Page web, application, commande, API'],
  [Code, 'Libre', 'Code ouvert, licence MIT'],
];

const COLUMNS = 4;
const TILE_WIDTH = 404;
const TILE_HEIGHT = 176;
const GAP = 20;
const LEFT = (1920 - (COLUMNS * TILE_WIDTH + (COLUMNS - 1) * GAP)) / 2;
const TOP = 350;

export const Recap = () => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 112 }}>
      <Headline first="Toute votre commune," second="sur une seule carte." align="center" size={76} />
    </div>
    {TILES.map(([Icon, title, text], index) => (
      <Appear
        key={title}
        at={14 + index * 3}
        y={22}
        style={{
          position: 'absolute',
          left: LEFT + (index % COLUMNS) * (TILE_WIDTH + GAP),
          top: TOP + Math.floor(index / COLUMNS) * (TILE_HEIGHT + GAP),
        }}
      >
        <Card style={{ width: TILE_WIDTH, height: TILE_HEIGHT, padding: '24px 26px', borderRadius: 16 }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 13,
              display: 'grid',
              placeItems: 'center',
              background: index % 3 === 1 ? COLORS.brandSoft : COLORS.accentSoft,
            }}
          >
            <Icon size={26} color={index % 3 === 1 ? COLORS.brand : COLORS.accent} strokeWidth={2.1} />
          </div>
          <div style={{ marginTop: 16, fontFamily: FONT, fontSize: 24, fontWeight: 700, letterSpacing: '-0.015em', color: COLORS.ink }}>
            {title}
          </div>
          <div style={{ marginTop: 6, fontFamily: FONT, fontSize: 18, color: COLORS.muted, whiteSpace: 'nowrap' }}>{text}</div>
        </Card>
      </Appear>
    ))}
  </AbsoluteFill>
);
