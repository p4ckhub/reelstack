import type { TTSProvider, TTSResult, TTSSynthesizeOptions, Voice } from '../types';
import { TTSError } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('elevenlabs-tts');
const API_BASE = 'https://api.elevenlabs.io/v1';

export class ElevenLabsProvider implements TTSProvider {
  readonly id = 'elevenlabs';
  readonly name = 'ElevenLabs';

  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('ElevenLabs API key is required');
    this.apiKey = apiKey;
  }

  supportsLanguage(_lang: string): boolean {
    // ElevenLabs supports 29+ languages including Polish
    return true;
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<TTSResult> {
    const voiceId = options?.voice ?? process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB'; // env → Adam fallback
    const startTime = performance.now();

    log.info(
      {
        voiceId,
        textLength: text.length,
        textPreview: text.substring(0, 200),
        model: 'eleven_multilingual_v2',
        endpoint: `${API_BASE}/text-to-speech/${voiceId}`,
      },
      'ElevenLabs TTS request'
    );

    const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const error = await response.text();
      log.warn(
        { status: response.status, durationMs, errorPreview: error.substring(0, 300) },
        'ElevenLabs TTS failed'
      );
      throw new TTSError(`ElevenLabs synthesis failed: ${error}`, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    log.info(
      {
        durationMs,
        voiceId,
        textLength: text.length,
        audioSizeKB: Math.round(audioBuffer.length / 1024),
      },
      'ElevenLabs TTS completed'
    );

    return {
      audioBuffer,
      format: 'mp3',
      sampleRate: 44100,
    };
  }

  async listVoices(_language?: string): Promise<Voice[]> {
    const response = await fetch(`${API_BASE}/voices`, {
      headers: { 'xi-api-key': this.apiKey },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });

    if (!response.ok) {
      throw new TTSError('ElevenLabs listVoices failed', { status: response.status });
    }

    let data: {
      voices: Array<{
        voice_id: string;
        name: string;
        labels?: Record<string, string>;
        preview_url?: string;
      }>;
    };
    try {
      data = await response.json();
    } catch {
      throw new TTSError('Failed to parse response from ElevenLabs');
    }

    return data.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      language: v.labels?.language ?? 'en',
      gender: (v.labels?.gender as 'male' | 'female') ?? undefined,
      preview_url: v.preview_url,
    }));
  }
}
