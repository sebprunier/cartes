// The passage from a scene to the next: the one leaves in a blur while the other comes into focus.

import { AbsoluteFill } from 'remotion';

const BlurFade = ({ children, presentationDirection, presentationProgress }) => {
  const entering = presentationDirection === 'entering';
  const shown = entering ? presentationProgress : 1 - presentationProgress;
  const blur = (1 - shown) * 16;
  const scale = entering ? 1.025 - 0.025 * presentationProgress : 1 - 0.02 * presentationProgress;
  return (
    <AbsoluteFill style={{ opacity: shown, filter: blur > 0.1 ? `blur(${blur}px)` : undefined, transform: `scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
};

export const blurFade = () => ({ component: BlurFade, props: {} });
