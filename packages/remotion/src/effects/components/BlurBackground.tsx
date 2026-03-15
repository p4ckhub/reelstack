import { Img } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { BlurBackgroundEffect } from '../types';

interface Props {
  readonly segment: BlurBackgroundEffect;
}

export const BlurBackground: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const {
    blurAmount = 20,
    overlayUrl,
    overlayText,
    overlayFontSize = 64,
    overlayColor = '#FFFFFF',
    mode = 'blur',
    focusPoint = { x: 50, y: 50 },
    spotlightRadius = 20,
  } = segment;

  const isSpotlight = mode === 'spotlight';

  return (
    <>
      {/* Blur / Spotlight overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          ...(isSpotlight
            ? {
                background: `radial-gradient(circle at ${focusPoint.x}% ${focusPoint.y}%, transparent ${spotlightRadius}%, rgba(0,0,0,0.7) ${spotlightRadius + 5}%)`,
              }
            : {
                backdropFilter: `blur(${blurAmount}px)`,
                backgroundColor: 'rgba(0,0,0,0.3)',
              }),
          zIndex: 2,
          pointerEvents: 'none',
          ...style,
        }}
      />

      {/* Center content */}
      {(overlayUrl || overlayText) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3,
            pointerEvents: 'none',
            ...style,
          }}
        >
          {overlayUrl ? (
            <Img
              src={resolveMediaUrl(overlayUrl)}
              style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }}
            />
          ) : overlayText ? (
            <div
              style={{
                fontSize: overlayFontSize,
                fontWeight: 900,
                fontFamily: 'Outfit, sans-serif',
                color: overlayColor,
                textAlign: 'center',
                textShadow: '0 4px 24px rgba(0,0,0,0.5)',
                padding: '0 10%',
              }}
            >
              {overlayText}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
};
