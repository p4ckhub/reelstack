/**
 * Local Whisper Provider - runs Whisper ONNX model entirely in the browser.
 * Uses @huggingface/transformers (Transformers.js) with return_timestamps: 'word'.
 */
import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionWord,
  TranscribeOptions,
  LocalWhisperConfig,
} from '../types';

const MODEL_MAP = {
  tiny: 'Xenova/whisper-tiny',
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
} as const;

export class LocalWhisperProvider implements TranscriptionProvider {
  readonly id = 'local';
  readonly name = 'Local (Whisper in Browser)';
  readonly isLocal = true;

  private pipeline: unknown = null;
  private modelId: string;

  constructor(config: LocalWhisperConfig = { provider: 'local' }) {
    this.modelId = MODEL_MAP[config.model ?? 'tiny'];
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if @huggingface/transformers is installed
      await import('@huggingface/transformers');
      return true;
    } catch {
      return false;
    }
  }

  async transcribe(
    audio: Float32Array,
    sampleRate: number,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    const { pipeline: createPipeline } = await import('@huggingface/transformers');

    // Load model if not cached
    if (!this.pipeline) {
      options?.onProgress?.({
        status: 'loading-model',
        progress: 10,
        message: `Loading Whisper model (${this.modelId})...`,
      });

      this.pipeline = await createPipeline(
        'automatic-speech-recognition',
        this.modelId,
        {
          dtype: 'q8',
          device: 'wasm',
        },
      );
    }

    options?.onProgress?.({
      status: 'transcribing',
      progress: 40,
      message: 'Transcribing audio...',
    });

    if (options?.signal?.aborted) {
      throw new Error('Transcription cancelled');
    }

    const pipe = this.pipeline as (
      input: Float32Array,
      opts: Record<string, unknown>,
    ) => Promise<{
      text: string;
      chunks?: Array<{
        text: string;
        timestamp: [number, number | null];
      }>;
    }>;

    const result = await pipe(audio, {
      return_timestamps: 'word',
      language: options?.language ?? null,
      task: 'transcribe',
    });

    options?.onProgress?.({
      status: 'completed',
      progress: 100,
      message: 'Transcription complete',
    });

    const words: TranscriptionWord[] = (result.chunks ?? [])
      .filter((chunk) => chunk.timestamp[1] != null)
      .map((chunk) => ({
        text: chunk.text.trim(),
        startTime: chunk.timestamp[0],
        endTime: chunk.timestamp[1]!,
      }))
      .filter((w) => w.text.length > 0);

    const duration = audio.length / sampleRate;

    return {
      words,
      text: result.text?.trim() ?? '',
      language: options?.language ?? 'auto',
      duration,
    };
  }

  dispose(): void {
    this.pipeline = null;
  }
}
