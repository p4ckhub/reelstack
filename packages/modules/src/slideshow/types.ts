import type { ProductionStep, BrandPreset } from '@reelstack/agent';

export interface Slide {
  title: string;
  text?: string;
  badge?: string;
  num?: string;
  template?: string;
}

export interface SlideshowScript {
  topic: string;
  hook: string;
  slides: Slide[];
  cta: string;
  fullNarration: string;
}

export interface SlideshowRequest {
  jobId?: string;
  topic: string;
  slides?: Slide[];
  numberOfSlides?: number;
  template?: string;
  brand?: string;
  highlightMode?: string;
  language?: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai';
    voice?: string;
    language?: string;
  };
  whisper?: {
    provider?: 'openrouter' | 'cloudflare' | 'ollama';
    apiKey?: string;
  };
  brandPreset?: BrandPreset;
  musicUrl?: string;
  musicVolume?: number;
  llmCall?: (prompt: string) => Promise<string>;
  outputPath?: string;
  onProgress?: (step: string) => void;
}

export interface SlideshowResult {
  outputPath: string;
  durationSeconds: number;
  script: SlideshowScript;
  steps: ProductionStep[];
}
