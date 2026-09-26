// The video: the scenes one after the other, each passing into the next through a blur.

import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { AbsoluteFill } from 'remotion';

import { Paper } from './components/ui.jsx';
import { Commune } from './scenes/Commune.jsx';
import { Data } from './scenes/Data.jsx';
import { End } from './scenes/End.jsx';
import { Hook } from './scenes/Hook.jsx';
import { Layers } from './scenes/Layers.jsx';
import { Print } from './scenes/Print.jsx';
import { Recap } from './scenes/Recap.jsx';
import { Sources } from './scenes/Sources.jsx';
import { Title } from './scenes/Title.jsx';
import { Tools } from './scenes/Tools.jsx';
import { EASE_IN_OUT } from './theme.js';
import { blurFade } from './transitions.jsx';

const TRANSITION = 18;

/** Each scene with its duration in frames, transition into the next included. */
export const SCENES = [
  { id: 'accroche', component: Scene(Hook), duration: 285 },
  { id: 'titre', component: Scene(Title), duration: 135 },
  { id: 'commune', component: Scene(Commune), duration: 225 },
  { id: 'impression', component: Scene(Print), duration: 285 },
  { id: 'couches', component: Scene(Layers), duration: 315 },
  { id: 'donnees', component: Scene(Data), duration: 315 },
  { id: 'sources', component: Scene(Sources), duration: 165 },
  { id: 'outils', component: Scene(Tools), duration: 285 },
  { id: 'recapitulatif', component: Scene(Recap), duration: 165 },
  { id: 'fin', component: Scene(End), duration: 240 },
];

export const presentationDuration =
  SCENES.reduce((total, { duration }) => total + duration, 0) - TRANSITION * (SCENES.length - 1);

/** A scene on its paper, as its composition shows it alone. */
function Scene(Component) {
  const WithPaper = () => (
    <AbsoluteFill>
      <Paper />
      <Component />
    </AbsoluteFill>
  );
  WithPaper.Inner = Component;
  return WithPaper;
}

export const Presentation = () => (
  <AbsoluteFill>
    <Paper />
    <TransitionSeries>
      {SCENES.flatMap(({ id, component, duration }, index) => [
        ...(index > 0
          ? [
              <TransitionSeries.Transition
                key={`${id}-transition`}
                presentation={blurFade()}
                timing={linearTiming({ durationInFrames: TRANSITION, easing: EASE_IN_OUT })}
              />,
            ]
          : []),
        <TransitionSeries.Sequence key={id} durationInFrames={duration}>
          <component.Inner />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);
