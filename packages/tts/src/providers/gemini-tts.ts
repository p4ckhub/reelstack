/**
 * Gemini Flash TTS provider — Google Cloud Text-to-Speech with the
 * `gemini-3.1-flash-tts-preview` model.
 *
 * Why it's worth a separate provider:
 * - Multilingual out of the box (30+ voices, all voices work for every
 *   supported locale including Polish)
 * - `input.prompt` lets you STEER the voice ("Read aloud in a warm,
 *   welcoming tone.") — no other TTS in our stack does this
 * - Preview pricing is competitive with edge-tts for the quality level
 *
 * Auth strategy: Google Cloud TTS historically requires OAuth2. We
 * support three routes, in priority order:
 *   1. `GOOGLE_TTS_ACCESS_TOKEN` — pre-generated OAuth token (e.g.
 *      `gcloud auth application-default print-access-token`)
 *   2. `GOOGLE_TTS_API_KEY` — Google Cloud API key (if the user's
 *      project has API-key auth enabled for the Text-to-Speech API)
 *   3. Throws with a clear "set one of..." error
 *
 * Default output: LINEAR16 PCM wrapped in a WAV container at 24 kHz —
 * same shape the Whisper step already handles from edge-tts.
 */

import type { TTSProvider, TTSResult, TTSSynthesizeOptions, Voice } from '../types';
import { TTSError } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('gemini-tts');
const API_BASE = 'https://texttospeech.googleapis.com/v1';
const DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_SAMPLE_RATE = 24000;

/**
 * Full voice catalog for Gemini TTS. All voices work for every
 * supported language code (the model picks accent from the languageCode
 * field, not the voice name). Names are astronomical bodies.
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
   * Voice direction / style instruction. Gemini TTS interprets this
   * alongside the text (e.g. "Read aloud in a warm, welcoming tone.",
   * "Speak as if recounting a tense thriller."). Optional.
   */
  readonly voicePrompt?: string;
  /**
   * Override the model. Defaults to `gemini-3.1-flash-tts-preview`.
   * Use `gemini-2.5-flash-tts` for the GA release once preview is lifted.
   */
  readonly modelName?: string;
}

export class GeminiTTSProvider implements TTSProvider {
  readonly id = 'gemini-tts';
  readonly name = 'Gemini Flash TTS';

  private readonly apiKey?: string;
  private readonly accessToken?: string;

  constructor(config: { apiKey?: string; accessToken?: string } = {}) {
    this.apiKey = config.apiKey ?? process.env.GOOGLE_TTS_API_KEY;
    this.accessToken = config.accessToken ?? process.env.GOOGLE_TTS_ACCESS_TOKEN;
    if (!this.apiKey && !this.accessToken) {
      throw new Error('Gemini TTS: set GOOGLE_TTS_ACCESS_TOKEN (preferred) or GOOGLE_TTS_API_KEY.');
    }
  }

  /**
   * Gemini TTS is multilingual — every voice covers every supported
   * language via the `languageCode` field. Locale codes follow the
   * BCP-47 pattern (`pl-PL`, `en-US`, etc.). We accept any well-formed
   * code; the API will reject invalid ones at request time.
   */
  supportsLanguage(lang: string): boolean {
    return /^[a-z]{2}(-[A-Z]{2})?$/.test(lang);
  }

  async synthesize(text: string, options: GeminiTTSOptions = {}): Promise<TTSResult> {
    const voice = options.voice ?? 'Charon';
    const rate = options.rate ?? 1.0;
    const pitchNumber = parsePitch(options.pitch);
    // Google expects BCP-47 with uppercase region. User's sample payload
    // used lowercase ("pl-pl") which works in practice but we normalize
    // to the documented canonical form.
    const languageCode = normalizeLocale(options.language ?? 'en-US');
    const modelName = options.modelName ?? DEFAULT_MODEL;
    const startTime = performance.now();

    const body: Record<string, unknown> = {
      input: {
        text,
        ...(options.voicePrompt ? { prompt: options.voicePrompt } : {}),
      },
      voice: {
        languageCode,
        name: voice,
        modelName,
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: DEFAULT_SAMPLE_RATE,
        speakingRate: rate,
        pitch: pitchNumber,
      },
    };

    const { url, authHeaders } = this.buildRequest();

    log.info(
      {
        voice,
        languageCode,
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
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
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

    const json = (await response.json()) as { audioContent?: string };
    if (!json.audioContent) {
      throw new TTSError('Gemini TTS response missing audioContent field');
    }

    // The API returns raw LINEAR16 PCM bytes, base64-encoded. Wrap in a
    // WAV container so downstream FFmpeg / Whisper stays happy.
    const pcm = Buffer.from(json.audioContent, 'base64');
    const audioBuffer = wrapPcmAsWav(pcm, DEFAULT_SAMPLE_RATE);

    log.info(
      {
        durationMs,
        voice,
        languageCode,
        textLength: text.length,
        audioSizeKB: Math.round(audioBuffer.length / 1024),
      },
      'Gemini TTS completed'
    );

    return {
      audioBuffer,
      format: 'wav',
      sampleRate: DEFAULT_SAMPLE_RATE,
    };
  }

  async listVoices(_language?: string): Promise<Voice[]> {
    // Voices are multilingual — we return the full catalog labeled as
    // such. Callers that want to filter by a specific locale can do so
    // with a display-hint; the API itself accepts any voice+locale combo.
    return GEMINI_VOICES.map((v) => ({
      id: v,
      name: v,
      language: 'multilingual',
    }));
  }

  private buildRequest(): { url: string; authHeaders: Record<string, string> } {
    const path = `${API_BASE}/text:synthesize`;
    if (this.accessToken) {
      return { url: path, authHeaders: { Authorization: `Bearer ${this.accessToken}` } };
    }
    // API key as query string — identical to the pattern Google uses for
    // Gemini API; Cloud TTS supports it when the key has the right
    // restrictions set in the GCP console.
    const url = `${path}?key=${encodeURIComponent(this.apiKey as string)}`;
    return { url, authHeaders: {} };
  }
}

/** Convert legacy pitch strings ("+2st", "-1st") into the numeric
 *  semitones Google expects. Accepts a number directly too. */
function parsePitch(pitch: string | undefined): number {
  if (!pitch) return 0;
  const match = pitch.toString().match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return parseFloat(match[1]);
}

function normalizeLocale(locale: string): string {
  const [lang, region] = locale.split('-');
  if (!lang) return 'en-US';
  return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
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
