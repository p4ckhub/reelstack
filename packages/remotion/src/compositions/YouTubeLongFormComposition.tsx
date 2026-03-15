import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import type { YouTubeProps } from '../schemas/youtube-props';
import type { BRollSegment } from '@reelstack/types';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { FullscreenLayout } from '../layouts/FullscreenLayout';
import { SidebarLayout } from '../layouts/SidebarLayout';
import { HorizontalSplitLayout } from '../layouts/HorizontalSplitLayout';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { ProgressBar } from '../components/ProgressBar';
import { BRollCutaway } from '../components/BRollCutaway';
import { PictureInPicture } from '../components/PictureInPicture';
import { LowerThird } from '../components/LowerThird';
import { CtaOverlay } from '../components/CtaOverlay';
import { ZoomEffect } from '../components/ZoomEffect';
import { ChapterCard } from '../components/ChapterCard';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { HighlightBox } from '../components/HighlightBox';

loadOutfit('normal', { weights: ['500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadInter('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] });

const DEFAULT_TRANSITION_MS = 300;

function computeEntrance(
  currentTime: number,
  segment: YouTubeProps['bRollSegments'][number]
): { opacity: number; transform: string; clipPath?: string } {
  const transition = segment.transition ?? {
    type: 'crossfade' as const,
    durationMs: DEFAULT_TRANSITION_MS,
  };
  const type = transition.type ?? 'crossfade';
  const durationSec = (transition.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;

  if (type === 'none') return { opacity: 1, transform: 'none' };

  const progress = interpolate(
    currentTime,
    [segment.startTime, segment.startTime + durationSec],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  switch (type) {
    case 'crossfade':
      return { opacity: progress, transform: 'none' };
    case 'slide-left':
      return { opacity: 1, transform: `translateX(${(1 - progress) * 100}%)` };
    case 'slide-right':
      return { opacity: 1, transform: `translateX(${-(1 - progress) * 100}%)` };
    case 'zoom-in': {
      const scale = interpolate(progress, [0, 1], [1.3, 1]);
      return { opacity: progress, transform: `scale(${scale})` };
    }
    case 'wipe':
      return { opacity: 1, transform: 'none', clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` };
    default:
      return { opacity: progress, transform: 'none' };
  }
}

function OverlayContent({
  segment,
  primaryVideoUrl,
  secondaryVideoUrl,
}: {
  segment: YouTubeProps['bRollSegments'][number];
  primaryVideoUrl?: string;
  secondaryVideoUrl?: string;
}) {
  return <BRollCutaway segment={segment as BRollSegment} />;
}

export const YouTubeLongFormComposition: React.FC<YouTubeProps> = ({
  layout,
  primaryVideoUrl,
  secondaryVideoUrl,
  sidebarPosition = 'right',
  sidebarWidth = 30,
  bRollSegments,
  pipSegments = [],
  lowerThirds = [],
  ctaSegments = [],
  zoomSegments = [],
  chapters = [],
  counters = [],
  highlights = [],
  voiceoverUrl,
  musicUrl,
  musicVolume = 0.15,
  cues,
  captionStyle,
  showProgressBar = false,
  backgroundColor = '#0F0F0F',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const hasBRoll = bRollSegments.length > 0;

  // Active overlay (same single-overlay logic as ReelComposition)
  const activeOverlay = bRollSegments.find(
    (br) => currentTime >= br.startTime && currentTime < br.endTime
  );

  // Held overlay for cross-transitions
  let heldOverlay: (typeof bRollSegments)[number] | null = null;
  if (activeOverlay) {
    const entranceDur = (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
    if (currentTime < activeOverlay.startTime + entranceDur) {
      const found = bRollSegments.find((br) => {
        if (br === activeOverlay) return false;
        return br.endTime <= activeOverlay.startTime && br.endTime > activeOverlay.startTime - 0.1;
      });
      heldOverlay = found ?? null;
    }
  }

  // Exit fade for non-adjacent segments
  let exitingOverlay: (typeof bRollSegments)[number] | null = null;
  let exitOpacity = 1;
  if (!activeOverlay) {
    const EXIT_DURATION = 0.3;
    const found = bRollSegments.find(
      (br) => currentTime >= br.endTime - EXIT_DURATION && currentTime < br.endTime
    );
    if (found) {
      const hasNextAdjacent = bRollSegments.some(
        (br) => br !== found && Math.abs(br.startTime - found.endTime) < 0.1
      );
      if (!hasNextAdjacent) {
        exitingOverlay = found;
        exitOpacity = interpolate(
          currentTime,
          [found.endTime - EXIT_DURATION, found.endTime],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      }
    }
  }

  const activeStyle = activeOverlay ? computeEntrance(currentTime, activeOverlay) : null;

  // Active zoom effect (wraps base layer)
  const activeZoom = zoomSegments.find(
    (z) => currentTime >= z.startTime && currentTime < z.endTime
  );

  // Fullscreen chapter cards replace the entire view
  const activeFullscreenChapter = chapters.find(
    (ch) =>
      currentTime >= ch.startTime &&
      currentTime < ch.endTime &&
      (ch.style ?? 'fullscreen') === 'fullscreen'
  );

  // Base layout renderer
  const renderBase = () => {
    if (layout === 'sidebar') {
      return (
        <SidebarLayout
          mainVideoUrl={primaryVideoUrl}
          webcamVideoUrl={secondaryVideoUrl}
          sidebarPosition={sidebarPosition}
          sidebarWidth={sidebarWidth}
        />
      );
    }
    if (layout === 'horizontal-split') {
      return (
        <HorizontalSplitLayout leftVideoUrl={primaryVideoUrl} rightVideoUrl={secondaryVideoUrl} />
      );
    }
    return <FullscreenLayout primaryVideoUrl={primaryVideoUrl} />;
  };

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* LAYER 0: Base layout */}
      <AbsoluteFill>
        {activeZoom ? <ZoomEffect segment={activeZoom}>{renderBase()}</ZoomEffect> : renderBase()}
      </AbsoluteFill>

      {/* LAYER 2a: Held overlay */}
      {heldOverlay && (
        <AbsoluteFill>
          <OverlayContent
            segment={heldOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 2b: Exiting overlay */}
      {exitingOverlay && (
        <AbsoluteFill style={{ opacity: exitOpacity }}>
          <OverlayContent
            segment={exitingOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 3: Active overlay with entrance transition */}
      {activeOverlay && activeStyle && (
        <AbsoluteFill
          style={{
            opacity: activeStyle.clipPath ? 1 : activeStyle.opacity,
            transform: activeStyle.transform,
            overflow: 'hidden',
            ...(activeStyle.clipPath ? { clipPath: activeStyle.clipPath } : {}),
          }}
        >
          <OverlayContent
            segment={activeOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 4: Picture-in-Picture */}
      {pipSegments.map((seg, i) => (
        <PictureInPicture key={`pip-${i}`} segment={seg} />
      ))}

      {/* LAYER 5: Lower Thirds */}
      {lowerThirds.map((seg, i) => (
        <LowerThird key={`lt-${i}`} segment={seg} />
      ))}

      {/* LAYER 6: Highlight Boxes */}
      {highlights.map((seg, i) => (
        <HighlightBox key={`hl-${i}`} segment={seg} />
      ))}

      {/* LAYER 7: Audio */}
      {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}
      {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}

      {/* LAYER 8: Captions */}
      {cues.length > 0 && <CaptionOverlay cues={cues} style={captionStyle} />}

      {/* LAYER 9: Chapters (overlay style only - fullscreen chapters replace entire view above) */}
      {activeFullscreenChapter && (
        <AbsoluteFill style={{ zIndex: 50 }}>
          <ChapterCard segment={activeFullscreenChapter} />
        </AbsoluteFill>
      )}
      {chapters
        .filter((ch) => (ch.style ?? 'fullscreen') === 'overlay')
        .map((seg, i) => (
          <ChapterCard key={`ch-${i}`} segment={seg} />
        ))}

      {/* LAYER 10: Animated Counters */}
      {counters.map((seg, i) => (
        <AnimatedCounter key={`cnt-${i}`} segment={seg} />
      ))}

      {/* LAYER 11: CTA */}
      {ctaSegments.map((seg, i) => (
        <CtaOverlay key={`cta-${i}`} segment={seg} />
      ))}

      {/* LAYER 12: Progress bar */}
      {showProgressBar && <ProgressBar />}
    </AbsoluteFill>
  );
};
