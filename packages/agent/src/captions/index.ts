/**
 * HF caption preset public API. Mirrors the HF cards architecture:
 *
 *   buildHfCaptionPresetVars(slug, opts) — dispatcher that returns
 *     `{ presetCss, presetTimelineJs }` for slot injection into the
 *     captions composition.
 *   registerHfCaptionPreset(slug, build) — entry point used by the
 *     private modules overlay to add premium preset builders.
 *
 * Premium presets (outline-pop, hormozi, pop-word, pill, glow,
 * underline-sweep, box-highlight, single-word) live in the private
 * overlay. Public ships `text` as a baseline.
 */

// Side-effect import: registers the baseline `text` preset so the
// registry is never empty.
import './presets';

export { buildHfCaptionPresetVars, type CaptionPresetVars } from './build-hf-caption-preset';
export {
  registerHfCaptionPreset,
  getHfCaptionPreset,
  listHfCaptionPresets,
  hasHfCaptionPreset,
} from './registry';
export type { CaptionPresetBuilder, CaptionPresetBlock, CaptionPresetInput } from './types';
