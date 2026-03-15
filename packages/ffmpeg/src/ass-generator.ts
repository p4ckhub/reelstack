import type { SubtitleCue, SubtitleStyle } from '@reelstack/types';
import { formatTime } from './time-utils';

/**
 * Convert hex color (#RRGGBB) to ASS color format (&HBBGGRR&)
 */
function hexToASS(hex: string): string {
  const clean = hex.replace('#', '');
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H${b}${g}${r}&`;
}

/**
 * Convert hex color + opacity to ASS alpha color (&HAABBGGRR)
 */
function hexToASSWithAlpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  const alpha = Math.round((1 - opacity) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `&H${alpha}${b}${g}${r}`;
}

/**
 * Map alignment to ASS numpad position
 * ASS uses numpad layout: 1=bottom-left, 2=bottom-center, 3=bottom-right
 * 7=top-left, 8=top-center, 9=top-right
 */
function getASSAlignment(alignment: string, position: number): number {
  const isTop = position < 33;
  const isMid = position >= 33 && position < 66;

  const base = isTop ? 7 : isMid ? 4 : 1;

  switch (alignment) {
    case 'left':
      return base;
    case 'right':
      return base + 2;
    default:
      return base + 1; // center
  }
}

/**
 * Generate ASS (Advanced SubStation Alpha) subtitle file content
 */
export function generateASS(
  cues: SubtitleCue[],
  style: SubtitleStyle,
  videoWidth: number = 1920,
  videoHeight: number = 1080
): string {
  const alignment = getASSAlignment(style.alignment, style.position);
  const marginV = Math.round(((100 - style.position) / 100) * videoHeight);
  const bold = style.fontWeight === 'bold' ? -1 : 0;
  const italic = style.fontStyle === 'italic' ? -1 : 0;

  const header = `[Script Info]
Title: Subtitle Burner
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${style.fontSize},${hexToASS(style.fontColor)},${hexToASS(style.fontColor)},${hexToASS(style.outlineColor)},${hexToASSWithAlpha(style.backgroundColor, style.backgroundOpacity)},${bold},${italic},0,0,100,100,0,0,1,${style.outlineWidth},${style.shadowBlur},${alignment},20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
  const events = sorted
    .map((cue) => {
      const start = formatTime(cue.startTime, 'ass');
      const end = formatTime(cue.endTime, 'ass');

      // If cue has per-word timing and karaoke animation, generate \kf tags
      if (cue.words && cue.words.length > 0 && cue.animationStyle === 'karaoke') {
        const karaokeText = cue.words
          .map((word) => {
            // \kf uses centiseconds (1/100 s)
            const durationCs = Math.round((word.endTime - word.startTime) * 100);
            return `{\\kf${durationCs}}${word.text}`;
          })
          .join(' ');
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,${karaokeText}`;
      }

      // Replace newlines with ASS line break
      const text = cue.text.replace(/\n/g, '\\N');
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join('\n');

  return `${header}\n${events}\n`;
}
