/**
 * Baseline caption preset. Plain word-level karaoke: white past words,
 * highlight-coloured active word, no decoration. Open-source default;
 * premium presets (outline-pop, hormozi, pill, …) live in the private
 * overlay.
 */
import type { CaptionPresetBuilder } from '../types';
import { registerHfCaptionPreset } from '../registry';

export const buildTextPreset: CaptionPresetBuilder = ({
  fontColor,
  highlightColor,
  upcomingColor,
}) => {
  const upcoming = upcomingColor ?? fontColor;
  return {
    css: `
#captions .word {
  display: inline-block;
  margin-right: 0.25em;
  color: ${upcoming};
  will-change: color;
}
#captions .word--past { color: ${fontColor}; }
#captions .word--active { color: ${highlightColor}; }
`.trim(),
  };
};

registerHfCaptionPreset('text', buildTextPreset);
