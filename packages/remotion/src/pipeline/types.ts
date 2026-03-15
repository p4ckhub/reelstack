import type { ReelProps } from '../schemas/reel-props';

export interface ReelCreationRequest {
  /** Script text to convert to voiceover */
  readonly script: string;
  /** Layout type */
  readonly layout: 'split-screen' | 'fullscreen' | 'picture-in-picture';
  /** TTS provider config */
  readonly tts?: {
    readonly provider?: 'edge-tts' | 'elevenlabs' | 'openai';
    readonly voice?: string;
    readonly language?: string;
  };
  /** Whisper provider config */
  readonly whisper?: {
    readonly provider?: 'openrouter' | 'cloudflare' | 'ollama';
    readonly apiKey?: string;
  };
  /** Primary video (talking head) - URL or filename in public/ */
  readonly primaryVideoUrl?: string;
  /** Secondary video (screen recording) - URL or filename in public/ */
  readonly secondaryVideoUrl?: string;
  /** Brand preset for AI Director (optional) */
  readonly brandPreset?: BrandPreset;
  /** Editing style for AI Director */
  readonly style?: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  /** Output path for rendered MP4 */
  readonly outputPath?: string;
}

export interface CaptionTemplate {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontColor?: string;
  readonly backgroundColor?: string;
}

export interface BrandPreset {
  readonly captionTemplate?: CaptionTemplate;
  readonly highlightColor?: string;
  readonly backgroundColor?: string;
  readonly defaultTransition?: 'crossfade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'wipe' | 'none';
}

export interface ReelCreationResult {
  readonly outputPath: string;
  readonly durationSeconds: number;
  readonly props: ReelProps;
  readonly steps: PipelineStep[];
}

export interface PipelineStep {
  readonly name: string;
  readonly durationMs: number;
  readonly detail?: string;
}
