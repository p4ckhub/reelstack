import type { TTSProvider, TTSResult, TTSSynthesizeOptions, Voice } from '../types';
import { TTSError } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('openai-tts');
const API_BASE = 'https://api.openai.com/v1';

const VOICES = [
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
] as const;

export class OpenAITTSProvider implements TTSProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI TTS';

  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('OpenAI API key is required');
    this.apiKey = apiKey;
  }

  supportsLanguage(_lang: string): boolean {
    return true;
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<TTSResult> {
    const voice = options?.voice ?? 'nova';
    const speed = options?.rate ?? 1.0;
    const startTime = performance.now();

    log.info(
      {
        voice,
        speed,
        model: 'tts-1',
        textLength: text.length,
        textPreview: text.substring(0, 200),
        endpoint: `${API_BASE}/audio/speech`,
      },
      'OpenAI TTS request'
    );

    const response = await fetch(`${API_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        speed,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const error = await response.text();
      log.warn(
        { status: response.status, durationMs, errorPreview: error.substring(0, 300) },
        'OpenAI TTS failed'
      );
      throw new TTSError(`OpenAI TTS synthesis failed: ${error}`, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    log.info(
      {
        durationMs,
        voice,
        textLength: text.length,
        audioSizeKB: Math.round(audioBuffer.length / 1024),
      },
      'OpenAI TTS completed'
    );

    return {
      audioBuffer,
      format: 'mp3',
      sampleRate: 24000,
    };
  }

  async listVoices(_language?: string): Promise<Voice[]> {
    return VOICES.map((v) => ({
      id: v,
      name: v.charAt(0).toUpperCase() + v.slice(1),
      language: 'multilingual',
    }));
  }
}
