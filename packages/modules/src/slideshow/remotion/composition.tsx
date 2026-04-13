import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { CaptionOverlay } from '@reelstack/remotion/components/CaptionOverlay';
import { resolveMediaUrl } from '@reelstack/remotion/utils/resolve-media-url';
import type { SlideshowProps } from './schema';

// ── Ken Burns presets — each slide gets a unique motion ────────────
const KEN_BURNS_PRESETS = [
  { startScale: 1.0, endScale: 1.06, startX: 0, endX: -0.5, startY: 0, endY: -0.3 },
  { startScale: 1.06, endScale: 1.0, startX: -0.4, endX: 0.4, startY: -0.3, endY: 0.3 },
  { startScale: 1.0, endScale: 1.05, startX: 0.3, endX: -0.3, startY: -0.3, endY: 0 },
  { startScale: 1.05, endScale: 1.0, startX: 0, endX: 0, startY: -0.4, endY: 0.3 },
  { startScale: 1.0, endScale: 1.06, startX: -0.3, endX: 0.3, startY: 0, endY: -0.3 },
] as const;

// ── Entrance presets — different entrance per slide ───────────────
type EntranceType = 'fade-scale' | 'slide-up' | 'slide-left' | 'zoom-in' | 'wipe-down';

const ENTRANCE_SEQUENCE: EntranceType[] = [
  'fade-scale', // slide 0: gentle fade + scale
  'slide-up', // slide 1: slides up from bottom
  'zoom-in', // slide 2: zooms from center
  'slide-left', // slide 3: slides from right
  'wipe-down', // slide 4: wipe from top
];

function computeEntrance(
  progress: number, // 0→1
  type: EntranceType
): { opacity: number; transform: string; clipPath?: string } {
  const p = Math.max(0, Math.min(1, progress));

  switch (type) {
    case 'fade-scale':
      return {
        opacity: p,
        transform: `scale(${interpolate(p, [0, 1], [1.04, 1])})`,
      };
    case 'slide-up':
      return {
        opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${(1 - p) * 8}%)`,
      };
    case 'slide-left':
      return {
        opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateX(${(1 - p) * 8}%)`,
      };
    case 'zoom-in':
      return {
        opacity: p,
        transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})`,
      };
    case 'wipe-down':
      return {
        opacity: 1,
        transform: 'none',
        clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`,
      };
  }
}

// ── Slide component ──────────────────────────────────────────────
const SlideImage: React.FC<{
  imageUrl: string;
  transitionDurationMs: number;
  slideIndex: number;
}> = ({ imageUrl, transitionDurationMs, slideIndex }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const transitionFrames = Math.round((transitionDurationMs / 1000) * fps);

  // Entrance animation (varied per slide)
  const entranceType = ENTRANCE_SEQUENCE[slideIndex % ENTRANCE_SEQUENCE.length]!;
  const entranceProgress =
    transitionFrames > 0
      ? spring({
          frame,
          fps,
          config: { damping: 18, stiffness: 80 },
          durationInFrames: transitionFrames,
        })
      : 1;
  const entrance = computeEntrance(entranceProgress, entranceType);

  // Ken Burns: slow zoom + pan
  const kb = KEN_BURNS_PRESETS[slideIndex % KEN_BURNS_PRESETS.length]!;
  const kbProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const eased = 0.5 - Math.cos(kbProgress * Math.PI) / 2;
  const kbScale = interpolate(eased, [0, 1], [kb.startScale, kb.endScale]);
  const kbX = interpolate(eased, [0, 1], [kb.startX, kb.endX]);
  const kbY = interpolate(eased, [0, 1], [kb.startY, kb.endY]);

  const imgTransform = `scale(${kbScale}) translate(${kbX}%, ${kbY}%)`;

  return (
    <AbsoluteFill
      style={{
        opacity: entrance.opacity,
        transform: entrance.transform,
        clipPath: entrance.clipPath,
        overflow: 'hidden',
      }}
    >
      <Img
        src={resolveMediaUrl(imageUrl)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: imgTransform,
          transformOrigin: 'center center',
        }}
      />
    </AbsoluteFill>
  );
};

// ── Progress bar ─────────────────────────────────────────────────
const ProgressBar: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          backgroundColor: color,
          borderRadius: '0 2px 2px 0',
        }}
      />
    </div>
  );
};

// ── Slide counter overlay ────────────────────────────────────────
const SlideCounter: React.FC<{
  current: number;
  total: number;
  accentColor?: string;
}> = ({ current, total, accentColor = '#FFD700' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bounce in on slide change
  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120 },
    durationInFrames: 15,
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        right: 24,
        zIndex: 90,
        transform: `scale(${scale})`,
        opacity: interpolate(scale, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 20,
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span
          style={{ color: accentColor, fontWeight: 700, fontSize: 18, fontFamily: 'sans-serif' }}
        >
          {current}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: 'sans-serif' }}>
          /{total}
        </span>
      </div>
    </div>
  );
};

// ── Main composition ─────────────────────────────────────────────
export const SlideshowComposition: React.FC<SlideshowProps> = (props) => {
  const { fps } = useVideoConfig();
  const {
    slides,
    cues,
    voiceoverUrl,
    musicUrl,
    musicVolume = 0.2,
    backgroundColor = '#000000',
    captionStyle,
  } = props;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Progress bar */}
      <ProgressBar color={captionStyle?.highlightColor ?? '#FFD700'} />

      {/* Slide images with Ken Burns + varied entrances */}
      {slides.map((slide, i) => {
        const startFrame = Math.round(slide.startTime * fps);
        const durationFrames = Math.round((slide.endTime - slide.startTime) * fps);

        return (
          <Sequence key={i} from={startFrame} durationInFrames={durationFrames}>
            <SlideImage
              imageUrl={slide.imageUrl}
              transitionDurationMs={slide.transitionDurationMs}
              slideIndex={i}
            />
            {/* Slide counter with bounce */}
            <SlideCounter
              current={i + 1}
              total={slides.length}
              accentColor={captionStyle?.highlightColor ?? '#FFD700'}
            />
          </Sequence>
        );
      })}

      {/* Caption overlay */}
      <CaptionOverlay cues={cues} style={captionStyle} />

      {/* Voiceover */}
      {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}

      {/* Music */}
      {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}
    </AbsoluteFill>
  );
};
