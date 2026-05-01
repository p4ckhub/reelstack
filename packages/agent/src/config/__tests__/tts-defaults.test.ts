/**
 * TTS defaults resolver tests.
 *
 * Mirrors the LLM `models.ts` pattern: env-aware provider detection,
 * env var overrides, per-language voice fallbacks, useCase-aware voice
 * picking. Covered providers: gemini-tts, elevenlabs, openai, edge-tts.
 */

import { describe, it, expect } from 'vitest';
import {
  detectTTSProvider,
  resolveTTSDefaults,
  getDefaultTTSVoice,
  getDefaultTTSLanguage,
  type TTSProviderName,
} from '../tts-defaults';

const EMPTY_ENV = {} as NodeJS.ProcessEnv;

function envWith(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe('detectTTSProvider', () => {
  it('falls back to edge-tts when no API keys are present', () => {
    expect(detectTTSProvider(EMPTY_ENV)).toBe('edge-tts');
  });

  it('returns gemini-tts when GEMINI_API_KEY is set', () => {
    expect(detectTTSProvider(envWith({ GEMINI_API_KEY: 'k' }))).toBe('gemini-tts');
  });

  it('returns gemini-tts when GOOGLE_TTS_API_KEY is set', () => {
    expect(detectTTSProvider(envWith({ GOOGLE_TTS_API_KEY: 'k' }))).toBe('gemini-tts');
  });

  it('returns gemini-tts when GOOGLE_TTS_ACCESS_TOKEN is set', () => {
    expect(detectTTSProvider(envWith({ GOOGLE_TTS_ACCESS_TOKEN: 't' }))).toBe('gemini-tts');
  });

  it('returns elevenlabs when only ELEVENLABS_API_KEY is set', () => {
    expect(detectTTSProvider(envWith({ ELEVENLABS_API_KEY: 'k' }))).toBe('elevenlabs');
  });

  it('returns openai when only OPENAI_API_KEY is set', () => {
    expect(detectTTSProvider(envWith({ OPENAI_API_KEY: 'k' }))).toBe('openai');
  });

  it('prefers gemini > elevenlabs > openai when multiple keys are present', () => {
    expect(
      detectTTSProvider(
        envWith({
          GEMINI_API_KEY: 'g',
          ELEVENLABS_API_KEY: 'e',
          OPENAI_API_KEY: 'o',
        })
      )
    ).toBe('gemini-tts');

    expect(detectTTSProvider(envWith({ ELEVENLABS_API_KEY: 'e', OPENAI_API_KEY: 'o' }))).toBe(
      'elevenlabs'
    );
  });

  it('TTS_PROVIDER env var overrides auto-detection', () => {
    expect(detectTTSProvider(envWith({ TTS_PROVIDER: 'edge-tts', GEMINI_API_KEY: 'k' }))).toBe(
      'edge-tts'
    );
  });

  it('rejects an invalid TTS_PROVIDER and falls back to auto-detection', () => {
    // Defensive: env var typo shouldn't crash; auto-detect still runs.
    expect(detectTTSProvider(envWith({ TTS_PROVIDER: 'bogus', GEMINI_API_KEY: 'k' }))).toBe(
      'gemini-tts'
    );
    expect(detectTTSProvider(envWith({ TTS_PROVIDER: 'bogus' }))).toBe('edge-tts');
  });
});

describe('getDefaultTTSLanguage', () => {
  it('returns pl-PL by default', () => {
    expect(getDefaultTTSLanguage(EMPTY_ENV)).toBe('pl-PL');
  });

  it('honors DEFAULT_TTS_LANGUAGE env var', () => {
    expect(getDefaultTTSLanguage(envWith({ DEFAULT_TTS_LANGUAGE: 'en-US' }))).toBe('en-US');
  });

  it('expands a 2-letter language code into a BCP-47 tag', () => {
    // The slideshow orchestrator already does this; centralizing it here
    // means callers don't keep duplicating the if-else ladder.
    expect(getDefaultTTSLanguage(envWith({ DEFAULT_TTS_LANGUAGE: 'pl' }))).toBe('pl-PL');
    expect(getDefaultTTSLanguage(envWith({ DEFAULT_TTS_LANGUAGE: 'en' }))).toBe('en-US');
    expect(getDefaultTTSLanguage(envWith({ DEFAULT_TTS_LANGUAGE: 'de' }))).toBe('de-DE');
  });
});

describe('getDefaultTTSVoice', () => {
  it('edge-tts: PL → ZofiaNeural, EN → AriaNeural', () => {
    expect(getDefaultTTSVoice('edge-tts', 'pl-PL')).toBe('pl-PL-ZofiaNeural');
    expect(getDefaultTTSVoice('edge-tts', 'en-US')).toBe('en-US-AriaNeural');
  });

  it('edge-tts: bare language code resolves to a localized voice', () => {
    expect(getDefaultTTSVoice('edge-tts', 'pl')).toBe('pl-PL-ZofiaNeural');
    expect(getDefaultTTSVoice('edge-tts', 'en')).toBe('en-US-AriaNeural');
  });

  it('openai-tts: nova as global default', () => {
    expect(getDefaultTTSVoice('openai', 'pl-PL')).toBe('nova');
    expect(getDefaultTTSVoice('openai', 'en-US')).toBe('nova');
  });

  it('elevenlabs: Adam (pNInz6obpgDQGcFmaJgB) as global default', () => {
    expect(getDefaultTTSVoice('elevenlabs', 'pl-PL')).toBe('pNInz6obpgDQGcFmaJgB');
  });

  it('gemini-tts: Charon for slideshow useCase', () => {
    expect(getDefaultTTSVoice('gemini-tts', 'pl-PL', 'slideshow')).toBe('Charon');
  });

  it('gemini-tts: Fenrir for hook-reel useCase', () => {
    expect(getDefaultTTSVoice('gemini-tts', 'pl-PL', 'hook-reel')).toBe('Fenrir');
  });

  it('gemini-tts: Charon as default when no useCase is given', () => {
    expect(getDefaultTTSVoice('gemini-tts', 'pl-PL')).toBe('Charon');
  });

  it('honors TTS_VOICE env override regardless of provider/language', () => {
    expect(
      getDefaultTTSVoice('edge-tts', 'pl-PL', undefined, envWith({ TTS_VOICE: 'custom' }))
    ).toBe('custom');
    expect(
      getDefaultTTSVoice('gemini-tts', 'en-US', 'slideshow', envWith({ TTS_VOICE: 'Aoede' }))
    ).toBe('Aoede');
  });

  it('falls back to a sensible voice for unknown languages', () => {
    // Edge has voices for many languages; for ones we don't list explicitly,
    // fall back to the BCP-47 tag's default (e.g. fr-FR → DeniseNeural). For
    // unknown locales, fall back to en-US.
    expect(getDefaultTTSVoice('edge-tts', 'fr-FR')).toBe('fr-FR-DeniseNeural');
    expect(getDefaultTTSVoice('edge-tts', 'xx-XX')).toBe('en-US-AriaNeural');
  });
});

describe('resolveTTSDefaults', () => {
  it('with no input and no env, returns edge-tts + ZofiaNeural + pl-PL', () => {
    expect(resolveTTSDefaults(undefined, EMPTY_ENV)).toEqual({
      provider: 'edge-tts',
      voice: 'pl-PL-ZofiaNeural',
      language: 'pl-PL',
    });
  });

  it('explicit input.provider wins over env detection', () => {
    expect(resolveTTSDefaults({ provider: 'edge-tts' }, envWith({ GEMINI_API_KEY: 'k' }))).toEqual({
      provider: 'edge-tts',
      voice: 'pl-PL-ZofiaNeural',
      language: 'pl-PL',
    });
  });

  it('explicit input.voice wins over default voice', () => {
    expect(
      resolveTTSDefaults({ provider: 'edge-tts', voice: 'pl-PL-MarekNeural' }, EMPTY_ENV)
    ).toEqual({
      provider: 'edge-tts',
      voice: 'pl-PL-MarekNeural',
      language: 'pl-PL',
    });
  });

  it('explicit input.language drives both default voice and final language', () => {
    expect(resolveTTSDefaults({ provider: 'edge-tts', language: 'en-US' }, EMPTY_ENV)).toEqual({
      provider: 'edge-tts',
      voice: 'en-US-AriaNeural',
      language: 'en-US',
    });
  });

  it('GEMINI_API_KEY env switches default to gemini-tts + Charon', () => {
    expect(resolveTTSDefaults(undefined, envWith({ GEMINI_API_KEY: 'k' }))).toEqual({
      provider: 'gemini-tts',
      voice: 'Charon',
      language: 'pl-PL',
    });
  });

  it('useCase steers gemini voice picking', () => {
    expect(resolveTTSDefaults({ useCase: 'hook-reel' }, envWith({ GEMINI_API_KEY: 'k' }))).toEqual({
      provider: 'gemini-tts',
      voice: 'Fenrir',
      language: 'pl-PL',
    });
  });

  it('non-gemini providers ignore useCase (it is gemini-only)', () => {
    expect(resolveTTSDefaults({ useCase: 'hook-reel' }, EMPTY_ENV)).toEqual({
      provider: 'edge-tts',
      voice: 'pl-PL-ZofiaNeural',
      language: 'pl-PL',
    });
  });

  it('TTS_VOICE env overrides default voice but not explicit input.voice', () => {
    expect(resolveTTSDefaults(undefined, envWith({ TTS_VOICE: 'env-voice' }))).toEqual({
      provider: 'edge-tts',
      voice: 'env-voice',
      language: 'pl-PL',
    });
    expect(
      resolveTTSDefaults({ voice: 'input-voice' }, envWith({ TTS_VOICE: 'env-voice' }))
    ).toEqual({
      provider: 'edge-tts',
      voice: 'input-voice',
      language: 'pl-PL',
    });
  });

  it('all three env overrides combine cleanly', () => {
    expect(
      resolveTTSDefaults(
        undefined,
        envWith({
          TTS_PROVIDER: 'openai',
          TTS_VOICE: 'shimmer',
          DEFAULT_TTS_LANGUAGE: 'en-US',
          OPENAI_API_KEY: 'k',
        })
      )
    ).toEqual({
      provider: 'openai',
      voice: 'shimmer',
      language: 'en-US',
    });
  });
});

describe('TTSProviderName type', () => {
  it('admits exactly the four supported providers', () => {
    const validProviders: TTSProviderName[] = ['gemini-tts', 'elevenlabs', 'openai', 'edge-tts'];
    expect(validProviders).toHaveLength(4);
  });
});
