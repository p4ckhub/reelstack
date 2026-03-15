import { useEffectAnimation } from '../hooks/useEffectAnimation';
import type { SubscribeBannerEffect } from '../types';

interface Props {
  readonly segment: SubscribeBannerEffect;
}

export const SubscribeBanner: React.FC<Props> = ({ segment }) => {
  const { visible, style } = useEffectAnimation({
    ...segment,
    entrance: segment.entrance ?? 'slide-up',
    exit: segment.exit ?? 'slide-down',
  });

  if (!visible) return null;

  const {
    channelName,
    backgroundColor = '#FF0000',
    textColor = '#FFFFFF',
    position = 'bottom',
  } = segment;

  return (
    <div
      style={{
        position: 'absolute',
        left: '5%',
        right: '5%',
        ...(position === 'bottom' ? { bottom: '12%' } : { top: '8%' }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '16px 32px',
        backgroundColor,
        borderRadius: 12,
        zIndex: 42,
        pointerEvents: 'none',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        ...style,
      }}
    >
      {/* Bell icon */}
      <span style={{ fontSize: 32 }}>&#x1F514;</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span
          style={{
            color: textColor,
            fontSize: 28,
            fontWeight: 700,
            fontFamily: 'Outfit, sans-serif',
            letterSpacing: '0.02em',
          }}
        >
          {channelName}
        </span>
      </div>
    </div>
  );
};
