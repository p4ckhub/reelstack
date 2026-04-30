export interface Voice {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly gender?: 'male' | 'female' | 'neutral';
  readonly preview_url?: string;
}

export interface TTSResult {
  /** Raw audio buffer (WAV or MP3 depending on provider) */
  readonly audioBuffer: Buffer;
  /** Audio format */
  readonly format: 'wav' | 'mp3' | 'pcm';
  /** Sample rate in Hz */
  readonly sampleRate: number;
  /** Duration in seconds (if known) */
  readonly durationSeconds?: number;
}

export interface TTSSynthesizeOptions {
  /** Voice ID (provider-specific) */
  readonly voice?: string;
  /** Language code (e.g. 'pl-PL', 'en-US') */
  readonly language?: string;
  /** Speech rate multiplier (1.0 = normal) */
  readonly rate?: number;
  /** Pitch adjustment */
  readonly pitch?: string;
  /** Output format preference */
  readonly outputFormat?: 'wav' | 'mp3';
  /**
   * Style/persona/director-notes prefix that steers delivery. Currently honored
   * by Gemini TTS (3-section "Audio Profile + Scene + Director's Notes" pattern).
   * Other providers ignore it. Build via `buildVoicePrompt()` in voice-prompts/.
   */
  readonly voicePrompt?: string;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;

  /** Check if this provider supports a given language */
  supportsLanguage(lang: string): boolean;

  /** Generate speech audio from text */
  synthesize(text: string, options?: TTSSynthesizeOptions): Promise<TTSResult>;

  /** List available voices */
  listVoices(language?: string): Promise<Voice[]>;
}

export interface TTSConfig {
  readonly provider: 'elevenlabs' | 'edge-tts' | 'openai' | 'gemini-tts';
  readonly apiKey?: string;
  readonly defaultVoice?: string;
  readonly defaultLanguage?: string;
}
