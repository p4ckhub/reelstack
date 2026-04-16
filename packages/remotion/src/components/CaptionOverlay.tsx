import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { renderAnimatedCaption } from '@reelstack/core';
import type { WordSegment } from '@reelstack/core';
import type { SubtitleCue, SubtitleStyle } from '@reelstack/types';
import { DEFAULT_SUBTITLE_STYLE } from '@reelstack/types';
import { getHighlightMode } from './highlight-modes';

interface CaptionOverlayProps {
  readonly cues: readonly SubtitleCue[];
  readonly style?: Partial<SubtitleStyle>;
}

/**
 * Builds a multi-layer text-shadow that acts as a solid outline.
 * Much better than WebkitTextStroke which eats into letterforms.
 */
function buildOutlineShadow(
  width: number,
  color: string,
  blur: number,
  shadowColor: string
): string {
  if (width <= 0 && blur <= 0) return 'none';

  const shadows: string[] = [];

  // Directional outline shadows (8 directions for solid outline)
  if (width > 0) {
    const d = width;
    shadows.push(
      `${d}px 0 0 ${color}`,
      `${-d}px 0 0 ${color}`,
      `0 ${d}px 0 ${color}`,
      `0 ${-d}px 0 ${color}`,
      `${d}px ${d}px 0 ${color}`,
      `${-d}px ${d}px 0 ${color}`,
      `${d}px ${-d}px 0 ${color}`,
      `${-d}px ${-d}px 0 ${color}`
    );
  }

  // Glow/blur shadow
  if (blur > 0) {
    shadows.push(`0 0 ${blur}px ${shadowColor}`);
  }

  return shadows.join(', ');
}

/**
 * Caption overlay — renders per-word highlighted captions.
 * Uses inline <span> elements inside a <p> tag, exactly like short-video-maker.
 * NO display:inline-block, NO transform on word spans — just plain inline text with color changes.
 */
export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ cues, style: styleOverride }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const captionStyle = { ...DEFAULT_SUBTITLE_STYLE, ...styleOverride };
  const isSingleWord = captionStyle.highlightMode === 'single-word';

  // ── Single-word mode: bypass cue system, use global word timeline ───
  if (isSingleWord) {
    const allWords = cues.flatMap((c) => c.words ?? []);
    if (allWords.length === 0) return null;

    const MIN_DISPLAY = 0.3;
    const effectiveStart: number[] = [];
    for (let i = 0; i < allWords.length; i++) {
      if (i === 0) {
        effectiveStart.push(allWords[i].startTime);
      } else {
        effectiveStart.push(Math.max(allWords[i].startTime, effectiveStart[i - 1] + MIN_DISPLAY));
      }
    }

    let wordIndex = 0;
    for (let i = allWords.length - 1; i >= 0; i--) {
      if (effectiveStart[i] <= currentTime) {
        wordIndex = i;
        break;
      }
    }

    // Only show if we're past the first word's start
    if (currentTime < effectiveStart[0]) return null;

    // Strip trailing punctuation — "edible." looks wrong as a single big word
    const activeWordText = allWords[wordIndex].text.replace(/[.,!?;:]+$/, '');
    const displayText =
      (captionStyle.textTransform ?? 'none') === 'uppercase'
        ? activeWordText.toUpperCase()
        : activeWordText;

    const verticalPosition = captionStyle.position;

    return (
      <div
        style={{
          position: 'absolute',
          top: `${verticalPosition}%`,
          left: 0,
          right: 0,
          transform: 'translateY(-50%)',
          display: 'flex',
          justifyContent: 'center',
          padding: '0 40px',
        }}
      >
        <span
          style={{
            fontSize: captionStyle.fontSize * 1.4,
            fontWeight: 'bold',
            fontFamily: captionStyle.fontFamily,
            color: captionStyle.highlightColor ?? '#FFD700',
            textShadow: buildOutlineShadow(
              captionStyle.outlineWidth + 1,
              captionStyle.outlineColor,
              captionStyle.shadowBlur + 4,
              captionStyle.shadowColor
            ),
            textTransform: (captionStyle.textTransform ??
              'none') as React.CSSProperties['textTransform'],
          }}
        >
          {displayText}
        </span>
      </div>
    );
  }

  let activeCue = cues.find((c) => currentTime >= c.startTime && currentTime < c.endTime);

  // Bridge gaps between cues: if we're between cue A (ended) and cue B (not started),
  // keep showing cue A until cue B starts. Prevents flashing empty screen.
  if (!activeCue) {
    const pastCues = cues.filter((c) => c.endTime <= currentTime);
    if (pastCues.length > 0) {
      const lastCue = pastCues[pastCues.length - 1];
      const nextCue = cues.find((c) => c.startTime > currentTime);
      // Only bridge if gap is short (<1s) — long gaps are intentional pauses
      if (nextCue && nextCue.startTime - lastCue.endTime < 1.0) {
        activeCue = lastCue;
      }
    }
  }

  if (!activeCue) return null;

  // Resolve animation style: captionStyle.animationStyle is the source of truth.
  // If highlight mode needs per-word animation (pill, hormozi, etc.) but no animationStyle set,
  // fall back to word-highlight so words get 'highlighted' style for the mode renderer to act on.
  const needsWordAnimation =
    captionStyle.highlightMode &&
    captionStyle.highlightMode !== 'text' &&
    captionStyle.highlightMode !== 'single-word';
  const resolvedAnimationStyle =
    captionStyle.animationStyle ??
    (needsWordAnimation && activeCue.words?.length ? 'word-highlight' : 'none');

  const { segments, visible } = renderAnimatedCaption(activeCue, currentTime, {
    highlightColor: captionStyle.highlightColor,
    upcomingColor: captionStyle.upcomingColor,
    animationStyle: resolvedAnimationStyle,
  });

  if (!visible || segments.length === 0) return null;

  const cueEndFrame = Math.round(activeCue.endTime * fps);

  const fadeOut = interpolate(frame, [cueEndFrame - 10, cueEndFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const verticalPosition = captionStyle.position;
  const textShadow = buildOutlineShadow(
    captionStyle.outlineWidth,
    captionStyle.outlineColor,
    captionStyle.shadowBlur,
    captionStyle.shadowColor
  );

  const highlightMode = captionStyle.highlightMode ?? 'text';
  const textTransform = captionStyle.textTransform ?? 'none';
  const pillColor = captionStyle.pillColor ?? captionStyle.highlightColor ?? '#3B82F6';
  const pillRadius = captionStyle.pillBorderRadius ?? 10;
  const pillPad = captionStyle.pillPadding ?? 10;

  const modeRenderer = getHighlightMode(highlightMode) ?? getHighlightMode('text');

  return (
    <div
      style={{
        position: 'absolute',
        top: `${verticalPosition}%`,
        left: 0,
        right: 0,
        transform: 'translateY(-50%)',
        display: 'flex',
        justifyContent:
          captionStyle.alignment === 'left'
            ? 'flex-start'
            : captionStyle.alignment === 'right'
              ? 'flex-end'
              : 'center',
        padding: '0 40px',
        opacity: fadeOut,
      }}
    >
      {/* Same pattern as short-video-maker: <p> with inline <span> children and literal spaces */}
      <p
        style={{
          fontSize: captionStyle.fontSize,
          fontWeight: captionStyle.fontWeight,
          fontStyle: captionStyle.fontStyle,
          fontFamily: captionStyle.fontFamily,
          color: captionStyle.fontColor,
          textAlign: 'center',
          textShadow,
          textTransform: textTransform as React.CSSProperties['textTransform'],
          lineHeight: captionStyle.lineHeight,
          maxWidth: '90%',
          margin: 0,
          padding: `${captionStyle.padding}px ${captionStyle.padding * 2}px`,
          backgroundColor: `${captionStyle.backgroundColor}${Math.round(
            captionStyle.backgroundOpacity * 255
          )
            .toString(16)
            .padStart(2, '0')}`,
          borderRadius: 16,
        }}
      >
        {(() => {
          // Layout-stable base: every word reserves the same footprint as
          // the active variant (padding, borders, inline-block), so the
          // caption line doesn't reflow as highlight moves across tokens.
          const styleOpts = {
            color: pillColor,
            fontSize: captionStyle.fontSize,
            padding: pillPad,
            borderRadius: pillRadius,
          } as const;
          const baseStyle = modeRenderer?.baseStyle?.(styleOpts) ?? {};

          return segments.map((seg: WordSegment, i: number) => {
            const isActive = seg.style === 'active' || seg.style === 'highlighted';
            const displayText = textTransform === 'uppercase' ? seg.text.toUpperCase() : seg.text;

            const activeStyle = isActive && modeRenderer ? modeRenderer.activeStyle(styleOpts) : {};

            // Modes with background (pill) keep base font color;
            // otherwise use the segment highlight color.
            const hasBg = isActive && activeStyle && 'backgroundColor' in activeStyle;
            const textColor = hasBg
              ? captionStyle.fontColor
              : (seg.color ?? captionStyle.fontColor);

            return (
              // eslint-disable-next-line react/jsx-key
              <>
                <span
                  key={i}
                  style={{
                    fontWeight: 'bold',
                    color: textColor,
                    ...baseStyle,
                    ...activeStyle,
                  }}
                >
                  {displayText}
                </span>
                {i < segments.length - 1 ? ' ' : ''}
              </>
            );
          });
        })()}
      </p>
    </div>
  );
};
