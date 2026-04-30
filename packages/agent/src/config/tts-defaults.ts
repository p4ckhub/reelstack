/**
 * Centralized TTS defaults for all callers (web schemas, slideshow
 * orchestrator, base orchestrator, presenter, etc.).
 *
 * Mirrors `models.ts` for LLMs:
 *   - `detectTTSProvider()` picks the best provider given env vars.
 *   - `resolveTTSDefaults()` is the one-stop call: pass partial input
 *     (anything optional), get back a fully populated `{provider, voice,
 *     language}` triple ready to feed into `createTTSProvider()` and
 *     `synthesize()`.
 *   - Env overrides (TTS_PROVIDER, TTS_VOICE, DEFAULT_TTS_LANGUAGE) win
 *     over auto-detection but lose to explicit input — same priority
 *     ordering as `models.ts:getModel()`.
 *
 * Adding a new provider: extend the union in `TTSProviderName`, add an
 * env-key check in `detectTTSProvider`, register a default voice in
 * `getDefaultTTSVoice`. No callsite changes needed.
 */
import { getVoicePreset, type VoiceUseCase } from '@reelstack/tts';

export type TTSProviderName = 'gemini-tts' | 'elevenlabs' | 'openai' | 'edge-tts';

const VALID_PROVIDERS: readonly TTSProviderName[] = [
  'gemini-tts',
  'elevenlabs',
  'openai',
  'edge-tts',
];

function readEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env ?? process.env;
}

function isValidProvider(value: string | undefined): value is TTSProviderName {
  return !!value && (VALID_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Pick the best TTS provider given the current environment.
 *
 * Priority:
 *   1. `TTS_PROVIDER` env var (when valid)
 *   2. Gemini if any Google TTS key is present (free tier covers most reels)
 *   3. ElevenLabs if its key is present (premium quality)
 *   4. OpenAI if its key is present
 *   5. edge-tts (free, no key, always works)
 */
export function detectTTSProvider(env?: NodeJS.ProcessEnv): TTSProviderName {
  const e = readEnv(env);
  if (isValidProvider(e.TTS_PROVIDER)) return e.TTS_PROVIDER;
  if (e.GEMINI_API_KEY || e.GOOGLE_TTS_API_KEY || e.GOOGLE_TTS_ACCESS_TOKEN) return 'gemini-tts';
  if (e.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (e.OPENAI_API_KEY) return 'openai';
  return 'edge-tts';
}

// ── Language defaults ──────────────────────────────────────────

const LANGUAGE_TO_BCP47: Record<string, string> = {
  pl: 'pl-PL',
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  cs: 'cs-CZ',
  sv: 'sv-SE',
};

function expandLanguageCode(code: string): string {
  if (code.includes('-')) return code;
  const lower = code.toLowerCase();
  return LANGUAGE_TO_BCP47[lower] ?? `${lower}-${lower.toUpperCase()}`;
}

export function getDefaultTTSLanguage(env?: NodeJS.ProcessEnv): string {
  const e = readEnv(env);
  const raw = e.DEFAULT_TTS_LANGUAGE ?? 'pl-PL';
  return expandLanguageCode(raw);
}

// ── Voice defaults per provider × language ─────────────────────

const EDGE_VOICE_BY_LANG: Record<string, string> = {
  'pl-PL': 'pl-PL-ZofiaNeural',
  'en-US': 'en-US-AriaNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'pt-PT': 'pt-PT-RaquelNeural',
  'nl-NL': 'nl-NL-FennaNeural',
};

const EDGE_FALLBACK_VOICE = 'en-US-AriaNeural';
const OPENAI_DEFAULT_VOICE = 'nova';
const ELEVENLABS_DEFAULT_VOICE = 'pNInz6obpgDQGcFmaJgB'; // Adam
const GEMINI_DEFAULT_VOICE = 'Charon';

/**
 * Pick a default voice for a (provider, language, useCase) triple.
 *
 * Priority: explicit `TTS_VOICE` env override > useCase preset (gemini
 * only) > per-language map > provider-wide fallback.
 *
 * `useCase` is gemini-only because no other provider has a comparable
 * persona system; the parameter is silently ignored elsewhere.
 */
export function getDefaultTTSVoice(
  provider: TTSProviderName,
  language: string,
  useCase?: VoiceUseCase,
  env?: NodeJS.ProcessEnv
): string {
  const e = readEnv(env);
  if (e.TTS_VOICE) return e.TTS_VOICE;

  const expanded = expandLanguageCode(language);

  switch (provider) {
    case 'edge-tts':
      return EDGE_VOICE_BY_LANG[expanded] ?? EDGE_FALLBACK_VOICE;

    case 'gemini-tts':
      if (useCase) {
        const preset = getVoicePreset(useCase);
        if (preset?.defaultVoice) return preset.defaultVoice;
      }
      return GEMINI_DEFAULT_VOICE;

    case 'openai':
      return OPENAI_DEFAULT_VOICE;

    case 'elevenlabs':
      return e.ELEVENLABS_VOICE_ID ?? ELEVENLABS_DEFAULT_VOICE;
  }
}

// ── Top-level resolver ─────────────────────────────────────────

export interface ResolveTTSDefaultsInput {
  provider?: TTSProviderName;
  voice?: string;
  language?: string;
  useCase?: VoiceUseCase;
}

export interface ResolvedTTSDefaults {
  provider: TTSProviderName;
  voice: string;
  language: string;
}

/**
 * Fill in TTS defaults from env + sensible fallbacks.
 *
 * Priority (per field): explicit input > matching env var > provider/
 * language-driven default. The returned shape always has all three
 * fields populated, so downstream callers (schemas, orchestrator) can
 * pass it directly to `createTTSProvider()` without nullish-checking.
 */
export function resolveTTSDefaults(
  input?: ResolveTTSDefaultsInput,
  env?: NodeJS.ProcessEnv
): ResolvedTTSDefaults {
  const e = readEnv(env);
  const provider = input?.provider ?? detectTTSProvider(e);
  const language = expandLanguageCode(input?.language ?? getDefaultTTSLanguage(e));
  const voice = input?.voice ?? getDefaultTTSVoice(provider, language, input?.useCase, e);
  return { provider, voice, language };
}
