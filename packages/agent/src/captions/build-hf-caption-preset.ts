/**
 * Caption preset dispatcher. Looks up the builder for the requested
 * slug, wraps the returned CSS in a `<style>` tag, and returns a
 * `{ presetCss, presetTimelineJs }` pair the host composition slots
 * via `{{captionPresetCss}}` and `{{captionPresetTimelineJs}}`.
 *
 * Falls back to the baseline `text` preset on unknown slug — the
 * dispatcher should never break a render.
 */
import type { CaptionPresetInput } from './types';
import { getHfCaptionPreset } from './registry';

const FALLBACK_SLUG = 'text';

export interface CaptionPresetVars {
  /** Full `<style>...</style>` block to inject in composition <head>. */
  presetCss: string;
  /** Inline JS to append to the timeline-build script (no surrounding tag). */
  presetTimelineJs: string;
}

export function buildHfCaptionPresetVars(
  slug: string | undefined,
  input: CaptionPresetInput
): CaptionPresetVars {
  const builder = getHfCaptionPreset(slug ?? FALLBACK_SLUG) ?? getHfCaptionPreset(FALLBACK_SLUG);
  if (!builder) {
    // Public always ships at least `text` — this branch only fires if a
    // caller imported the dispatcher without the side-effect baseline.
    return {
      presetCss: '<!-- no caption preset registered -->',
      presetTimelineJs: '',
    };
  }
  const block = builder(input);
  return {
    presetCss: `<style>${block.css}</style>`,
    presetTimelineJs: block.timelineJs ?? '',
  };
}
