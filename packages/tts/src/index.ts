export type { TTSProvider, TTSResult, TTSSynthesizeOptions, TTSConfig, Voice } from './types';
export { EdgeTTSProvider } from './providers/edge-tts';
export { ElevenLabsProvider } from './providers/elevenlabs';
export { OpenAITTSProvider } from './providers/openai-tts';
export { GeminiTTSProvider } from './providers/gemini-tts';
export type { GeminiTTSOptions } from './providers/gemini-tts';
export { createTTSProvider } from './factory';

// Voice prompt builder + TTS-friendly text guards (Gemini 3.1 Flash TTS).
export {
  buildVoicePrompt,
  VOICE_PRESETS,
  getVoicePreset,
  phoneticizeAcronyms,
  spellOutNumbers,
  makeTTSFriendly,
  stripAudioTags,
  stripDramaticAudioTags,
  type BuildVoicePromptInput,
  type BuildVoicePromptResult,
  type VoiceUseCase,
  type VoicePreset,
} from './voice-prompts';
