/**
 * Gemini Flash TTS provider — Google's Generative Language API
 * (`generativelanguage.googleapis.com`), model
 * `gemini-2.5-flash-preview-tts` (the current preview at the time of
 * writing; pass `modelName` to override).
 *
 * Why this endpoint and not Cloud TTS (`texttospeech.googleapis.com`):
 * - AI Studio keys (what users get from aistudio.google.com) work here
 *   out of the box, no GCP project / API enablement required.
 * - Cloud TTS refused AI Studio keys with SERVICE_DISABLED unless the
 *   owner had run `gcloud services enable texttospeech.googleapis.com`.
 * - Both endpoints share the same voice catalog (Charon, Kore, Aoede,
 *   etc.) and return 16-bit LINEAR PCM at 24 kHz, so downstream
 *   WAV-wrapping / Whisper / FFmpeg stays identical.
 *
 * Auth: API key as `?key=` query parameter. We accept it from any of
 * (in priority order) explicit config, `GOOGLE_TTS_API_KEY`, or the
 * same `GEMINI_API_KEY` already used by nano-banana / Veo 3.1. No
 * OAuth path — if the user needs OAuth (enterprise GCP), they'd move
 * to the Vertex AI endpoint, which deserves its own provider.
 */

import type { TTSProvider, TTSResult, TTSSynthesizeOptions, Voice } from '../types';
import { TTSError } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('gemini-tts');
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_SAMPLE_RATE = 24000;

/**
 * Full voice catalog for Gemini TTS. All voices work for every
 * supported language (the model infers accent from the text itself,
 * not from a separate languageCode field). Names are astronomical
 * bodies.
 */
const GEMINI_VOICES: readonly string[] = [
  'Achernar',
  'Achird',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Charon',
  'Despina',
  'Enceladus',
  'Erinome',
  'Fenrir',
  'Gacrux',
  'Iapetus',
  'Kore',
  'Laomedeia',
  'Leda',
  'Orus',
  'Puck',
  'Pulcherrima',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Sulafat',
  'Umbriel',
  'Vindemiatrix',
  'Zephyr',
  'Zubenelgenubi',
];

export interface GeminiTTSOptions extends TTSSynthesizeOptions {
  /**
   * Voice direction / style instruction prepended to the text
   * ("Say warmly:", "Narrate as a tense thriller:"). Gemini TTS
   * interprets prose prefixes naturally — we just concatenate.
   */
  readonly voicePrompt?: string;
  /**
   * Override the model. Defaults to `gemini-3.1-flash-tts-preview`.
   * Other options as of April 2026: `gemini-2.5-flash-preview-tts`,
   * `gemini-2.5-pro-preview-tts`.
   */
  readonly modelName?: string;
}

/**
 * Generative Language API response shape for
 * `/v1beta/models/{model}:generateContent` with AUDIO modality.
 */
interface GenerativeContentResponse {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly {
        readonly inlineData?: { readonly mimeType?: string; readonly data?: string };
      }[];
    };
  }[];
}

export class GeminiTTSProvider implements TTSProvider {
  readonly id = 'gemini-tts';
  readonly name = 'Gemini Flash TTS';

  private readonly apiKey: string;

  constructor(config: { apiKey?: string } = {}) {
    const key = config.apiKey ?? process.env.GOOGLE_TTS_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('Gemini TTS: set GEMINI_API_KEY (or GOOGLE_TTS_API_KEY).');
    }
    this.apiKey = key;
  }

  /**
   * Gemini TTS picks accent from the text content itself, so any
   * well-formed BCP-47 locale is fine. We accept `pl`, `pl-PL`,
   * `en-US`, etc. The API does not reject unknown codes — it just
   * infers from content.
   */
  supportsLanguage(lang: string): boolean {
    return /^[a-z]{2}(-[A-Za-z]{2})?$/.test(lang);
  }

  async synthesize(text: string, options: GeminiTTSOptions = {}): Promise<TTSResult> {
    const voice = options.voice ?? 'Charon';
    const modelName = options.modelName ?? DEFAULT_MODEL;
    const startTime = performance.now();

    // Prepend voice direction when present so Gemini steers delivery.
    // Trailing colon + space is Google's documented pattern for
    // distinguishing the instruction from the spoken text.
    const narrationText = options.voicePrompt
      ? `${options.voicePrompt.trim().replace(/[:.]$/, '')}: ${text}`
      : text;

    const body = {
      contents: [{ parts: [{ text: narrationText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    };

    const url = `${API_BASE}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    log.info(
      {
        voice,
        modelName,
        textLength: text.length,
        textPreview: text.substring(0, 200),
        hasPrompt: Boolean(options.voicePrompt),
        endpoint: url.split('?')[0],
      },
      'Gemini TTS request'
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
      redirect: 'error',
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const error = await response.text();
      log.warn(
        { status: response.status, durationMs, errorPreview: error.substring(0, 300) },
        'Gemini TTS failed'
      );
      throw new TTSError(`Gemini TTS synthesis failed: ${error}`, { status: response.status });
    }

    const json = (await response.json()) as GenerativeContentResponse;
    const inlineData = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!inlineData?.data) {
      throw new TTSError('Gemini TTS response missing inlineData audio payload');
    }

    // Gemini returns LINEAR16 PCM base64. Wrap as WAV so downstream
    // FFmpeg / Whisper stays identical to edge-tts and OpenAI TTS paths.
    const sampleRate = parseSampleRate(inlineData.mimeType) ?? DEFAULT_SAMPLE_RATE;
    const pcm = Buffer.from(inlineData.data, 'base64');
    const audioBuffer = wrapPcmAsWav(pcm, sampleRate);

    log.info(
      {
        durationMs,
        voice,
        modelName,
        textLength: text.length,
        sampleRate,
        audioSizeKB: Math.round(audioBuffer.length / 1024),
      },
      'Gemini TTS completed'
    );

    return {
      audioBuffer,
      format: 'wav',
      sampleRate,
    };
  }

  async listVoices(_language?: string): Promise<Voice[]> {
    return GEMINI_VOICES.map((v) => ({
      id: v,
      name: v,
      language: 'multilingual',
    }));
  }
}

/**
 * Extract sample rate from the Generative Language mime type
 * (`audio/L16;codec=pcm;rate=24000` → 24000). Falls back to undefined
 * when the header doesn't carry it.
 */
function parseSampleRate(mimeType: string | undefined): number | undefined {
  if (!mimeType) return undefined;
  const match = mimeType.match(/rate=(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

/** Minimal PCM16 → WAV wrapper. 44-byte RIFF header + raw PCM payload. */
function wrapPcmAsWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk1 size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
