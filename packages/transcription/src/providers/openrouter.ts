/**
 * OpenRouter Provider - uses OpenRouter's audio transcription API.
 * Compatible with OpenAI Whisper API format.
 * Supports timestamp_granularities: ['word'] for per-word timing.
 */
import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionWord,
  TranscribeOptions,
  OpenRouterConfig,
} from '../types';
import { pcmToWavBlob } from '../audio-extractor';
import { createLogger } from '@reelstack/logger';

const log = createLogger('openrouter-transcription');

interface OpenAIWord {
  word: string;
  start: number;
  end: number;
}

interface OpenAITranscriptionResponse {
  text: string;
  words?: OpenAIWord[];
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export class OpenRouterProvider implements TranscriptionProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter (Cloud Whisper)';
  readonly isLocal = false;

  private apiKey: string;
  private model: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'openai/gpt-4o-transcribe';
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
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
    formData.append('model', this.model);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    if (options?.language) {
      formData.append('language', options.language);
    }

    options?.onProgress?.({
      status: 'transcribing',
      progress: 50,
      message: 'Uploading to OpenRouter...',
    });

    const audioDurationSec = audio.length / sampleRate;
    const startTime = performance.now();

    log.info(
      {
        model: this.model,
        audioDurationSec: Math.round(audioDurationSec * 10) / 10,
        audioSamples: audio.length,
        sampleRate,
        language: options?.language,
        endpoint: 'https://openrouter.ai/api/v1/audio/transcriptions',
      },
      'OpenRouter transcription request'
    );

    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
      signal: options?.signal ?? AbortSignal.timeout(120_000),
      redirect: 'error',
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const text = await response.text();
      log.warn(
        { status: response.status, durationMs, errorPreview: text.substring(0, 300) },
        'OpenRouter transcription failed'
      );
      throw new Error(`OpenRouter transcription failed: ${response.status} - ${text}`);
    }

    let data: OpenAITranscriptionResponse;
    try {
      data = await response.json();
    } catch {
      throw new Error('Failed to parse response from OpenRouter');
    }

    options?.onProgress?.({
      status: 'completed',
      progress: 100,
      message: 'Transcription complete',
    });

    const words: TranscriptionWord[] = (data.words ?? []).map((w) => ({
      text: w.word,
      startTime: w.start,
      endTime: w.end,
    }));

    const duration = audio.length / sampleRate;

    log.info(
      {
        durationMs,
        model: this.model,
        wordCount: words.length,
        textLength: data.text?.length ?? 0,
        audioDurationSec: Math.round(duration * 10) / 10,
      },
      'OpenRouter transcription completed'
    );

    return {
      words,
      text: data.text?.trim() ?? '',
      language: options?.language ?? 'auto',
      duration,
    };
  }
}
