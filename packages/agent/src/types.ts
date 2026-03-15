/**
 * Core types for the AI Production Agent.
 */

// ── Asset types ──────────────────────────────────────────────

export type AssetType =
  | 'avatar-video'
  | 'ai-video'
  | 'ai-image'
  | 'stock-video'
  | 'stock-image'
  | 'user-recording';

export type CostTier = 'free' | 'cheap' | 'moderate' | 'expensive';

export interface ToolCapability {
  readonly assetType: AssetType;
  /** Can generate from a text prompt? */
  readonly supportsPrompt: boolean;
  /** Can handle a full script (e.g. HeyGen talking head)? */
  readonly supportsScript: boolean;
  readonly maxDurationSeconds?: number;
  /** Typical generation time in ms */
  readonly estimatedLatencyMs: number;
  /** Requires polling for completion? */
  readonly isAsync: boolean;
  readonly costTier: CostTier;
}

// ── Tool manifest (for LLM prompt) ──────────────────────────

export interface ToolManifestEntry {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
  readonly capabilities: readonly ToolCapability[];
  readonly promptGuidelines?: string;
}

export interface ToolManifest {
  readonly tools: readonly ToolManifestEntry[];
  readonly summary: string;
}

// ── Asset generation ─────────────────────────────────────────

export interface AssetGenerationRequest {
  /** What the asset is for (e.g. "B-roll at 5s: city skyline") */
  readonly purpose: string;
  /** Text prompt for generation */
  readonly prompt?: string;
  /** Full script for talking-head tools */
  readonly script?: string;
  /** Voice ID for avatar tools */
  readonly voice?: string;
  /** Avatar ID for HeyGen */
  readonly avatarId?: string;
  /** Desired duration in seconds */
  readonly durationSeconds?: number;
  /** Aspect ratio */
  readonly aspectRatio?: '9:16' | '16:9' | '1:1';
  /** Search query (for stock tools) */
  readonly searchQuery?: string;
  /** Source image URL for image-to-video generation */
  readonly imageUrl?: string;
}

export interface AssetGenerationJob {
  readonly jobId: string;
  readonly toolId: string;
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  /** URL of the generated asset (set when completed) */
  readonly url?: string;
  /** Duration of generated video in seconds */
  readonly durationSeconds?: number;
  readonly error?: string;
}

export type AssetGenerationStatus = AssetGenerationJob;

// ── Production plan (LLM planner output) ─────────────────────

export interface ProductionPlan {
  readonly primarySource:
    | {
        readonly type: 'avatar';
        readonly toolId: string;
        readonly script: string;
        readonly voice?: string;
        readonly avatarId?: string;
      }
    | { readonly type: 'user-recording'; readonly url: string }
    | { readonly type: 'ai-video'; readonly toolId: string; readonly prompt: string }
    | { readonly type: 'none' };

  readonly shots: readonly ShotPlan[];
  readonly effects: readonly EffectPlan[];
  readonly zoomSegments: readonly ZoomSegmentPlan[];
  readonly lowerThirds: readonly LowerThirdPlan[];
  readonly counters: readonly CounterPlan[];
  readonly highlights: readonly HighlightPlan[];
  readonly ctaSegments: readonly CtaPlan[];
  readonly pipSegments?: readonly PipSegmentPlan[];
  /** Animation pool for B-roll segments (template-driven, consumed by assembler) */
  readonly animationPool?: readonly string[];
  readonly layout:
    | 'fullscreen'
    | 'split-screen'
    | 'picture-in-picture'
    | 'anchor-bottom'
    | 'hybrid-anchor'
    | 'comparison-split';
  readonly captionStyle?: Record<string, unknown>;
  readonly scrollStopper?: { readonly preset: string; readonly durationSeconds?: number };
  readonly sfxSegments?: readonly {
    readonly startTime: number;
    readonly sfxId: string;
    readonly volume?: number;
  }[];
  readonly reasoning: string;
}

export interface PipSegmentPlan {
  readonly startTime: number;
  readonly endTime: number;
  readonly position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center';
  readonly size?: number;
  readonly shape?: 'circle' | 'rounded' | 'square';
  readonly borderColor?: string;
  readonly borderWidth?: number;
}

export interface ZoomSegmentPlan {
  readonly startTime: number;
  readonly endTime: number;
  readonly scale: number;
  readonly focusPoint: { readonly x: number; readonly y: number };
  readonly easing: 'spring' | 'smooth' | 'slow' | 'instant';
}

export interface LowerThirdPlan {
  readonly startTime: number;
  readonly endTime: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly backgroundColor?: string;
  readonly textColor?: string;
  readonly accentColor?: string;
  readonly position?: 'left' | 'center';
}

export interface CounterPlan {
  readonly startTime: number;
  readonly endTime: number;
  readonly value: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly format?: 'full' | 'abbreviated';
  readonly textColor?: string;
  readonly fontSize?: number;
  readonly position?: 'center' | 'top' | 'bottom';
}

export interface HighlightPlan {
  readonly startTime: number;
  readonly endTime: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly borderWidth?: number;
  readonly label?: string;
  readonly glow?: boolean;
}

export interface CtaPlan {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
  readonly style?: 'button' | 'banner' | 'pill';
  readonly backgroundColor?: string;
  readonly textColor?: string;
  readonly position?: 'bottom' | 'center' | 'top';
}

export interface ShotPlan {
  readonly id: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly scriptSegment: string;
  readonly visual:
    | { readonly type: 'primary' }
    | { readonly type: 'b-roll'; readonly searchQuery: string; readonly toolId: string }
    | { readonly type: 'ai-video'; readonly prompt: string; readonly toolId: string }
    | { readonly type: 'ai-image'; readonly prompt: string; readonly toolId: string }
    | { readonly type: 'text-card'; readonly headline: string; readonly background: string };
  readonly transition: { readonly type: string; readonly durationMs: number };
  /** Per-shot layout hint for hybrid-anchor mode */
  readonly shotLayout?: 'head' | 'content' | 'split' | 'montage' | 'anchor' | 'fullscreen';
  /** Target panel for comparison-split layout. Defaults to 'left'. */
  readonly panel?: 'left' | 'right';
  /** For montage shots: asset IDs to show as multi-panel grid */
  readonly montagePanelIds?: readonly string[];
  readonly reason: string;
}

export interface EffectPlan {
  readonly type: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly config: Record<string, unknown>;
  readonly reason: string;
}

// ── Brand preset ─────────────────────────────────────────────

export interface BrandPreset {
  readonly captionPreset?: string;
  readonly captionTemplate?: string;
  readonly animationStyle?:
    | 'none'
    | 'word-highlight'
    | 'word-by-word'
    | 'karaoke'
    | 'bounce'
    | 'typewriter';
  readonly maxWordsPerCue?: number;
  readonly maxDurationPerCue?: number;
  readonly textTransform?: 'none' | 'uppercase';
  readonly musicUrl?: string;
  readonly musicVolume?: number;
  readonly layout?:
    | 'fullscreen'
    | 'split-screen'
    | 'picture-in-picture'
    | 'anchor-bottom'
    | 'hybrid-anchor'
    | 'comparison-split';
  readonly showProgressBar?: boolean;
  readonly dynamicCaptionPosition?: boolean;
  readonly highlightColor?: string;
  readonly backgroundColor?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontColor?: string;
  readonly fontWeight?: 'normal' | 'bold';
  readonly outlineWidth?: number;
  readonly outlineColor?: string;
  readonly position?: number;
  readonly defaultTransition?:
    | 'crossfade'
    | 'slide-left'
    | 'slide-right'
    | 'zoom-in'
    | 'wipe'
    | 'none';
  /** Logo / watermark overlay (persistent on all frames) */
  readonly logoOverlay?: {
    readonly url: string;
    readonly position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    readonly size?: number;
    readonly opacity?: number;
    readonly margin?: number;
  };
}

// ── Production request / result ──────────────────────────────

export interface ProductionRequest {
  /** External job ID for log correlation (e.g. ReelJob.id) */
  readonly jobId?: string;
  readonly script: string;
  readonly style?: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  readonly layout?:
    | 'fullscreen'
    | 'split-screen'
    | 'picture-in-picture'
    | 'anchor-bottom'
    | 'hybrid-anchor'
    | 'comparison-split';
  /** User-provided primary video (skips avatar generation) */
  readonly primaryVideoUrl?: string;
  /** User-provided secondary video */
  readonly secondaryVideoUrl?: string;
  /** TTS config */
  readonly tts?: {
    readonly provider?: 'edge-tts' | 'elevenlabs' | 'openai';
    readonly voice?: string;
    readonly language?: string;
  };
  /** Whisper config */
  readonly whisper?: {
    readonly provider?: 'openrouter' | 'cloudflare' | 'ollama';
    readonly apiKey?: string;
  };
  /** Brand preset */
  readonly brandPreset?: BrandPreset;
  /** Avatar settings (for HeyGen) */
  readonly avatar?: {
    readonly avatarId?: string;
    readonly voice?: string;
  };
  /** Output path */
  readonly outputPath?: string;
  /** Montage profile ID (auto-selected from script if not provided) */
  readonly montageProfile?: string;
  /** Progress callback */
  readonly onProgress?: (step: string) => void;
}

/**
 * Lightweight request for overlay-only mode.
 * Use when you already have a video and just want captions + effects.
 */
/**
 * Pre-existing media asset provided by the user.
 */
export interface UserAsset {
  /** Unique ID to reference this asset in the plan */
  readonly id: string;
  /** URL or local file path */
  readonly url: string;
  /** Media type */
  readonly type: 'video' | 'image';
  /** Human description for the LLM (e.g. "Talking head, mówię do kamery", "Screenshot dashboardu") */
  readonly description: string;
  /** Duration in seconds (for video assets) */
  readonly durationSeconds?: number;
  /** Can this be used as primary/talking head? */
  readonly isPrimary?: boolean;
  /** Extra metadata (e.g. avatarFraming for positioning in split layouts) */
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Compose request: user provides all materials, LLM arranges them.
 * No tool discovery, no asset generation — pure composition planning.
 */
export interface ComposeRequest {
  /** External job ID for log correlation (e.g. ReelJob.id) */
  readonly jobId?: string;
  /** Script / narration text */
  readonly script: string;
  /** All available materials with descriptions */
  readonly assets: readonly UserAsset[];
  /** Style controls pacing and effect density */
  readonly style?: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  readonly layout?:
    | 'fullscreen'
    | 'split-screen'
    | 'picture-in-picture'
    | 'anchor-bottom'
    | 'hybrid-anchor'
    | 'comparison-split';
  readonly tts?: ProductionRequest['tts'];
  readonly whisper?: ProductionRequest['whisper'];
  readonly brandPreset?: BrandPreset;
  /** Skip TTS — use existing voiceover */
  readonly existingVoiceoverPath?: string;
  /** Pre-computed cues (skip whisper if provided along with existingVoiceoverPath) */
  readonly existingCues?: ReadonlyArray<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number }>;
  }>;
  /** Additional instructions for the LLM composer (e.g. "pokaż screenshot dashboardu gdy mówię o analytics") */
  readonly directorNotes?: string;
  readonly outputPath?: string;
  readonly onProgress?: (step: string) => void;
}

export interface ProductionResult {
  readonly outputPath: string;
  readonly durationSeconds: number;
  readonly plan?: ProductionPlan;
  readonly steps: readonly ProductionStep[];
  readonly generatedAssets: readonly GeneratedAsset[];
  /** Summary of pipeline logging (present when jobId was provided) */
  readonly pipelineLogSummary?: {
    readonly stepCount: number;
    readonly totalDurationMs: number;
    readonly toolsUsed: readonly string[];
    readonly steps: ReadonlyArray<{
      readonly name: string;
      readonly durationMs: number;
      readonly hasError: boolean;
    }>;
  };
}

export interface ProductionStep {
  readonly name: string;
  readonly durationMs: number;
  readonly detail?: string;
}

export interface GeneratedAsset {
  readonly toolId: string;
  readonly shotId?: string;
  readonly url: string;
  readonly type: AssetType;
  readonly durationSeconds?: number;
}
