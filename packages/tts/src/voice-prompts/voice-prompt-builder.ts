/**
 * Voice prompt builder for Gemini 3.1 Flash TTS.
 *
 * Produces a "voicePrompt" string in the documented 3-section structure:
 *
 *   AUDIO PROFILE  → who is speaking
 *   SCENE          → where / context
 *   DIRECTOR'S NOTES → pacing, accent, dynamic range
 *
 * Result is concatenated by `GeminiTTSProvider.synthesize()` ahead of the
 * narration text with the documented `: <text>` separator. Other providers
 * ignore voicePrompt — see TTSSynthesizeOptions.
 *
 * Per Google official docs (April 2026): the model steers delivery from
 * descriptive prose. Generic adjectives ("energetic") underperform —
 * descriptive scene-setting outperforms.
 */

import {
  getVoicePreset,
  type LocalizedString,
  type VoiceUseCase,
  type VoicePreset,
} from './voice-presets';

export interface BuildVoicePromptInput {
  /** Pre-defined use case — picks the preset (audio profile + scene + notes). */
  readonly useCase: VoiceUseCase;
  /**
   * BCP-47 language hint (e.g. "pl", "pl-PL", "en", "en-US"). Used to
   * select the correct localized variant of profile / director's notes
   * — Gemini infers accent from the prompt content, so an English
   * narration prefixed with a "Polish accent" prompt comes out with a
   * baked-in Polish accent. Pass this whenever the preset has any
   * `LocalizedString` fields, otherwise the `default` variant is used.
   */
  readonly language?: string;
  /**
   * Override individual sections when the preset isn't quite right.
   * Each override replaces (not appends to) the preset value.
   */
  readonly audioProfileOverride?: string;
  readonly sceneOverride?: string;
  readonly directorsNotesOverride?: string;
  /**
   * Optional appendix added at the end of Director's Notes — useful for
   * per-job specifics (e.g. "Mention the brand name 'ReelStack' once").
   * Kept short — long appendices dilute the preset.
   */
  readonly extraNotes?: string;
}

function resolveLocalized(value: LocalizedString, language?: string): string {
  if (typeof value === 'string') return value;
  if (!language) return value.default;
  // Match full tag first ("en-US"), then primary subtag ("en").
  const lower = language.toLowerCase();
  return value.byLanguage[lower] ?? value.byLanguage[lower.split('-')[0]] ?? value.default;
}

export interface BuildVoicePromptResult {
  /** The concatenated 3-section prompt, ready for `voicePrompt` option. */
  readonly voicePrompt: string;
  /** The voice ID the preset recommends — caller may still override. */
  readonly recommendedVoice: string;
  /** The preset that was applied, for logging / debugging. */
  readonly preset: VoicePreset;
}

/**
 * Build a Gemini 3.1 voice prompt from a preset + optional overrides.
 *
 * Output shape (with literal newlines for readability when spoken):
 *
 *   AUDIO PROFILE
 *   <text>
 *
 *   SCENE
 *   <text>
 *
 *   DIRECTOR'S NOTES
 *   <text>
 */
export function buildVoicePrompt(input: BuildVoicePromptInput): BuildVoicePromptResult {
  const preset = getVoicePreset(input.useCase);

  const audioProfile =
    input.audioProfileOverride ?? resolveLocalized(preset.audioProfile, input.language);
  const scene = input.sceneOverride ?? preset.scene;
  let directorsNotes =
    input.directorsNotesOverride ?? resolveLocalized(preset.directorsNotes, input.language);
  if (input.extraNotes) {
    directorsNotes = `${directorsNotes} ${input.extraNotes.trim()}`;
  }

  const voicePrompt = [
    'AUDIO PROFILE',
    audioProfile,
    '',
    'SCENE',
    scene,
    '',
    "DIRECTOR'S NOTES",
    directorsNotes,
  ].join('\n');

  return {
    voicePrompt,
    recommendedVoice: preset.defaultVoice,
    preset,
  };
}
