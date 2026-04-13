import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  OffthreadVideo,
  Img,
} from 'remotion';
import type { BRollSegment } from '@reelstack/types';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { TextCardOverlay } from './TextCardOverlay';
import { MultiPanelMontage } from './MultiPanelMontage';

interface KenBurnsPreset {
  startScale: number;
  endScale: number;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
}

/**
 * Auto-generates a Ken Burns animation preset for B-roll images.
 * Uses startTime as a seed so the same segment always gets the same animation.
 * Variety: zoom in, zoom out, pan left, pan right, diagonal drift.
 */
function getAutoKenBurns(startTime: number): KenBurnsPreset {
  const presets: KenBurnsPreset[] = [
    // Slow zoom in (center)
    {
      startScale: 1.0,
      endScale: 1.25,
      startPosition: { x: 50, y: 50 },
      endPosition: { x: 50, y: 50 },
    },
    // Slow zoom out
    {
      startScale: 1.25,
      endScale: 1.0,
      startPosition: { x: 50, y: 50 },
      endPosition: { x: 50, y: 50 },
    },
    // Pan left to right + slight zoom
    {
      startScale: 1.15,
      endScale: 1.2,
      startPosition: { x: 30, y: 50 },
      endPosition: { x: 70, y: 50 },
    },
    // Pan right to left + slight zoom
    {
      startScale: 1.15,
      endScale: 1.2,
      startPosition: { x: 70, y: 50 },
      endPosition: { x: 30, y: 50 },
    },
    // Zoom in top-left to center
    {
      startScale: 1.0,
      endScale: 1.3,
      startPosition: { x: 35, y: 35 },
      endPosition: { x: 50, y: 50 },
    },
    // Zoom in bottom-right to center
    {
      startScale: 1.0,
      endScale: 1.3,
      startPosition: { x: 65, y: 65 },
      endPosition: { x: 50, y: 50 },
    },
    // Diagonal drift (top-left → bottom-right)
    {
      startScale: 1.2,
      endScale: 1.2,
      startPosition: { x: 35, y: 35 },
      endPosition: { x: 65, y: 65 },
    },
    // Diagonal drift (bottom-left → top-right)
    {
      startScale: 1.2,
      endScale: 1.2,
      startPosition: { x: 35, y: 65 },
      endPosition: { x: 65, y: 35 },
    },
  ];

  // Deterministic selection based on startTime
  const index = Math.floor(startTime * 7.3) % presets.length;
  return presets[index];
}

interface BRollCutawayProps {
  readonly segment: BRollSegment;
}

export const BRollCutaway: React.FC<BRollCutawayProps> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(segment.startTime * fps);
  const endFrame = Math.round(segment.endTime * fps);
  const animation = segment.animation ?? 'spring-scale';

  let scale = 1;
  let translateX = 0;
  if (animation === 'spring-scale') {
    const s = spring({
      frame: frame - startFrame,
      fps,
      config: { damping: 15, stiffness: 100 },
    });
    scale = 0.8 + s * 0.2;
  } else if (animation === 'slide') {
    const s = spring({
      frame: frame - startFrame,
      fps,
      config: { damping: 14, stiffness: 120 },
    });
    // Alternate slide direction based on startTime
    const fromRight = Math.floor(segment.startTime * 3) % 2 === 0;
    translateX = (1 - s) * (fromRight ? 100 : -100);
  }

  const media = segment.media;
  const fitMode = segment.objectFit === 'contain' ? 'contain' : 'cover';

  // Ken Burns: interpolate scale + transform-origin over segment duration.
  // AUTO-APPLIED to all images — uses random preset if no explicit config.
  const isImage = media.type === 'image';
  const kb = media.kenBurns;

  // Generate a deterministic "random" preset based on segment start time
  // so the same segment always gets the same animation (no flicker on re-render)
  const autoKb = isImage && !kb ? getAutoKenBurns(segment.startTime) : undefined;
  const activeKb = kb ?? autoKb;
  const hasKenBurns = isImage && activeKb;

  let kbScale = 1;
  let kbOriginX = 50;
  let kbOriginY = 50;
  if (hasKenBurns && activeKb) {
    const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    kbScale = interpolate(progress, [0, 1], [activeKb.startScale ?? 1.0, activeKb.endScale ?? 1.3]);
    const sp = activeKb.startPosition ?? { x: 50, y: 50 };
    const ep = activeKb.endPosition ?? { x: 50, y: 50 };
    kbOriginX = interpolate(progress, [0, 1], [sp.x, ep.x]);
    kbOriginY = interpolate(progress, [0, 1], [sp.y, ep.y]);
  }

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale}) translateX(${translateX}%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: segment.cssFilter ?? undefined,
      }}
    >
      {media.type === 'video' && (
        <Sequence from={startFrame} layout="none">
          <OffthreadVideo
            muted
            src={resolveMediaUrl(media.url)}
            style={{ width: '100%', height: '100%', objectFit: fitMode }}
            startFrom={media.startFrom ? Math.round(media.startFrom * fps) : undefined}
            endAt={media.endAt ? Math.round(media.endAt * fps) : undefined}
          />
        </Sequence>
      )}
      {media.type === 'image' && (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#000' }}>
          <Img
            src={resolveMediaUrl(media.url)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: fitMode,
              ...(hasKenBurns
                ? {
                    transform: `scale(${kbScale})`,
                    transformOrigin: `${kbOriginX}% ${kbOriginY}%`,
                  }
                : {}),
            }}
          />
        </div>
      )}
      {media.type === 'color' && (
        <AbsoluteFill style={{ backgroundColor: media.url }}>
          {media.label && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: 64,
                fontWeight: 'bold',
                color: '#fff',
                fontFamily: 'sans-serif',
              }}
            >
              {media.label}
            </div>
          )}
        </AbsoluteFill>
      )}
      {media.type === 'text-card' && media.textCard && (
        <TextCardOverlay config={media.textCard} startFrame={startFrame} />
      )}
      {media.type === 'multi-panel' && media.panels && (
        <MultiPanelMontage panels={media.panels} startFrame={startFrame} />
      )}
    </AbsoluteFill>
  );
};
