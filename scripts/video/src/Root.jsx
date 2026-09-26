// The compositions: the whole video, and each scene alone, to look at it or render a still of it.

import { Composition, Folder } from 'remotion';

import { COVER_DURATION, Cover } from './Cover.jsx';
import { Presentation, SCENES, presentationDuration } from './Presentation.jsx';
import { FPS, HEIGHT, WIDTH } from './theme.js';

export const Root = () => (
  <>
    <Composition
      id="Presentation"
      component={Presentation}
      durationInFrames={presentationDuration}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Couverture"
      component={Cover}
      durationInFrames={COVER_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Folder name="Scenes">
      {SCENES.map(({ id, component, duration }) => (
        <Composition
          key={id}
          id={`Scene-${id}`}
          component={component}
          durationInFrames={duration}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      ))}
    </Folder>
  </>
);
