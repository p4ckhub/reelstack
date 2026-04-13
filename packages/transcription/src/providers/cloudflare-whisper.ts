/**
 * Cloudflare Workers AI Whisper Provider.
 * Sends audio to Cloudflare's @cf/openai/whisper model.
 * Returns word-level timestamps.
 */
import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionWord,
  TranscribeOptions,
  CloudflareWhisperConfig,
} from '../types';
import { pcmToWavBlob } from '../audio-extractor';
import { createLogger } from '@reelstack/logger';

const log = createLogger('cloudflare-whisper');

interface CloudflareWhisperWord {
  word: string;
  start: number;
  end: number;
}

interface CloudflareResponse {
  result: {
    text: string;
    word_count?: number;
    words?: CloudflareWhisperWord[];
    vtt?: string;
  };
  success: boolean;
  errors: Array<{ message: string }>;
}

export class CloudflareWhisperProvider implements TranscriptionProvider {
  readonly id = 'cloudflare';
  readonly name = 'Cloudflare Workers AI (Whisper)';
  readonly isLocal = false;

  private apiToken: string;
  private accountId: string;

  constructor(config: CloudflareWhisperConfig) {
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiToken && this.accountId);
  }

  async transcribe(
    audio: Float32Array,
    sampleRate: number,
    options?: TranscribeOptions
  ): Promise<TranscriptionResult> {
    options?.onProgress?.({
      status: 'transcribing',
      progress: 30,
      message: 'Preparing audio for upload...',
    });

    const wavBlob = pcmToWavBlob(audio, sampleRate);
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');

    options?.onProgress?.({
      status: 'transcribing',
      progress: 50,
      message: 'Uploading to Cloudflare Workers AI...',
    });

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/openai/whisper`;
    const audioDurationSec = audio.length / sampleRate;
    const startTime = performance.now();

    log.info(
      {
        audioDurationSec: Math.round(audioDurationSec * 10) / 10,
        audioSamples: audio.length,
        sampleRate,
        language: options?.language,
        endpoint: url,
      },
      'Cloudflare Whisper request'
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}` },
      body: formData,
      signal: options?.signal ?? AbortSignal.timeout(120_000),
      redirect: 'error',
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      if (response.status === 429) {
        log.warn({ status: 429, durationMs }, 'Cloudflare Whisper rate limited');
        throw new Error('Rate limit reached. Please wait before transcribing more audio.');
      }
      const text = await response.text();
      log.warn(
        { status: response.status, durationMs, errorPreview: text.substring(0, 300) },
        'Cloudflare Whisper failed'
      );
      throw new Error(`Cloudflare transcription failed: ${response.status} - ${text}`);
    }

    const data: CloudflareResponse = await response.json();

    if (!data.success) {
      log.warn(
        { durationMs, errors: data.errors.map((e) => e.message) },
        'Cloudflare Whisper returned error'
      );
      throw new Error(`Cloudflare error: ${data.errors.map((e) => e.message).join(', ')}`);
    }

    options?.onProgress?.({
      status: 'completed',
      progress: 100,
      message: 'Transcription complete',
    });

    const words: TranscriptionWord[] = (data.result.words ?? []).map((w) => ({
      text: w.word,
      startTime: w.start,
      endTime: w.end,
    }));

    const duration = audio.length / sampleRate;

    log.info(
      {
        durationMs,
        wordCount: words.length,
        textLength: data.result.text?.length ?? 0,
        audioDurationSec: Math.round(duration * 10) / 10,
      },
      'Cloudflare Whisper completed'
    );

    return {
      words,
      text: data.result.text?.trim() ?? '',
      language: options?.language ?? 'auto',
      duration,
    };
  }
}
