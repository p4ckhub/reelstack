/**
 * Caption Animation Renderer - renders per-word karaoke and other animation styles.
 * Inspired by OpenReel's caption-animation-renderer.ts.
 *
 * Pure function: takes a cue + currentTime, returns an array of WordSegments
 * describing how each word should be rendered at that instant.
 */
import type { SubtitleCue, SubtitleWord } from '@reelstack/types';

export type WordSegmentStyle = 'normal' | 'highlighted' | 'hidden' | 'active';

export interface WordSegment {
  readonly text: string;
  readonly style: WordSegmentStyle;
  readonly opacity: number;
  readonly scale: number;
  readonly offsetY: number;
  readonly color?: string;
}

export interface AnimatedCaptionFrame {
  readonly segments: readonly WordSegment[];
  readonly visible: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

const EMPTY_FRAME: AnimatedCaptionFrame = { segments: [], visible: false };

function renderNone(cue: SubtitleCue): AnimatedCaptionFrame {
  return {
    segments: [{ text: cue.text, style: 'normal', opacity: 1, scale: 1, offsetY: 0 }],
    visible: true,
  };
}

function renderWordHighlight(
  words: readonly SubtitleWord[],
  currentTime: number,
  highlightColor: string,
  upcomingColor?: string
): AnimatedCaptionFrame {
  const lastWord = words[words.length - 1];
  const segments: WordSegment[] = words.map((word) => {
    const isLastWord = word === lastWord;
    const isActive = currentTime >= word.startTime && (isLastWord || currentTime < word.endTime);
    const isUpcoming = currentTime < word.startTime;

    let color: string | undefined;
    if (isActive) color = highlightColor;
    else if (isUpcoming && upcomingColor) color = upcomingColor;

    return {
      text: word.text,
      style: isActive ? 'highlighted' : 'normal',
      opacity: 1,
      scale: isActive ? 1.15 : 1,
      offsetY: isActive ? -2 : 0,
      color,
    };
  });
  return { segments, visible: true };
}

function renderWordByWord(
  words: readonly SubtitleWord[],
  currentTime: number
): AnimatedCaptionFrame {
  const activeWord = words.find((w) => currentTime >= w.startTime && currentTime < w.endTime);

  if (!activeWord) {
    const lastWord = words[words.length - 1];
    if (currentTime >= lastWord.endTime) {
      return {
        segments: [{ text: lastWord.text, style: 'normal', opacity: 1, scale: 1, offsetY: 0 }],
        visible: true,
      };
    }
    return EMPTY_FRAME;
  }

  return {
    segments: [{ text: activeWord.text, style: 'active', opacity: 1, scale: 1, offsetY: 0 }],
    visible: true,
  };
}

function renderKaraoke(
  words: readonly SubtitleWord[],
  currentTime: number,
  highlightColor: string,
  upcomingColor: string
): AnimatedCaptionFrame {
  const lastWord = words[words.length - 1];
  const segments: WordSegment[] = words.map((word) => {
    const wordDuration = word.endTime - word.startTime;
    const elapsed = currentTime - word.startTime;
    const progress = clamp(wordDuration > 0 ? elapsed / wordDuration : 1, 0, 1);

    const isUpcoming = currentTime < word.startTime;
    // For the last word in cue, treat it as active even at/past endTime
    // (the cue-level fade-out handles disappearance)
    const isLastWord = word === lastWord;
    const isActive = currentTime >= word.startTime && (isLastWord || currentTime < word.endTime);
    const isComplete = !isActive && currentTime >= word.endTime;

    let style: WordSegmentStyle = 'normal';
    let color: string | undefined;

    if (isUpcoming) {
      style = 'normal';
      color = upcomingColor;
    } else if (isComplete) {
      style = 'highlighted';
      color = highlightColor;
    } else if (isActive) {
      // Active word gets highlight color immediately
      // (CSS color doesn't support linear-gradient, so use solid swap)
      style = 'active';
      color = highlightColor;
    }

    return { text: word.text, style, opacity: 1, scale: isActive ? 1.05 : 1, offsetY: 0, color };
  });

  return { segments, visible: true };
}

function renderBounce(words: readonly SubtitleWord[], currentTime: number): AnimatedCaptionFrame {
  const animationDuration = 0.3;

  const segments: WordSegment[] = words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isVisible = currentTime >= word.startTime;

    if (!isVisible) {
      return {
        text: word.text,
        style: 'hidden' as WordSegmentStyle,
        opacity: 0,
        scale: 0,
        offsetY: 20,
      };
    }

    const animProgress = clamp(timeSinceStart / animationDuration, 0, 1);
    const bounceProgress = easeOutBounce(animProgress);
    const isActive = currentTime >= word.startTime && currentTime < word.endTime;

    return {
      text: word.text,
      style: isActive ? 'active' : 'normal',
      opacity: bounceProgress,
      scale: 0.5 + bounceProgress * 0.5,
      offsetY: 20 * (1 - bounceProgress),
    };
  });

  return { segments, visible: true };
}

/**
 * Snap-pop: words appear instantly at scale 1.3 then snap to 1.0 over ~0.12s.
 * No fade, no bounce — hard entrance with quick settle. Jabłoński/Hormozi style.
 */
function renderSnapPop(words: readonly SubtitleWord[], currentTime: number): AnimatedCaptionFrame {
  const popDuration = 0.12; // seconds to settle from 1.3 → 1.0

  const segments: WordSegment[] = words.map((word) => {
    const isVisible = currentTime >= word.startTime;

    if (!isVisible) {
      return {
        text: word.text,
        style: 'hidden' as WordSegmentStyle,
        opacity: 0,
        scale: 0,
        offsetY: 0,
      };
    }

    const elapsed = currentTime - word.startTime;
    const isActive = currentTime >= word.startTime && currentTime < word.endTime;

    if (elapsed < popDuration) {
      // Pop phase: 1.3 → 1.0 with cubic ease-out
      const t = elapsed / popDuration;
      const eased = 1 - (1 - t) * (1 - t) * (1 - t); // cubic ease-out
      const scale = 1.3 - 0.3 * eased;
      return {
        text: word.text,
        style: 'active' as WordSegmentStyle,
        opacity: 1,
        scale,
        offsetY: 0,
      };
    }

    return {
      text: word.text,
      style: isActive ? 'active' : 'normal',
      opacity: 1,
      scale: 1,
      offsetY: 0,
    };
  });

  return { segments, visible: true };
}

function renderTypewriter(
  words: readonly SubtitleWord[],
  currentTime: number
): AnimatedCaptionFrame {
  const visibleWords = words.filter((w) => currentTime >= w.startTime);
  if (visibleWords.length === 0) return EMPTY_FRAME;

  const fadeInDuration = 0.1;
  const segments: WordSegment[] = visibleWords.map((word, index) => {
    const isLast = index === visibleWords.length - 1;
    const timeSinceStart = currentTime - word.startTime;
    const opacity = isLast ? clamp(timeSinceStart / fadeInDuration, 0, 1) : 1;

    return { text: word.text, style: 'normal', opacity, scale: 1, offsetY: 0 };
  });

  return { segments, visible: true };
}

/**
 * Main entry point - renders a subtitle cue at the given time.
 * Returns an AnimatedCaptionFrame describing how to render each word.
 */
export function renderAnimatedCaption(
  cue: SubtitleCue,
  currentTime: number,
  styleOverrides?: { highlightColor?: string; upcomingColor?: string; animationStyle?: string }
): AnimatedCaptionFrame {
  if (currentTime < cue.startTime || currentTime > cue.endTime) {
    return EMPTY_FRAME;
  }

  const animationStyle = styleOverrides?.animationStyle ?? 'none';

  // If no per-word timing data, fall back to static rendering
  if (!cue.words || cue.words.length === 0 || animationStyle === 'none') {
    return renderNone(cue);
  }

  const highlightColor = styleOverrides?.highlightColor ?? '#ffff00';
  const upcomingColor = styleOverrides?.upcomingColor ?? 'rgba(255, 255, 255, 0.5)';

  switch (animationStyle) {
    case 'word-highlight':
      return renderWordHighlight(cue.words, currentTime, highlightColor, upcomingColor);
    case 'word-by-word':
      return renderWordByWord(cue.words, currentTime);
    case 'karaoke':
      return renderKaraoke(cue.words, currentTime, highlightColor, upcomingColor);
    case 'bounce':
      return renderBounce(cue.words, currentTime);
    case 'typewriter':
      return renderTypewriter(cue.words, currentTime);
    case 'snap-pop':
      return renderSnapPop(cue.words, currentTime);
    default:
      return renderNone(cue);
  }
}

export const CAPTION_ANIMATION_STYLES = [
  'none',
  'word-highlight',
  'word-by-word',
  'karaoke',
  'bounce',
  'typewriter',
  'snap-pop',
] as const;

export function getAnimationStyleDisplayName(style: string): string {
  const names: Record<string, string> = {
    none: 'Static',
    'word-highlight': 'Word Highlight',
    'word-by-word': 'Word by Word',
    karaoke: 'Karaoke',
    bounce: 'Bounce',
    typewriter: 'Typewriter',
    'snap-pop': 'Snap Pop',
  };
  return names[style] ?? style;
}
