// The thumbnail of the video, for the page that shows it: the end of the dive of the opening, without its words,
// which the page says around it. Rendered as a still, at the frame given here.

import { AbsoluteFill } from 'remotion';

import { Paper } from './components/ui.jsx';
import { Hook } from './scenes/Hook.jsx';

export const VIGNETTE_FRAME = 250;

// The streets around the town hall, the town hall left of the centre, where a player puts its button.
export const Vignette = () => (
  <AbsoluteFill>
    <Paper />
    <Hook bare startScreen={[960, 540]} endScreen={[640, 600]} />
  </AbsoluteFill>
);
