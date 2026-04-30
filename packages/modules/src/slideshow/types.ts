import type { ProductionStep, BrandPreset, ModuleRuntime, EndCardConfig } from '@reelstack/agent';

export interface Slide {
  title: string;
  text?: string;
  badge?: string;
  num?: string;
  template?: string;
  /**
   * Pass-through for template-specific params (titleHighlight, subtitle,
   * bullets, features, price, price2, heading, attr, logo, ...). Forwarded
   * verbatim to image-gen renderToFile, so any param accepted by the chosen
   * template can be set here. Allows pack templates like comparison or
   * carousel-hook to receive full params, not just the lowest-common-denominator
   * (title/text/badge/num).
   */
  [key: string]: string | undefined;
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
  /**
   * Image-gen size preset for slide rendering.
   * - `story` (1080×1920, 9:16) — default, IG/TikTok stories & reels
   * - `carousel` (1080×1350, 4:5) — IG feed video, matches carousel aspect
   * - `post` (1080×1080, 1:1) — square IG/FB feed
   * - `WxH` custom dimensions
   * Defaults to 'story' for backward compatibility.
   */
  size?: string;
  highlightMode?: string;
  /**
   * Per-request caption style overrides. Most useful field is `position`
   * (0-100, % from top of frame) — default 65 puts captions in the
   * cross-platform safe zone above all social media UI overlays.
   */
  captionStyle?: {
    position?: number;
    fontSize?: number;
    fontColor?: string;
    highlightColor?: string;
    backgroundColor?: string;
    backgroundOpacity?: number;
    padding?: number;
    outlineWidth?: number;
    outlineColor?: string;
    shadowBlur?: number;
  };
  language?: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai' | 'gemini-tts';
    voice?: string;
    language?: string;
  };
  whisper?: {
    provider?: 'openai' | 'cloudflare' | 'whisper-cpp' | 'synthetic';
    apiKey?: string;
  };
  brandPreset?: BrandPreset;
  musicUrl?: string;
  musicVolume?: number;
  llmCall?: (prompt: string) => Promise<string>;
  outputPath?: string;
  onProgress?: (step: string) => void;
  /** Render runtime (default: 'remotion'). Set 'hyperframes' for HF render. */
  runtime?: ModuleRuntime;
  /**
   * Closing CTA card. When set, picks per-platform copy from the shared
   * template registry (see `@reelstack/agent`'s `resolveEndCard`).
   * `endCard: { platform: 'ig' }` is enough — copy fields default from
   * the template + module fallback. Omit for "no end card".
   */
  endCard?: EndCardConfig;
}

export interface SlideshowResult {
  outputPath: string;
  durationSeconds: number;
  script: SlideshowScript;
  steps: ProductionStep[];
}
