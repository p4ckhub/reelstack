import { describe, it, expect } from 'vitest';
import { createTTSProvider } from '../factory';
import { EdgeTTSProvider } from '../providers/edge-tts';
import { ElevenLabsProvider } from '../providers/elevenlabs';
import { OpenAITTSProvider } from '../providers/openai-tts';

describe('createTTSProvider', () => {
  it('returns EdgeTTSProvider when no config', () => {
    const provider = createTTSProvider();
    expect(provider).toBeInstanceOf(EdgeTTSProvider);
    expect(provider.id).toBe('edge-tts');
  });

  it('returns EdgeTTSProvider for edge-tts config', () => {
    const provider = createTTSProvider({ provider: 'edge-tts' });
    expect(provider).toBeInstanceOf(EdgeTTSProvider);
  });

  it('returns ElevenLabsProvider with API key', () => {
    const provider = createTTSProvider({ provider: 'elevenlabs', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(ElevenLabsProvider);
    expect(provider.id).toBe('elevenlabs');
  });

  it('throws for ElevenLabs without API key', () => {
    expect(() => createTTSProvider({ provider: 'elevenlabs' })).toThrow('ELEVENLABS_API_KEY');
  });

  it('returns OpenAITTSProvider with API key', () => {
    const provider = createTTSProvider({ provider: 'openai', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(OpenAITTSProvider);
    expect(provider.id).toBe('openai');
  });

  it('throws for OpenAI without API key', () => {
    expect(() => createTTSProvider({ provider: 'openai' })).toThrow('OPENAI_API_KEY');
  });

  it('throws for unknown provider', () => {
    expect(() => createTTSProvider({ provider: 'unknown' as never })).toThrow(
      'Unknown TTS provider'
    );
  });
});
