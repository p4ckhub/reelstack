/**
 * Ollama Provider - uses locally-running Ollama instance for transcription.
 * Ollama supports Whisper models via its API.
 */
import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionWord,
  TranscribeOptions,
  OllamaConfig,
} from '../types';
import { pcmToWavBlob } from '../audio-extractor';

export class OllamaProvider implements TranscriptionProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Self-hosted)';
  readonly isLocal = false; // runs on local network but not in-browser

  private baseUrl: string;
  private model: string;

  constructor(config: OllamaConfig) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.model ?? 'whisper';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return false;
      const data: { models?: Array<{ name: string }> } = await response.json();
      return data.models?.some((m) => m.name.includes(this.model)) ?? false;
    } catch {
      return false;
    }
  }

  async transcribe(
    audio: Float32Array,
    sampleRate: number,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    options?.onProgress?.({
      status: 'transcribing',
      progress: 30,
      message: 'Preparing audio for Ollama...',
    });

    const wavBlob = pcmToWavBlob(audio, sampleRate);
    const wavBuffer = await wavBlob.arrayBuffer();
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(wavBuffer)),
    );

    options?.onProgress?.({
      status: 'transcribing',
      progress: 50,
      message: 'Sending to Ollama...',
    });

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: 'Transcribe the following audio with word-level timestamps.',
        images: [base64Audio], // Ollama uses images field for binary data
        stream: false,
      }),
      signal: options?.signal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama transcription failed: ${response.status} - ${text}`);
    }

    const data: { response: string } = await response.json();

    options?.onProgress?.({
      status: 'completed',
      progress: 100,
      message: 'Transcription complete',
    });

    // Ollama returns plain text - we create evenly-spaced word timing
    // since Ollama's Whisper doesn't natively return word timestamps
    const duration = audio.length / sampleRate;
    const rawWords = data.response.trim().split(/\s+/).filter(Boolean);
    const wordDuration = rawWords.length > 0 ? duration / rawWords.length : 0;

    const words: TranscriptionWord[] = rawWords.map((text, i) => ({
      text,
      startTime: i * wordDuration,
      endTime: (i + 1) * wordDuration,
    }));

    return {
      words,
      text: data.response.trim(),
      language: options?.language ?? 'auto',
      duration,
    };
  }
}
