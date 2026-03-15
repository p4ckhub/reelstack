import {
  OffthreadVideo,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { resolveMediaUrl } from '../utils/resolve-media-url';

interface PanelSource {
  url: string;
  type: 'video' | 'image';
}

interface MultiPanelMontageProps {
  /** Array of 2-4 panel sources */
  readonly panels: readonly PanelSource[];
  /** Frame at which this montage segment starts (for stagger offset) */
  readonly startFrame: number;
}

const PANEL_GAP = 3;
const STAGGER_FRAMES = 6; // ~200ms at 30fps — more visible stagger

/**
 * Multi-panel montage: renders 2-4 horizontal strips with staggered
 * spring-scale entrance animations. Each panel slides in from alternating
 * directions with a bouncy spring effect.
 */
export const MultiPanelMontage: React.FC<MultiPanelMontageProps> = ({ panels, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const panelCount = panels.length;

  return (
    <div
      data-testid="multi-panel-montage"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: PANEL_GAP,
        padding: PANEL_GAP,
      }}
    >
      {panels.map((panel, i) => {
        const staggerDelay = i * STAGGER_FRAMES;
        const localFrame = frame - startFrame - staggerDelay;

        const progress = spring({
          frame: Math.max(0, localFrame),
          fps,
          config: { damping: 18, stiffness: 80 }, // slower, more visible spring
        });

        const opacity = interpolate(progress, [0, 1], [0, 1]);

        // Each panel enters from a DIFFERENT direction — always varied within one montage.
        const ENTRANCES = [
          () => {
            const tx = interpolate(progress, [0, 1], [-400, 0]);
            return `translateX(${tx}px)`;
          }, // fly from left
          () => {
            const tx = interpolate(progress, [0, 1], [400, 0]);
            return `translateX(${tx}px)`;
          }, // fly from right
          () => {
            const s = interpolate(progress, [0, 1], [0.15, 1]);
            return `scale(${s})`;
          }, // pop from tiny
          () => {
            const ty = interpolate(progress, [0, 1], [300, 0]);
            return `translateY(${ty}px)`;
          }, // fly from bottom
          () => {
            const ty = interpolate(progress, [0, 1], [-300, 0]);
            return `translateY(${ty}px)`;
          }, // fly from top
        ];
        // Offset by startFrame so different montage shots get different combos
        const offset = Math.floor(startFrame * 0.3) % ENTRANCES.length;
        const transform = ENTRANCES[(i + offset) % ENTRANCES.length]();

        return (
          <div
            key={i}
            style={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
              borderRadius: 4,
              opacity: localFrame < 0 ? 0 : opacity,
              transform,
            }}
          >
            {panel.type === 'video' ? (
              <OffthreadVideo
                muted
                src={resolveMediaUrl(panel.url)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Img
                src={resolveMediaUrl(panel.url)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
