/**
 * Voice presets for Gemini 3.1 Flash TTS — per-use-case defaults.
 *
 * Each preset captures: a default voice ID (from the 30-voice catalog),
 * the 3-section prompt skeleton (Audio Profile + Scene + Director's Notes),
 * and pacing hints. Picked by `buildVoicePrompt({ useCase })`.
 *
 * Voice catalog & persona descriptions live in
 * `vault/skills/gemini-tts-prompting/voices.md` — not duplicated here
 * because the catalog evolves with Google's preview releases.
 */

export type VoiceUseCase =
  | 'hook-reel'
  | 'tutorial-pl'
  | 'build-in-public'
  | 'long-form-course'
  | 'asmr-intimate'
  | 'hype-launch'
  | 'n8n-explainer'
  | 'slideshow';

/**
 * Per-language overrides for an audio profile. Gemini infers accent from
 * the prepended prompt — if the prompt says "Polish accent" but the
 * narration is English, the model bakes a Polish accent into the English
 * delivery (heard as "Charon czyta po angielsku z polskim akcentem").
 * `byLanguage[lang]` overrides the base value when the synthesis language
 * matches; falls back to `audioProfile` / `directorsNotes`.
 */
export type LocalizedString =
  | string
  | { readonly default: string; readonly byLanguage: Record<string, string> };

export interface VoicePreset {
  /** Default voice ID from Gemini catalog (e.g. "Charon", "Aoede"). */
  readonly defaultVoice: string;
  /** Audio Profile — KTO mówi (1-2 sentences). */
  readonly audioProfile: LocalizedString;
  /** Scene — GDZIE / w jakim kontekście (1 sentence). */
  readonly scene: string;
  /** Director's Notes — JAK (pacing, accent, dynamic range). */
  readonly directorsNotes: LocalizedString;
}

const PAWEL_PL_PROFILE =
  'Pawel — Polish solo founder explaining tech to other solopreneurs. Confident, calm, slightly conspiratorial — like sharing hard-won lessons over coffee. Light vocal smile.';

const PAWEL_EN_PROFILE =
  'Tech narrator for an English-speaking global audience of solopreneurs and developers. Confident, calm, slightly conspiratorial — like a senior engineer sharing a hard-won trick over coffee. Light vocal smile.';

export const VOICE_PRESETS: Record<VoiceUseCase, VoicePreset> = {
  'hook-reel': {
    defaultVoice: 'Fenrir',
    audioProfile: PAWEL_PL_PROFILE,
    scene: 'Opening a high-energy social reel. The first 3 seconds must hook a scrolling viewer.',
    directorsNotes:
      'Vocal smile audible — bright, slightly conspiratorial. Pace: fast but articulated. Drop into [whispers] or [serious] once for contrast on the key claim. End on a confident, declarative beat.',
  },
  'tutorial-pl': {
    defaultVoice: 'Charon',
    audioProfile: PAWEL_PL_PROFILE,
    scene:
      'Recording a short tech tutorial for solopreneurs and freelancers who follow him on LinkedIn.',
    directorsNotes:
      'Polish accent typical of Warsaw, neutral and educated. Pace: brisk (~140 wpm for Polish) but never rushing. Punchy openings on each section. Short pauses after key technical terms. Drop tone slightly on warnings or caveats. End on an actionable, declarative beat.',
  },
  'build-in-public': {
    defaultVoice: 'Puck',
    audioProfile: PAWEL_PL_PROFILE,
    scene:
      'Sharing a build-in-public moment with Twitter/LinkedIn followers who already know the project.',
    directorsNotes:
      "Tone: casual, slightly tired but genuinely excited about a small win. Like a voice memo to a friend. Light, unforced. Don't sell — just share. Conversational pace with natural pauses.",
  },
  'long-form-course': {
    defaultVoice: 'Iapetus',
    audioProfile: PAWEL_PL_PROFILE,
    scene:
      'Recording a course module for an audience of paying students settling in for a 5-10 minute lesson.',
    directorsNotes:
      'Polish accent neutral, educated. Pace: deliberate (~135 wpm for Polish), slightly slower than reels. Welcoming, confident. Re-anchor profile every ~200 words to prevent drift in long-form output.',
  },
  'asmr-intimate': {
    defaultVoice: 'Enceladus',
    audioProfile: PAWEL_PL_PROFILE,
    scene:
      'Very close to the microphone, intimate moment — like reading a bedtime story or guiding a meditation.',
    directorsNotes:
      'Soft breathy delivery, slow tempo, warm intimate energy. No vocal projection — air-light, almost whispered throughout. Polish, gentle.',
  },
  'hype-launch': {
    defaultVoice: 'Fenrir',
    audioProfile: PAWEL_PL_PROFILE,
    scene: 'Announcing a launch to a social audience. Maximum energy moment.',
    directorsNotes:
      'Vocal smile, quick pace. Like a sports commentator on a winning play. Drop dramatically into [serious] for the call-to-action at the end. Polish.',
  },
  'n8n-explainer': {
    defaultVoice: 'Iapetus',
    audioProfile: {
      default: PAWEL_PL_PROFILE,
      byLanguage: { pl: PAWEL_PL_PROFILE, en: PAWEL_EN_PROFILE },
    },
    scene:
      'Narrating a 45-90 second walkthrough of an n8n automation workflow, sectioned by node group.',
    directorsNotes: {
      default:
        'Polish accent neutral, educated. Pace: ~140 wpm. Direct, technical tutorial tone — never poetic or dramatic. Short pause after node names so the listener can register them. Re-anchor profile mid-script if narration exceeds 200 words. Avoid mood tags like [excitedly] or [dramatic]; only [short pause] is welcome.',
      byLanguage: {
        pl: 'Polish accent neutral, educated. Pace: ~140 wpm. Direct, technical tutorial tone — never poetic or dramatic. Short pause after node names so the listener can register them. Re-anchor profile mid-script if narration exceeds 200 words. Avoid mood tags like [excitedly] or [dramatic]; only [short pause] is welcome.',
        en: 'Native General American English, neutral and educated. Pace: ~150 wpm. Direct, technical tutorial tone — never poetic or dramatic. Short pause after node names so the listener can register them. End on actionable, declarative beats. Avoid mood tags like [excitedly] or [dramatic]; only [short pause] is welcome.',
      },
    },
  },
  slideshow: {
    defaultVoice: 'Charon',
    audioProfile: PAWEL_PL_PROFILE,
    scene:
      'Reading a 15-30 second crisp narration over a sequence of branded image slides on a vertical 9:16 social reel.',
    directorsNotes:
      'Polish accent neutral. Pace: brisk (~150 wpm). Minimal audio tags — at most 2-3 across the full narration, only on transitions or emphasis beats. Tight, energetic delivery — slides do the visual work, narration glues them together.',
  },
};

/** Lookup preset by use case. Returns undefined for unknown keys. */
export function getVoicePreset(useCase: VoiceUseCase): VoicePreset {
  return VOICE_PRESETS[useCase];
}
