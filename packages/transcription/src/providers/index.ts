import type { ProviderConfig, TranscriptionProvider } from '../types';
import { LocalWhisperProvider } from './local-whisper';
import { CloudflareWhisperProvider } from './cloudflare-whisper';
import { OpenRouterProvider } from './openrouter';
import { OllamaProvider } from './ollama';

/**
 * Factory function to create a TranscriptionProvider from config.
 */
export function createProvider(config: ProviderConfig): TranscriptionProvider {
  switch (config.provider) {
    case 'local':
      return new LocalWhisperProvider(config);
    case 'cloudflare':
      return new CloudflareWhisperProvider(config);
    case 'openrouter':
      return new OpenRouterProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unknown transcription provider: ${(config as { provider: string }).provider}`);
  }
}

export { LocalWhisperProvider } from './local-whisper';
export { CloudflareWhisperProvider } from './cloudflare-whisper';
export { OpenRouterProvider } from './openrouter';
export { OllamaProvider } from './ollama';
