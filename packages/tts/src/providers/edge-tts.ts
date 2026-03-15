import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { TTSProvider, TTSResult, TTSSynthesizeOptions, Voice } from '../types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('edge-tts');

const DEFAULT_VOICE_PL = 'pl-PL-ZofiaNeural';
const DEFAULT_VOICE_EN = 'en-US-AriaNeural';

export class EdgeTTSProvider implements TTSProvider {
  readonly id = 'edge-tts';
  readonly name = 'Microsoft Edge TTS';

  private defaultLanguage: string;

  constructor(defaultLanguage = 'pl-PL') {
    this.defaultLanguage = defaultLanguage;
  }

  supportsLanguage(lang: string): boolean {
    // Edge TTS supports ~300 voices across many languages
    return true;
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<TTSResult> {
    const tts = new MsEdgeTTS();
    const lang = options?.language ?? this.defaultLanguage;
    const voice = options?.voice ?? (lang.startsWith('pl') ? DEFAULT_VOICE_PL : DEFAULT_VOICE_EN);
    const startTime = performance.now();

    log.info(
      { voice, language: lang, textLength: text.length, textPreview: text.substring(0, 200) },
      'Edge TTS request'
    );

    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const prosody: { rate?: number; pitch?: string } = {};
    if (options?.rate) prosody.rate = options.rate;
    if (options?.pitch) prosody.pitch = options.pitch;

    const { audioStream } = tts.toStream(text, prosody);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }

    tts.close();

    const audioBuffer = Buffer.concat(chunks);
    const durationMs = Math.round(performance.now() - startTime);

    log.info(
      {
        durationMs,
        voice,
        textLength: text.length,
        audioSizeKB: Math.round(audioBuffer.length / 1024),
      },
      'Edge TTS completed'
    );

    return {
      audioBuffer,
      format: 'mp3',
      sampleRate: 24000,
    };
  }

  async listVoices(language?: string): Promise<Voice[]> {
    const tts = new MsEdgeTTS();
    const rawVoices = await tts.getVoices();
    tts.close();

    return rawVoices
      .filter((v) => !language || v.Locale.toLowerCase().startsWith(language.toLowerCase()))
      .map((v) => ({
        id: v.ShortName,
        name: v.FriendlyName,
        language: v.Locale,
        gender: v.Gender.toLowerCase() === 'male' ? ('male' as const) : ('female' as const),
      }));
  }
}
