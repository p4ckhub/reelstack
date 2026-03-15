export type { TTSProvider, TTSResult, TTSSynthesizeOptions, TTSConfig, Voice } from './types';
export { EdgeTTSProvider } from './providers/edge-tts';
export { ElevenLabsProvider } from './providers/elevenlabs';
export { OpenAITTSProvider } from './providers/openai-tts';
export { createTTSProvider } from './factory';
