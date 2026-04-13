import {
  AbsoluteFill,
  Audio,
  Sequence,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadUbuntu } from '@remotion/google-fonts/Ubuntu';
import type { ReelProps } from '../schemas/reel-props';
import type { BRollSegment } from '@reelstack/types';
import { resolveMediaUrl } from '../utils/resolve-media-url';
import { SplitScreenLayout } from '../layouts/SplitScreenLayout';
import { FullscreenLayout } from '../layouts/FullscreenLayout';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { ProgressBar } from '../components/ProgressBar';
import { BRollCutaway } from '../components/BRollCutaway';
import { PictureInPicture } from '../components/PictureInPicture';
import { LowerThird } from '../components/LowerThird';
import { CtaOverlay } from '../components/CtaOverlay';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { ZoomEffect } from '../components/ZoomEffect';
import { HighlightBox } from '../components/HighlightBox';
import { MultiPanelMontage } from '../components/MultiPanelMontage';
import { ScrollStopper, useScrollStopperTransform } from '../components/ScrollStopper';
import { LogoOverlay } from '../components/LogoOverlay';
import { sfxIdToUrl } from '../schemas/catalog';
import { getEffect } from '../effects';

// anchor-bottom layout constants
const ANCHOR_BOTTOM_HEAD_PCT = 45; // % of height for talking head (bottom)
const ANCHOR_BOTTOM_CONTENT_PCT = 55; // % of height for dynamic content area (top)
const ANCHOR_BOTTOM_CONTENT_BORDER_RADIUS = 16; // px

// Load all fonts used by caption presets and templates, with Polish character support
loadOutfit('normal', { weights: ['500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadMontserrat('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
});
loadPoppins('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
loadRoboto('normal', { weights: ['400', '500', '700'], subsets: ['latin', 'latin-ext'] });
loadUbuntu('normal', { weights: ['400', '500', '700'], subsets: ['latin', 'latin-ext'] });

const DEFAULT_TRANSITION_MS = 300;

/**
 * Entrance-only transition: computes how far the overlay has entered.
 * No exit animation - overlays stay at opacity 1 until replaced or hard-cut.
 */
function computeEntrance(
  currentTime: number,
  segment: ReelProps['bRollSegments'][number]
): { opacity: number; transform: string; clipPath?: string; filter?: string } {
  const transition = segment.transition ?? {
    type: 'crossfade' as const,
    durationMs: DEFAULT_TRANSITION_MS,
  };
  const type = transition.type ?? 'crossfade';
  const durationSec = (transition.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;

  if (type === 'none') {
    return { opacity: 1, transform: 'none' };
  }

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
    case 'slide-perspective-right': {
      // Card slides from the right with 3D perspective — left edge closer, right edge recedes into depth.
      const tx = interpolate(progress, [0, 1], [100, 0]);
      const rotY = interpolate(progress, [0, 1], [-22, 0]);
      return { opacity: 1, transform: `perspective(900px) translateX(${tx}%) rotateY(${rotY}deg)` };
    }
    case 'wipe':
      return { opacity: 1, transform: 'none', clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` };
    case 'blur-dissolve': {
      const blur = interpolate(progress, [0, 0.5, 1], [20, 10, 0]);
      return { opacity: progress, transform: 'none', filter: `blur(${blur}px)` };
    }
    case 'flash-white':
      // White flash spike at midpoint, then reveal
      if (progress < 0.5) {
        return { opacity: 0, transform: 'none' };
      }
      return { opacity: 1, transform: 'none' };
    case 'whip-pan': {
      const tx = interpolate(progress, [0, 1], [120, 0]);
      const blur = interpolate(progress, [0, 0.5, 1], [15, 8, 0]);
      return { opacity: 1, transform: `translateX(${tx}%)`, filter: `blur(${blur}px)` };
    }
    case 'cross-zoom': {
      const scale = interpolate(progress, [0, 0.4, 1], [2, 1.2, 1]);
      const blur = interpolate(progress, [0, 0.4, 1], [12, 4, 0]);
      return { opacity: progress, transform: `scale(${scale})`, filter: `blur(${blur}px)` };
    }
    case 'iris-circle':
      return {
        opacity: 1,
        transform: 'none',
        clipPath: `circle(${progress * 100}% at 50% 50%)`,
      };
    case 'spin': {
      const rot = interpolate(progress, [0, 1], [180, 0]);
      const scale = interpolate(progress, [0, 0.5, 1], [0.3, 0.8, 1]);
      return { opacity: progress, transform: `rotate(${rot}deg) scale(${scale})` };
    }
    case 'morph-to-pip': {
      // Start as small circle in bottom-right, expand to fullscreen
      const scale = interpolate(progress, [0, 1], [0.25, 1]);
      const borderRadius = interpolate(progress, [0, 1], [50, 0]); // 50% = circle, 0 = rectangle
      const translateX = interpolate(progress, [0, 1], [35, 0]); // % offset from center
      const translateY = interpolate(progress, [0, 1], [35, 0]);
      return {
        opacity: 1,
        transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
        clipPath: `inset(0 round ${borderRadius}%)`,
      };
    }
    default:
      return { opacity: progress, transform: 'none' };
  }
}

/**
 * Renders overlay content based on media type.
 */
function OverlayContent({
  segment,
  primaryVideoUrl,
  secondaryVideoUrl,
}: {
  segment: ReelProps['bRollSegments'][number];
  primaryVideoUrl?: string;
  secondaryVideoUrl?: string;
}) {
  return <BRollCutaway segment={segment as BRollSegment} />;
}

export const ReelComposition: React.FC<ReelProps> = ({
  layout,
  primaryVideoUrl,
  primaryVideoDurationSeconds,
  primaryVideoObjectPosition = 'center',
  secondaryVideoUrl,
  primaryVideoTransparent = false,
  bRollSegments,
  pipSegments = [],
  lowerThirds = [],
  ctaSegments = [],
  counters = [],
  zoomSegments = [],
  highlights = [],
  speedRamps = [],
  effects = [],
  sfxSegments = [],
  voiceoverUrl,
  musicUrl,
  musicVolume = 0.3,
  cues,
  captionStyle,
  dynamicCaptionPosition = false,
  showProgressBar = true,
  backgroundColor = '#000000',
  scrollStopper,
  logoOverlay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Looped primary video element for anchor/split layouts
  const renderPrimaryVideo = () => {
    if (!primaryVideoUrl) {
      return <div style={{ width: '100%', height: '100%', backgroundColor: '#0a0a14' }} />;
    }
    return (
      <OffthreadVideo
        muted
        src={resolveMediaUrl(primaryVideoUrl)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: primaryVideoObjectPosition,
        }}
      />
    );
  };

  const hasBRoll = bRollSegments.length > 0;

  // The ONE active overlay at current time
  const activeOverlay = bRollSegments.find(
    (br) => currentTime >= br.startTime && currentTime < br.endTime
  );

  // When transitioning between adjacent segments, keep the previous overlay
  // visible underneath the incoming one. This prevents the base layer from
  // flashing through during the entrance transition.
  let heldOverlay: (typeof bRollSegments)[number] | null = null;
  if (activeOverlay) {
    const entranceDur = (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
    const inEntrance = currentTime < activeOverlay.startTime + entranceDur;
    if (inEntrance) {
      const found = bRollSegments.find((br) => {
        if (br === activeOverlay) return false;
        // Segment ended right when active started (adjacent, within 100ms tolerance)
        return br.endTime <= activeOverlay.startTime && br.endTime > activeOverlay.startTime - 0.1;
      });
      heldOverlay = found ?? null;
    }
  }

  // Exit fade: when an overlay ends and there's NO next adjacent segment,
  // apply a gentle crossfade out to the base layer.
  let exitingOverlay: (typeof bRollSegments)[number] | null = null;
  let exitOpacity = 1;
  if (!activeOverlay) {
    const EXIT_DURATION = 0.3; // seconds
    const found = bRollSegments.find((br) => {
      return currentTime >= br.endTime - EXIT_DURATION && currentTime < br.endTime;
    });
    if (found) {
      // Check if there's a next adjacent segment (if so, no exit fade needed)
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

  // Dynamic caption positioning: when enabled, captions move up for
  // split-screen/B-roll, smoothly transitioning in sync with overlay entrance/exit.
  let dynamicCaptionStyle = captionStyle;
  if (dynamicCaptionPosition && captionStyle) {
    const basePosition = captionStyle.position ?? 80;
    const positionForOverlayType = (type: string | undefined): number => {
      if (!type) return basePosition; // no overlay — presenter only
      if (type === 'split-screen') return Math.max(basePosition - 15, 50);
      // Fullscreen content (B-roll/image) — move captions higher to avoid overlap
      return Math.max(basePosition - 12, 55);
    };

    let captionPosition = positionForOverlayType(undefined);
    if (activeOverlay) {
      const from = positionForOverlayType(heldOverlay?.media.type);
      const target = positionForOverlayType(activeOverlay.media.type);
      const transitionSec = (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
      const progress = interpolate(
        currentTime,
        [activeOverlay.startTime, activeOverlay.startTime + transitionSec],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
      captionPosition = interpolate(progress, [0, 1], [from, target]);
    } else if (exitingOverlay) {
      const from = positionForOverlayType(exitingOverlay.media.type);
      const target = positionForOverlayType(undefined);
      captionPosition = interpolate(exitOpacity, [1, 0], [from, target]);
    }
    dynamicCaptionStyle = { ...captionStyle, position: captionPosition };
  }

  // Active zoom segment
  const activeZoom = zoomSegments.find(
    (z) => currentTime >= z.startTime && currentTime < z.endTime
  );

  // Scroll-stopper content transform (zoom/shake in first frames)
  const scrollStopperTransform = useScrollStopperTransform(
    scrollStopper as { preset: any; durationSeconds?: number } | undefined
  );

  // Transparent avatar: primary video is an overlay, b-roll fills the background.
  // Opaque avatar: primary video IS the background (standard behavior).
  const renderTransparentAvatarOverlay = () => {
    if (!primaryVideoTransparent || !primaryVideoUrl) return null;
    return (
      <AbsoluteFill style={{ zIndex: 2 }}>
        <OffthreadVideo
          muted
          src={resolveMediaUrl(primaryVideoUrl)}
          transparent
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: primaryVideoObjectPosition,
          }}
        />
      </AbsoluteFill>
    );
  };

  const baseContent =
    layout === 'split-screen' ? (
      <SplitScreenLayout primaryVideoUrl={primaryVideoUrl} secondaryVideoUrl={secondaryVideoUrl} />
    ) : primaryVideoTransparent ? (
      // Background = black (b-roll overlays will cover it)
      <AbsoluteFill style={{ backgroundColor }} />
    ) : (
      <FullscreenLayout
        primaryVideoUrl={primaryVideoUrl}
        primaryVideoDurationSeconds={primaryVideoDurationSeconds}
        speedRamps={speedRamps}
      />
    );

  // ── hybrid-anchor layout ─────────────────────────────────────────────────────
  // Switches between 4 shot types per-segment based on shotLayout:
  //   'head' (default)  — fullscreen presenter (primary video fills screen)
  //   'content'         — fullscreen b-roll (covers primary video)
  //   'split'           — anchor-bottom split (head 45% bottom, content 55% top)
  //   'montage'         — multi-panel montage over dimmed background
  // Legacy values: 'anchor' → 'head', 'fullscreen' → 'content'
  if (layout === 'hybrid-anchor') {
    const activeSegment = bRollSegments.find(
      (seg) => currentTime >= seg.startTime && currentTime < seg.endTime
    );

    // Normalize legacy shotLayout values
    const rawShotLayout = activeSegment
      ? (activeSegment as Record<string, unknown>).shotLayout
      : undefined;
    const normalizedShotLayout =
      rawShotLayout === 'anchor'
        ? 'head'
        : rawShotLayout === 'fullscreen'
          ? 'content'
          : (rawShotLayout as 'head' | 'content' | 'split' | 'montage' | undefined);
    const shotLayout = normalizedShotLayout ?? 'head';

    const hybridBase = (
      <FullscreenLayout
        primaryVideoUrl={primaryVideoUrl}
        primaryVideoDurationSeconds={primaryVideoDurationSeconds}
        speedRamps={speedRamps}
      />
    );

    // Helper: renders b-roll overlay layers (held + active with entrance transition)
    const renderBRollOverlay = () => (
      <>
        {heldOverlay && (
          <AbsoluteFill style={{ opacity: exitOpacity }}>
            <OverlayContent
              segment={heldOverlay}
              primaryVideoUrl={primaryVideoUrl}
              secondaryVideoUrl={secondaryVideoUrl}
            />
          </AbsoluteFill>
        )}
        {activeOverlay && activeStyle && (
          <AbsoluteFill
            style={{
              opacity: activeStyle.clipPath ? 1 : activeStyle.opacity,
              transform: activeStyle.transform,
              overflow: 'hidden',
              ...(activeStyle.clipPath ? { clipPath: activeStyle.clipPath } : {}),
              ...(activeStyle.filter ? { filter: activeStyle.filter } : {}),
            }}
          >
            <OverlayContent
              segment={activeOverlay}
              primaryVideoUrl={primaryVideoUrl}
              secondaryVideoUrl={secondaryVideoUrl}
            />
          </AbsoluteFill>
        )}
      </>
    );

    // Helper: renders flash-white transition effect
    const renderFlashWhite = () => {
      if (!activeOverlay || activeOverlay.transition?.type !== 'flash-white') return null;
      const transitionDur = (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
      const flashProgress = interpolate(
        currentTime,
        [activeOverlay.startTime, activeOverlay.startTime + transitionDur],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
      const flashOpacity =
        flashProgress < 0.5
          ? interpolate(flashProgress, [0, 0.5], [0, 1])
          : interpolate(flashProgress, [0.5, 1], [1, 0]);
      return flashOpacity > 0 ? (
        <AbsoluteFill
          style={{
            backgroundColor: '#FFFFFF',
            opacity: flashOpacity,
            pointerEvents: 'none',
          }}
        />
      ) : null;
    };

    return (
      <AbsoluteFill style={{ backgroundColor, ...scrollStopperTransform, overflow: 'hidden' }}>
        {/* LAYER 0: Base (primary video) */}
        {activeZoom ? <ZoomEffect segment={activeZoom}>{hybridBase}</ZoomEffect> : hybridBase}

        {/* LAYER 1: Shot-type-specific content */}
        {shotLayout === 'content' && (
          <>
            {renderBRollOverlay()}
            {renderFlashWhite()}
          </>
        )}

        {shotLayout === 'split' && (
          <>
            {/* Anchor-bottom split: head at bottom 45%, content at top 55% */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: `${ANCHOR_BOTTOM_HEAD_PCT}%`,
                overflow: 'hidden',
              }}
            >
              {renderPrimaryVideo()}
            </div>
            <div
              data-testid="hybrid-split-content"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: `${ANCHOR_BOTTOM_CONTENT_PCT}%`,
                overflow: 'hidden',
                borderRadius: `0 0 ${ANCHOR_BOTTOM_CONTENT_BORDER_RADIUS}px ${ANCHOR_BOTTOM_CONTENT_BORDER_RADIUS}px`,
                backgroundColor: '#000000',
              }}
            >
              {heldOverlay && (
                <AbsoluteFill>
                  <OverlayContent
                    segment={heldOverlay}
                    primaryVideoUrl={primaryVideoUrl}
                    secondaryVideoUrl={secondaryVideoUrl}
                  />
                </AbsoluteFill>
              )}
              {activeOverlay && activeStyle && (
                <AbsoluteFill
                  style={{
                    opacity: activeStyle.clipPath ? 1 : activeStyle.opacity,
                    transform: activeStyle.transform,
                    overflow: 'hidden',
                    ...(activeStyle.clipPath ? { clipPath: activeStyle.clipPath } : {}),
                    ...(activeStyle.filter ? { filter: activeStyle.filter } : {}),
                  }}
                >
                  <OverlayContent
                    segment={activeOverlay}
                    primaryVideoUrl={primaryVideoUrl}
                    secondaryVideoUrl={secondaryVideoUrl}
                  />
                </AbsoluteFill>
              )}
            </div>
          </>
        )}

        {shotLayout === 'montage' && activeOverlay && (
          <>
            {/* Dark overlay on base video */}
            <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} />
            {/* Multi-panel montage or fallback to single media fullscreen */}
            {activeOverlay.media.panels && activeOverlay.media.panels.length >= 2 ? (
              <MultiPanelMontage
                panels={activeOverlay.media.panels}
                startFrame={Math.round(activeOverlay.startTime * fps)}
              />
            ) : (
              <AbsoluteFill>
                <OverlayContent
                  segment={activeOverlay}
                  primaryVideoUrl={primaryVideoUrl}
                  secondaryVideoUrl={secondaryVideoUrl}
                />
              </AbsoluteFill>
            )}
          </>
        )}

        {/* head mode: no overlay — primary video stays fullscreen */}

        {/* LAYER 3: PiP, Lower Thirds, Highlights */}
        {pipSegments.map((seg, i) => (
          <PictureInPicture key={`pip-${i}`} segment={seg} />
        ))}
        {lowerThirds.map((seg, i) => (
          <LowerThird key={`lt-${i}`} segment={seg} />
        ))}
        {highlights.map((seg, i) => (
          <HighlightBox key={`hl-${i}`} segment={seg} />
        ))}

        {/* LAYER 6: Audio */}
        {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}
        {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}
        {/* SFX segments */}
        {sfxSegments.map((sfx, i) => (
          <Sequence
            key={`sfx-${i}`}
            from={Math.round(sfx.startTime * fps)}
            durationInFrames={Math.round(1.5 * fps)}
          >
            <Audio src={resolveMediaUrl(sfxIdToUrl(sfx.sfxId))} volume={sfx.volume ?? 0.7} />
          </Sequence>
        ))}
        {/* SFX segments */}
        {sfxSegments.map((sfx, i) => (
          <Sequence
            key={`sfx-${i}`}
            from={Math.round(sfx.startTime * fps)}
            durationInFrames={Math.round(1.5 * fps)}
          >
            <Audio src={resolveMediaUrl(sfxIdToUrl(sfx.sfxId))} volume={sfx.volume ?? 0.7} />
          </Sequence>
        ))}

        {/* LAYER 7: Captions */}
        {cues.length > 0 && <CaptionOverlay cues={cues} style={dynamicCaptionStyle} />}

        {/* LAYER 8+: Counters, CTAs, Effects, SFX, Progress */}
        {counters.map((seg, i) => (
          <AnimatedCounter key={`counter-${i}`} segment={seg} />
        ))}
        {ctaSegments.map((seg, i) => (
          <CtaOverlay key={`cta-${i}`} segment={seg} />
        ))}
        {[...effects]
          .sort((a, b) => (getEffect(a.type)?.layer ?? 50) - (getEffect(b.type)?.layer ?? 50))
          .map((effect, i) => {
            const plugin = getEffect(effect.type);
            if (!plugin) return null;
            const Component = plugin.component;
            return <Component key={`fx-${effect.type}-${i}`} segment={effect as never} />;
          })}
        {effects
          .filter((e) => e.sfx?.url)
          .map((e, i) => (
            <Audio
              key={`sfx-${i}`}
              src={resolveMediaUrl(e.sfx!.url)}
              volume={e.sfx!.volume ?? 0.8}
              startFrom={Math.round(e.startTime * fps)}
            />
          ))}
        {showProgressBar && <ProgressBar />}
        {logoOverlay && <LogoOverlay config={logoOverlay} />}
        {scrollStopper && scrollStopper.preset !== 'none' && (
          <ScrollStopper
            preset={scrollStopper.preset}
            durationSeconds={scrollStopper.durationSeconds}
          />
        )}
      </AbsoluteFill>
    );
  }

  // ── anchor-bottom layout ────────────────────────────────────────────────────
  // Talking head occupies the bottom 45 % of the screen permanently.
  // The top 55 % is a dynamic content area showing B-roll segments with
  // entrance transitions and rounded-card styling.
  // Captions are pinned to the boundary between the two areas.
  if (layout === 'anchor-bottom') {
    return (
      <AbsoluteFill style={{ backgroundColor, ...scrollStopperTransform, overflow: 'hidden' }}>
        {/* ── BOTTOM: talking head (always visible, looped) ── */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${ANCHOR_BOTTOM_HEAD_PCT}%`,
            overflow: 'hidden',
          }}
        >
          {renderPrimaryVideo()}
        </div>

        {/* ── TOP: dynamic content area (B-roll segments) ── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${ANCHOR_BOTTOM_CONTENT_PCT}%`,
            overflow: 'hidden',
            borderRadius: `0 0 ${ANCHOR_BOTTOM_CONTENT_BORDER_RADIUS}px ${ANCHOR_BOTTOM_CONTENT_BORDER_RADIUS}px`,
            backgroundColor: '#000000',
          }}
        >
          {/* Held overlay (keeps previous segment visible during incoming transition) */}
          {heldOverlay && (
            <AbsoluteFill>
              <OverlayContent
                segment={heldOverlay}
                primaryVideoUrl={primaryVideoUrl}
                secondaryVideoUrl={secondaryVideoUrl}
              />
            </AbsoluteFill>
          )}

          {/* Exiting overlay (gentle fade-out when no adjacent segment follows) */}
          {exitingOverlay && (
            <AbsoluteFill style={{ opacity: exitOpacity }}>
              <OverlayContent
                segment={exitingOverlay}
                primaryVideoUrl={primaryVideoUrl}
                secondaryVideoUrl={secondaryVideoUrl}
              />
            </AbsoluteFill>
          )}

          {/* Active overlay with entrance transition */}
          {activeOverlay && activeStyle && (
            <AbsoluteFill
              style={{
                opacity: activeStyle.clipPath ? 1 : activeStyle.opacity,
                transform: activeStyle.transform,
                overflow: 'hidden',
                ...(activeStyle.clipPath ? { clipPath: activeStyle.clipPath } : {}),
                ...(activeStyle.filter ? { filter: activeStyle.filter } : {}),
              }}
            >
              <OverlayContent
                segment={activeOverlay}
                primaryVideoUrl={primaryVideoUrl}
                secondaryVideoUrl={secondaryVideoUrl}
              />
            </AbsoluteFill>
          )}

          {/* Flash-white overlay for flash-white transition (confined to content area) */}
          {activeOverlay &&
            activeOverlay.transition?.type === 'flash-white' &&
            (() => {
              const transitionDur =
                (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
              const flashProgress = interpolate(
                currentTime,
                [activeOverlay.startTime, activeOverlay.startTime + transitionDur],
                [0, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
              );
              const flashOpacity =
                flashProgress < 0.5
                  ? interpolate(flashProgress, [0, 0.5], [0, 1])
                  : interpolate(flashProgress, [0.5, 1], [1, 0]);
              return flashOpacity > 0 ? (
                <AbsoluteFill
                  style={{
                    backgroundColor: '#FFFFFF',
                    opacity: flashOpacity,
                    pointerEvents: 'none',
                  }}
                />
              ) : null;
            })()}
        </div>

        {/* LAYER 3: Picture-in-Picture */}
        {pipSegments.map((seg, i) => (
          <PictureInPicture key={`pip-${i}`} segment={seg} />
        ))}

        {/* LAYER 4: Lower Thirds */}
        {lowerThirds.map((seg, i) => (
          <LowerThird key={`lt-${i}`} segment={seg} />
        ))}

        {/* LAYER 5: Highlight Boxes */}
        {highlights.map((seg, i) => (
          <HighlightBox key={`hl-${i}`} segment={seg} />
        ))}

        {/* LAYER 6: Audio tracks */}
        {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}
        {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}
        {/* SFX segments */}
        {sfxSegments.map((sfx, i) => (
          <Sequence
            key={`sfx-${i}`}
            from={Math.round(sfx.startTime * fps)}
            durationInFrames={Math.round(1.5 * fps)}
          >
            <Audio src={resolveMediaUrl(sfxIdToUrl(sfx.sfxId))} volume={sfx.volume ?? 0.7} />
          </Sequence>
        ))}
        {/* SFX segments */}
        {sfxSegments.map((sfx, i) => (
          <Sequence
            key={`sfx-${i}`}
            from={Math.round(sfx.startTime * fps)}
            durationInFrames={Math.round(1.5 * fps)}
          >
            <Audio src={resolveMediaUrl(sfxIdToUrl(sfx.sfxId))} volume={sfx.volume ?? 0.7} />
          </Sequence>
        ))}

        {/* LAYER 7: Animated captions — pinned near the boundary between areas */}
        {cues.length > 0 && (
          <CaptionOverlay
            cues={cues}
            style={
              dynamicCaptionStyle
                ? {
                    ...dynamicCaptionStyle,
                    position: dynamicCaptionStyle.position ?? ANCHOR_BOTTOM_CONTENT_PCT,
                  }
                : dynamicCaptionStyle
            }
          />
        )}

        {/* LAYER 8: Animated counters */}
        {counters.map((seg, i) => (
          <AnimatedCounter key={`counter-${i}`} segment={seg} />
        ))}

        {/* LAYER 9: CTA overlays */}
        {ctaSegments.map((seg, i) => (
          <CtaOverlay key={`cta-${i}`} segment={seg} />
        ))}

        {/* LAYER: Plugin effects (sorted by layer number) */}
        {[...effects]
          .sort((a, b) => (getEffect(a.type)?.layer ?? 50) - (getEffect(b.type)?.layer ?? 50))
          .map((effect, i) => {
            const plugin = getEffect(effect.type);
            if (!plugin) return null;
            const Component = plugin.component;
            return <Component key={`fx-${effect.type}-${i}`} segment={effect as never} />;
          })}

        {/* LAYER: Effect SFX */}
        {effects
          .filter((e) => e.sfx?.url)
          .map((e, i) => (
            <Audio
              key={`sfx-${i}`}
              src={resolveMediaUrl(e.sfx!.url)}
              volume={e.sfx!.volume ?? 0.8}
              startFrom={Math.round(e.startTime * fps)}
            />
          ))}

        {/* LAYER 10: Progress bar */}
        {showProgressBar && <ProgressBar />}
        {logoOverlay && <LogoOverlay config={logoOverlay} />}
        {scrollStopper && scrollStopper.preset !== 'none' && (
          <ScrollStopper
            preset={scrollStopper.preset}
            durationSeconds={scrollStopper.durationSeconds}
          />
        )}
      </AbsoluteFill>
    );
  }

  // ── comparison-split layout ─────────────────────────────────────────────────
  // Screen split 50/50 vertically (left = option A, right = option B).
  // Each half shows its own b-roll content independently, driven by the `panel` field.
  // A "VS" badge appears centered when both panels have active content.
  if (layout === 'comparison-split') {
    const leftSegments = bRollSegments.filter(
      (seg) => (seg as Record<string, unknown>).panel !== 'right'
    );
    const rightSegments = bRollSegments.filter(
      (seg) => (seg as Record<string, unknown>).panel === 'right'
    );

    const activeLeft = leftSegments.find(
      (seg) => currentTime >= seg.startTime && currentTime < seg.endTime
    );
    const activeRight = rightSegments.find(
      (seg) => currentTime >= seg.startTime && currentTime < seg.endTime
    );
    const showVsBadge = !!activeLeft && !!activeRight;

    const activeLeftStyle = activeLeft ? computeEntrance(currentTime, activeLeft) : null;
    const activeRightStyle = activeRight ? computeEntrance(currentTime, activeRight) : null;

    return (
      <AbsoluteFill style={{ backgroundColor, ...scrollStopperTransform, overflow: 'hidden' }}>
        {/* Left panel (50%) */}
        <div
          data-panel="left"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '50%',
            height: '100%',
            overflow: 'hidden',
            backgroundColor: '#0a0a14',
          }}
        >
          {activeLeft && activeLeftStyle && (
            <AbsoluteFill
              style={{
                opacity: activeLeftStyle.clipPath ? 1 : activeLeftStyle.opacity,
                transform: activeLeftStyle.transform,
                overflow: 'hidden',
                ...(activeLeftStyle.clipPath ? { clipPath: activeLeftStyle.clipPath } : {}),
                ...(activeLeftStyle.filter ? { filter: activeLeftStyle.filter } : {}),
              }}
            >
              <OverlayContent segment={activeLeft} />
            </AbsoluteFill>
          )}
        </div>

        {/* Center divider */}
        <div
          data-testid="comparison-divider"
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            width: 2,
            height: '100%',
            backgroundColor: '#FFFFFF',
            zIndex: 10,
            transform: 'translateX(-50%)',
          }}
        />

        {/* Right panel (50%) */}
        <div
          data-panel="right"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '50%',
            height: '100%',
            overflow: 'hidden',
            backgroundColor: '#0a0a14',
          }}
        >
          {activeRight && activeRightStyle && (
            <AbsoluteFill
              style={{
                opacity: activeRightStyle.clipPath ? 1 : activeRightStyle.opacity,
                transform: activeRightStyle.transform,
                overflow: 'hidden',
                ...(activeRightStyle.clipPath ? { clipPath: activeRightStyle.clipPath } : {}),
                ...(activeRightStyle.filter ? { filter: activeRightStyle.filter } : {}),
              }}
            >
              <OverlayContent segment={activeRight} />
            </AbsoluteFill>
          )}
        </div>

        {/* VS badge (centered, shown when both panels have active content) */}
        {showVsBadge && (
          <div
            data-testid="vs-badge"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: '#000000CC',
              border: '2px solid #FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: 24,
              fontWeight: 'bold',
              fontFamily: 'sans-serif',
            }}
          >
            VS
          </div>
        )}

        {/* LAYER 3: Picture-in-Picture */}
        {pipSegments.map((seg, i) => (
          <PictureInPicture key={`pip-${i}`} segment={seg} />
        ))}

        {/* LAYER 4: Lower Thirds */}
        {lowerThirds.map((seg, i) => (
          <LowerThird key={`lt-${i}`} segment={seg} />
        ))}

        {/* LAYER 5: Highlight Boxes */}
        {highlights.map((seg, i) => (
          <HighlightBox key={`hl-${i}`} segment={seg} />
        ))}

        {/* LAYER 6: Audio tracks */}
        {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}
        {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}
        {/* SFX segments */}
        {sfxSegments.map((sfx, i) => (
          <Sequence
            key={`sfx-${i}`}
            from={Math.round(sfx.startTime * fps)}
            durationInFrames={Math.round(1.5 * fps)}
          >
            <Audio src={resolveMediaUrl(sfxIdToUrl(sfx.sfxId))} volume={sfx.volume ?? 0.7} />
          </Sequence>
        ))}
        {/* SFX segments */}
        {sfxSegments.map((sfx, i) => (
          <Sequence
            key={`sfx-${i}`}
            from={Math.round(sfx.startTime * fps)}
            durationInFrames={Math.round(1.5 * fps)}
          >
            <Audio src={resolveMediaUrl(sfxIdToUrl(sfx.sfxId))} volume={sfx.volume ?? 0.7} />
          </Sequence>
        ))}

        {/* LAYER 7: Animated captions (full width, bottom center) */}
        {cues.length > 0 && <CaptionOverlay cues={cues} style={dynamicCaptionStyle} />}

        {/* LAYER 8: Animated counters */}
        {counters.map((seg, i) => (
          <AnimatedCounter key={`counter-${i}`} segment={seg} />
        ))}

        {/* LAYER 9: CTA overlays */}
        {ctaSegments.map((seg, i) => (
          <CtaOverlay key={`cta-${i}`} segment={seg} />
        ))}

        {/* LAYER: Plugin effects (sorted by layer number) */}
        {[...effects]
          .sort((a, b) => (getEffect(a.type)?.layer ?? 50) - (getEffect(b.type)?.layer ?? 50))
          .map((effect, i) => {
            const plugin = getEffect(effect.type);
            if (!plugin) return null;
            const Component = plugin.component;
            return <Component key={`fx-${effect.type}-${i}`} segment={effect as never} />;
          })}

        {/* LAYER: Effect SFX */}
        {effects
          .filter((e) => e.sfx?.url)
          .map((e, i) => (
            <Audio
              key={`sfx-${i}`}
              src={resolveMediaUrl(e.sfx!.url)}
              volume={e.sfx!.volume ?? 0.8}
              startFrom={Math.round(e.startTime * fps)}
            />
          ))}

        {/* LAYER 10: Progress bar */}
        {showProgressBar && <ProgressBar />}
        {logoOverlay && <LogoOverlay config={logoOverlay} />}
        {scrollStopper && scrollStopper.preset !== 'none' && (
          <ScrollStopper
            preset={scrollStopper.preset}
            durationSeconds={scrollStopper.durationSeconds}
          />
        )}
      </AbsoluteFill>
    );
  }

  // ── default layouts (fullscreen / split-screen / picture-in-picture) ────────
  return (
    <AbsoluteFill style={{ backgroundColor, ...scrollStopperTransform, overflow: 'hidden' }}>
      {/* LAYER 0: Base + Zoom */}
      {activeZoom ? (
        <ZoomEffect segment={activeZoom}>{baseContent}</ZoomEffect>
      ) : (
        <AbsoluteFill>{baseContent}</AbsoluteFill>
      )}

      {/* LAYER 1a: Held overlay - previous segment kept visible during incoming entrance */}
      {heldOverlay && (
        <AbsoluteFill>
          <OverlayContent
            segment={heldOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 1b: Exiting overlay - gentle fade out when ending with gap */}
      {exitingOverlay && (
        <AbsoluteFill style={{ opacity: exitOpacity }}>
          <OverlayContent
            segment={exitingOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 2: Active overlay with entrance transition */}
      {activeOverlay && activeStyle && (
        <AbsoluteFill
          style={{
            opacity: activeStyle.clipPath ? 1 : activeStyle.opacity,
            transform: activeStyle.transform,
            overflow: 'hidden',
            ...(activeStyle.clipPath ? { clipPath: activeStyle.clipPath } : {}),
            ...(activeStyle.filter ? { filter: activeStyle.filter } : {}),
          }}
        >
          <OverlayContent
            segment={activeOverlay}
            primaryVideoUrl={primaryVideoUrl}
            secondaryVideoUrl={secondaryVideoUrl}
          />
        </AbsoluteFill>
      )}

      {/* Flash-white overlay for flash-white transition */}
      {activeOverlay &&
        activeOverlay.transition?.type === 'flash-white' &&
        (() => {
          const transitionDur =
            (activeOverlay.transition?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000;
          const flashProgress = interpolate(
            currentTime,
            [activeOverlay.startTime, activeOverlay.startTime + transitionDur],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
          // White flash peaks at midpoint
          const flashOpacity =
            flashProgress < 0.5
              ? interpolate(flashProgress, [0, 0.5], [0, 1])
              : interpolate(flashProgress, [0.5, 1], [1, 0]);
          return flashOpacity > 0 ? (
            <AbsoluteFill
              style={{
                backgroundColor: '#FFFFFF',
                opacity: flashOpacity,
                zIndex: 20,
                pointerEvents: 'none',
              }}
            />
          ) : null;
        })()}

      {/* LAYER 2.5: Transparent avatar overlay (rmbg/greenscreen — renders ON TOP of b-roll) */}
      {renderTransparentAvatarOverlay()}

      {/* LAYER 3: Picture-in-Picture */}
      {pipSegments.map((seg, i) => (
        <PictureInPicture key={`pip-${i}`} segment={seg} />
      ))}

      {/* LAYER 4: Lower Thirds */}
      {lowerThirds.map((seg, i) => (
        <LowerThird key={`lt-${i}`} segment={seg} />
      ))}

      {/* LAYER 5: Highlight Boxes */}
      {highlights.map((seg, i) => (
        <HighlightBox key={`hl-${i}`} segment={seg} />
      ))}

      {/* LAYER 6: Audio tracks */}
      {voiceoverUrl && <Audio src={resolveMediaUrl(voiceoverUrl)} volume={1} />}
      {musicUrl && <Audio src={resolveMediaUrl(musicUrl)} volume={musicVolume} />}
      {/* SFX segments */}
      {sfxSegments.map((sfx, i) => (
        <Sequence
          key={`sfx-${i}`}
          from={Math.round(sfx.startTime * fps)}
          durationInFrames={Math.round(1.5 * fps)}
        >
          <Audio src={resolveMediaUrl(sfxIdToUrl(sfx.sfxId))} volume={sfx.volume ?? 0.7} />
        </Sequence>
      ))}

      {/* LAYER 7: Animated captions */}
      {cues.length > 0 && <CaptionOverlay cues={cues} style={dynamicCaptionStyle} />}

      {/* LAYER 8: Animated counters */}
      {counters.map((seg, i) => (
        <AnimatedCounter key={`counter-${i}`} segment={seg} />
      ))}

      {/* LAYER 9: CTA overlays */}
      {ctaSegments.map((seg, i) => (
        <CtaOverlay key={`cta-${i}`} segment={seg} />
      ))}

      {/* LAYER: Plugin effects (sorted by layer number) */}
      {[...effects]
        .sort((a, b) => (getEffect(a.type)?.layer ?? 50) - (getEffect(b.type)?.layer ?? 50))
        .map((effect, i) => {
          const plugin = getEffect(effect.type);
          if (!plugin) return null;
          const Component = plugin.component;
          return <Component key={`fx-${effect.type}-${i}`} segment={effect as never} />;
        })}

      {/* LAYER: Effect SFX */}
      {effects
        .filter((e) => e.sfx?.url)
        .map((e, i) => (
          <Audio
            key={`sfx-${i}`}
            src={resolveMediaUrl(e.sfx!.url)}
            volume={e.sfx!.volume ?? 0.8}
            startFrom={Math.round(e.startTime * fps)}
          />
        ))}

      {/* LAYER 10: Progress bar */}
      {showProgressBar && <ProgressBar />}

      {/* LAYER 11: Logo / watermark */}
      {logoOverlay && <LogoOverlay config={logoOverlay} />}

      {/* LAYER 12: Scroll-stopper entrance (top layer, first 0.3-0.8s) */}
      {scrollStopper && scrollStopper.preset !== 'none' && (
        <ScrollStopper
          preset={scrollStopper.preset}
          durationSeconds={scrollStopper.durationSeconds}
        />
      )}
    </AbsoluteFill>
  );
};
