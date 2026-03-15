import type { TTSConfig, TTSProvider } from './types';
import { TTSError } from '@reelstack/types';
import { EdgeTTSProvider } from './providers/edge-tts';
import { ElevenLabsProvider } from './providers/elevenlabs';
import { OpenAITTSProvider } from './providers/openai-tts';

/**
 * Creates a TTS provider from config.
 * Falls back to Edge TTS (free, no API key) if no config provided.
 */
export function createTTSProvider(config?: TTSConfig): TTSProvider {
  if (!config) {
    return new EdgeTTSProvider();
  }

  switch (config.provider) {
    case 'elevenlabs':
      if (!config.apiKey) throw new TTSError('ElevenLabs requires ELEVENLABS_API_KEY environment variable');
      return new ElevenLabsProvider(config.apiKey);

    case 'openai':
      if (!config.apiKey) throw new TTSError('OpenAI TTS requires OPENAI_API_KEY environment variable');
      return new OpenAITTSProvider(config.apiKey);

    case 'edge-tts':
      return new EdgeTTSProvider(config.defaultLanguage);

    default:
      throw new TTSError(`Unknown TTS provider: ${(config as TTSConfig).provider}`);
  }
}
