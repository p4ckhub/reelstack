// Types
export type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionWord,
  TranscriptionProgress,
  TranscriptionStatus,
  TranscribeOptions,
  ProviderConfig,
  LocalWhisperConfig,
  CloudflareWhisperConfig,
  OpenRouterConfig,
  OllamaConfig,
  WordGroupingConfig,
} from './types';
export { DEFAULT_GROUPING_CONFIG } from './types';

// Audio extraction
export { extractAudioFromFile, extractAudioFromElement, pcmToWavBlob } from './audio-extractor';

// Word grouping
export { groupWordsIntoCues } from './word-grouper';

// Word alignment (replace Whisper text with original script, keep timings)
export { alignWordsWithScript } from './word-aligner';

// Providers
export {
  createProvider,
  LocalWhisperProvider,
  CloudflareWhisperProvider,
  OpenRouterProvider,
  OllamaProvider,
} from './providers';
