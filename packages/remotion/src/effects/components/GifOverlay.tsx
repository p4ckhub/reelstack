import { Img } from 'remotion';
import { useEffectAnimation } from '../hooks/useEffectAnimation';
import { resolveMediaUrl } from '../../utils/resolve-media-url';
import type { GifOverlayEffect } from '../types';

interface Props {
  readonly segment: GifOverlayEffect;
}

export const GifOverlay: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation(segment);

  if (!visible) return null;

  const { url, position = { x: 50, y: 50 }, size = 30 } = segment;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        width: `${size}%`,
        zIndex: 28,
        pointerEvents: 'none',
        ...style,
        ...(style.transform ? { transform: `translate(-50%, -50%) ${style.transform}` } : {}),
      }}
    >
      <Img
        src={resolveMediaUrl(url)}
        style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
      />
    </div>
  );
};
