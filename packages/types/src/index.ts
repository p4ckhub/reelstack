// ==========================================
// Subtitle Types
// ==========================================

export interface SubtitleWord {
  readonly text: string;
  readonly startTime: number; // seconds
  readonly endTime: number; // seconds
}

export type CaptionAnimationStyle =
  | 'none'
  | 'word-highlight'
  | 'word-by-word'
  | 'karaoke'
  | 'bounce'
  | 'typewriter';

export interface SubtitleCue {
  readonly id: string;
  readonly startTime: number; // seconds
  readonly endTime: number; // seconds
  readonly text: string;
  readonly words?: readonly SubtitleWord[];
  readonly animationStyle?: CaptionAnimationStyle;
}

// ==========================================
// Style Types
// ==========================================

export type TextAlignment = 'left' | 'center' | 'right';
export type HighlightMode = 'text' | 'pill' | 'single-word' | (string & {});
export type CaptionTextTransform = 'none' | 'uppercase';

export interface SubtitleStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontColor: string;
  readonly fontWeight: 'normal' | 'bold';
  readonly fontStyle: 'normal' | 'italic';
  readonly backgroundColor: string;
  readonly backgroundOpacity: number;
  readonly outlineColor: string;
  readonly outlineWidth: number;
  readonly shadowColor: string;
  readonly shadowBlur: number;
  readonly position: number; // vertical percentage 0-100 (0 = top, 100 = bottom)
  readonly alignment: TextAlignment;
  readonly lineHeight: number;
  readonly padding: number;
  readonly highlightColor?: string;
  readonly upcomingColor?: string;
  readonly highlightMode?: HighlightMode;
  readonly textTransform?: CaptionTextTransform;
  readonly pillColor?: string;
  readonly pillBorderRadius?: number;
  readonly pillPadding?: number;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Arial',
  fontSize: 24,
  fontColor: '#FFFFFF',
  fontWeight: 'normal',
  fontStyle: 'normal',
  backgroundColor: '#000000',
  backgroundOpacity: 0.7,
  outlineColor: '#000000',
  outlineWidth: 2,
  shadowColor: '#000000',
  shadowBlur: 4,
  position: 67,
  alignment: 'center',
  lineHeight: 1.4,
  padding: 8,
};

// ==========================================
// Caption Preset Types
// ==========================================

/**
 * CaptionPreset bundles caption style + animation + word grouping into a named config.
 * Presets define the full "look & feel" of captions for reels.
 * Individual field overrides can be applied on top.
 */
export interface CaptionPreset {
  readonly name: string;
  readonly animationStyle: CaptionAnimationStyle;
  readonly maxWordsPerCue: number;
  readonly maxDurationPerCue: number;
  readonly style: SubtitleStyle;
  readonly musicVolume: number;
  readonly dynamicCaptionPosition: boolean;
  readonly showProgressBar: boolean;
}

/**
 * Built-in caption presets for reels.
 * Font sizes are calibrated for 1080x1920 (9:16 vertical video).
 */
export const BUILT_IN_CAPTION_PRESETS: Record<string, CaptionPreset> = {
  tiktok: {
    name: 'TikTok',
    animationStyle: 'word-highlight',
    maxWordsPerCue: 3,
    maxDurationPerCue: 2,
    musicVolume: 0.15,
    dynamicCaptionPosition: false,
    showProgressBar: false,
    style: {
      fontFamily: 'Outfit',
      fontSize: 72,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      outlineColor: '#000000',
      outlineWidth: 4,
      shadowColor: '#000000',
      shadowBlur: 8,
      position: 75,
      alignment: 'center',
      lineHeight: 1.2,
      padding: 12,
      highlightColor: '#F59E0B',
      highlightMode: 'text',
      textTransform: 'uppercase',
    },
  },
  mrbeast: {
    name: 'MrBeast',
    animationStyle: 'word-by-word',
    maxWordsPerCue: 2,
    maxDurationPerCue: 1.5,
    musicVolume: 0.2,
    dynamicCaptionPosition: false,
    showProgressBar: false,
    style: {
      fontFamily: 'Inter',
      fontSize: 80,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      outlineColor: '#000000',
      outlineWidth: 5,
      shadowColor: '#000000',
      shadowBlur: 12,
      position: 70,
      alignment: 'center',
      lineHeight: 1.1,
      padding: 16,
      highlightColor: '#22C55E',
      highlightMode: 'text',
      textTransform: 'uppercase',
    },
  },
  cinematic: {
    name: 'Cinematic',
    animationStyle: 'karaoke',
    maxWordsPerCue: 5,
    maxDurationPerCue: 3,
    musicVolume: 0.3,
    dynamicCaptionPosition: true,
    showProgressBar: false,
    style: {
      fontFamily: 'Montserrat',
      fontSize: 48,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      outlineColor: '#000000',
      outlineWidth: 0,
      shadowColor: '#000000',
      shadowBlur: 16,
      position: 85,
      alignment: 'center',
      lineHeight: 1.4,
      padding: 8,
      highlightColor: '#60A5FA',
      highlightMode: 'text',
      textTransform: 'none',
    },
  },
  minimal: {
    name: 'Minimal',
    animationStyle: 'none',
    maxWordsPerCue: 6,
    maxDurationPerCue: 3,
    musicVolume: 0,
    dynamicCaptionPosition: false,
    showProgressBar: false,
    style: {
      fontFamily: 'Inter',
      fontSize: 36,
      fontColor: '#FFFFFF',
      fontWeight: 'normal',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0.5,
      outlineColor: '#000000',
      outlineWidth: 0,
      shadowColor: '#000000',
      shadowBlur: 4,
      position: 10,
      alignment: 'center',
      lineHeight: 1.5,
      padding: 8,
      highlightMode: 'text',
      textTransform: 'none',
    },
  },
  neon: {
    name: 'Neon',
    animationStyle: 'bounce',
    maxWordsPerCue: 3,
    maxDurationPerCue: 2,
    musicVolume: 0.15,
    dynamicCaptionPosition: false,
    showProgressBar: false,
    style: {
      fontFamily: 'Poppins',
      fontSize: 64,
      fontColor: '#00FF88',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      outlineColor: '#00FF88',
      outlineWidth: 1,
      shadowColor: '#00FF88',
      shadowBlur: 16,
      position: 75,
      alignment: 'center',
      lineHeight: 1.2,
      padding: 12,
      highlightColor: '#00FF88',
      highlightMode: 'text',
      textTransform: 'uppercase',
    },
  },
  classic: {
    name: 'Classic',
    animationStyle: 'karaoke',
    maxWordsPerCue: 6,
    maxDurationPerCue: 3,
    musicVolume: 0,
    dynamicCaptionPosition: false,
    showProgressBar: true,
    style: {
      fontFamily: 'Arial',
      fontSize: 48,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0.7,
      outlineColor: '#000000',
      outlineWidth: 2,
      shadowColor: '#000000',
      shadowBlur: 4,
      position: 75,
      alignment: 'center',
      lineHeight: 1.4,
      padding: 12,
      highlightColor: '#F59E0B',
      highlightMode: 'text',
      textTransform: 'none',
    },
  },
};

/** Default preset for reels when none specified */
export const DEFAULT_CAPTION_PRESET = 'tiktok';

// ==========================================
// Template Types
// ==========================================

export type TemplateCategory = 'minimal' | 'cinematic' | 'bold' | 'modern' | 'custom';

export interface SubtitleTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly style: SubtitleStyle;
  readonly category: TemplateCategory;
  readonly isBuiltIn: boolean;
  readonly isPublic: boolean;
  readonly thumbnail?: string;
  readonly usageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ==========================================
// Render Types
// ==========================================

export type RenderCodec = 'libx264' | 'libx265' | 'copy';
export type RenderPreset = 'ultrafast' | 'fast' | 'medium' | 'slow';
export type RenderQuality = 'fast' | 'balanced' | 'quality';

export interface RenderOptions {
  readonly videoPath: string;
  readonly assContent: string;
  readonly outputPath: string;
  readonly codec: RenderCodec;
  readonly preset: RenderPreset;
  readonly crf: number;
  readonly resolution?: { readonly width: number; readonly height: number };
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Valid JobStatus transitions (uppercase, matching DB enum).
 * Any transition not listed here is invalid and will be rejected.
 */
export const JOB_STATUS_TRANSITIONS: Record<string, string[]> = {
  QUEUED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['QUEUED'],
};

export function isValidStatusTransition(from: string, to: string): boolean {
  const allowed = JOB_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export interface RenderJob {
  readonly id: string;
  readonly videoId: string;
  readonly userId?: string;
  readonly style: SubtitleStyle;
  readonly status: JobStatus;
  readonly progress: number;
  readonly outputUrl?: string;
  readonly projectFileUrl?: string;
  readonly error?: string;
  readonly templateId?: string;
  readonly apiKeyId?: string;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface RenderProgress {
  readonly phase: 'loading' | 'rendering' | 'uploading' | 'done' | 'error';
  readonly percentage: number;
  readonly message: string;
}

// ==========================================
// API Key Types
// ==========================================

export const API_SCOPES = {
  VIDEOS_READ: 'videos:read',
  VIDEOS_WRITE: 'videos:write',
  TEMPLATES_READ: 'templates:read',
  TEMPLATES_WRITE: 'templates:write',
  RENDER_READ: 'render:read',
  RENDER_WRITE: 'render:write',
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  REEL_READ: 'reel:read',
  REEL_WRITE: 'reel:write',
  PUBLISH_READ: 'publish:read',
  PUBLISH_WRITE: 'publish:write',
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  FULL_ACCESS: '*',
} as const;

export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];

export const SCOPE_PRESETS = {
  full: [API_SCOPES.FULL_ACCESS],
  reelOnly: [
    API_SCOPES.REEL_WRITE,
    API_SCOPES.REEL_READ,
    API_SCOPES.PUBLISH_WRITE,
    API_SCOPES.PUBLISH_READ,
  ],
  readOnly: [API_SCOPES.TEMPLATES_READ, API_SCOPES.REEL_READ, API_SCOPES.PUBLISH_READ],
  templateManager: [API_SCOPES.TEMPLATES_READ, API_SCOPES.TEMPLATES_WRITE],
} as const;

export interface ApiKeyData {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly ApiScope[];
  readonly rateLimitPerMinute: number;
  readonly isActive: boolean;
  readonly expiresAt?: string;
  readonly lastUsedAt?: string;
  readonly usageCount: number;
  readonly createdAt: string;
}

// ==========================================
// API Response Types
// ==========================================

export interface ApiSuccessResponse<T> {
  readonly data: T;
  readonly pagination?: CursorPagination;
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, readonly string[]>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface CursorPagination {
  readonly cursor?: string;
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly limit: number;
}

// ==========================================
// Adapter Types
// ==========================================

export type DeploymentMode = 'cloud' | 'vps';

export interface StorageAdapter {
  upload(file: Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  getSignedUrl(path: string, expiresIn?: number): Promise<string>;
  delete(path: string): Promise<void>;
}

export type QueueName = 'render' | 'reel-render' | 'reel-publish';

export interface QueueAdapter {
  enqueue(jobId: string, payload: Record<string, unknown>, queueName?: QueueName): Promise<void>;
  getStatus(jobId: string, queueName?: QueueName): Promise<JobStatus>;
}

// ==========================================
// Reel Types
// ==========================================

export type ReelLayout = 'split-screen' | 'fullscreen' | 'picture-in-picture' | 'comparison-split';

export interface TextCardConfig {
  readonly headline: string;
  readonly subtitle?: string;
  readonly background: string; // color, gradient, or image URL
  readonly textColor?: string; // default '#FFFFFF'
  readonly textAlign?: TextAlignment;
  readonly fontSize?: number; // default 64
}

export interface KenBurnsConfig {
  readonly startScale?: number; // default 1.0
  readonly endScale?: number; // default 1.3
  readonly startPosition?: { readonly x: number; readonly y: number }; // 0-100%
  readonly endPosition?: { readonly x: number; readonly y: number };
}

export interface MediaPanelSource {
  readonly url: string;
  readonly type: 'video' | 'image';
}

export interface MediaSource {
  readonly url: string;
  readonly type: 'video' | 'image' | 'color' | 'split-screen' | 'text-card' | 'multi-panel';
  readonly label?: string;
  readonly startFrom?: number; // seconds - trim start
  readonly endAt?: number; // seconds - trim end
  readonly textCard?: TextCardConfig;
  readonly kenBurns?: KenBurnsConfig;
  /** Array of panel sources for multi-panel layout (2-3 equal horizontal strips). */
  readonly panels?: readonly MediaPanelSource[];
}

export type TransitionType =
  | 'crossfade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-perspective-right'
  | 'zoom-in'
  | 'wipe'
  | 'blur-dissolve'
  | 'flash-white'
  | 'whip-pan'
  | 'cross-zoom'
  | 'iris-circle'
  | 'spin'
  | 'none';

export interface BRollTransition {
  readonly type: TransitionType;
  readonly durationMs?: number; // default 300ms
}

export interface BRollSegment {
  readonly startTime: number; // seconds
  readonly endTime: number; // seconds
  readonly media: MediaSource;
  readonly animation?: 'spring-scale' | 'fade' | 'slide' | 'none';
  readonly transition?: BRollTransition;
  /** CSS filter string applied to the B-roll content (e.g. 'brightness(0.8) contrast(1.1)'). */
  readonly cssFilter?: string;
  /** Per-shot layout hint for hybrid-anchor mode. */
  readonly shotLayout?: 'head' | 'content' | 'split' | 'montage' | 'anchor' | 'fullscreen';
  /** Target panel for comparison-split layout. Defaults to 'left'. */
  readonly panel?: 'left' | 'right';
  /** Object-fit mode for media. Defaults to 'cover'. Use 'contain' for informational boards. */
  readonly objectFit?: 'cover' | 'contain';
}

export interface ZoomSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly scale: number; // 1.2-2.0, default 1.5
  readonly focusPoint?: { readonly x: number; readonly y: number }; // % default {50,50}
  readonly easing?: 'spring' | 'smooth' | 'slow' | 'instant';
}

export interface ChapterSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly number?: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly style?: 'fullscreen' | 'overlay';
  readonly backgroundColor?: string;
  readonly accentColor?: string;
}

export interface CounterSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly value: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly format?: 'full' | 'abbreviated';
  readonly textColor?: string;
  readonly fontSize?: number;
  readonly position?: 'center' | 'top' | 'bottom';
  /** 'count-up' (default) = 0→value, 'countdown' = value→0. Countdown uses mono/digital font. */
  readonly mode?: 'count-up' | 'countdown';
}

export interface HighlightSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly x: number; // % from left
  readonly y: number; // % from top
  readonly width: number; // % of container width
  readonly height: number; // % of container height
  readonly color?: string; // default '#FF0000'
  readonly borderWidth?: number;
  readonly borderRadius?: number;
  readonly label?: string;
  readonly glow?: boolean;
  /** 'border' = outline box (default), 'marker' = filled semi-transparent rectangle (highlighter pen) */
  readonly style?: 'border' | 'marker';
}

export interface SpeedRampSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly rate: number;
}

export interface PublishStatus {
  publishId: string;
  platforms: string[];
  publishedAt: string;
}

export interface ReelJob {
  readonly id: string;
  readonly userId: string;
  readonly status: JobStatus;
  readonly progress: number;
  readonly script?: string;
  readonly reelConfig?: Record<string, unknown>;
  readonly outputUrl?: string;
  readonly error?: string;
  readonly apiKeyId?: string;
  readonly projectId?: string;
  readonly publishStatus?: PublishStatus;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface PipSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly videoUrl: string;
  readonly position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center';
  readonly size?: number; // % of screen width, default 30
  readonly shape?: 'circle' | 'rounded' | 'square';
  readonly borderColor?: string;
  readonly borderWidth?: number;
}

export interface LowerThirdSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly backgroundColor?: string; // default '#000000CC'
  readonly textColor?: string; // default '#FFFFFF'
  readonly position?: 'left' | 'center';
  readonly accentColor?: string; // colored bar/accent
}

export interface CtaSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
  readonly style?: 'button' | 'banner' | 'pill';
  readonly backgroundColor?: string; // default '#3B82F6'
  readonly textColor?: string; // default '#FFFFFF'
  readonly position?: 'bottom' | 'center' | 'top';
  readonly icon?: string; // emoji
}

export interface ReelConfig {
  readonly layout: ReelLayout;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInSeconds: number;

  // Media sources
  readonly primaryVideo?: MediaSource; // talking head / main video
  readonly secondaryVideo?: MediaSource; // screen recording / demo
  readonly bRollSegments: readonly BRollSegment[];

  // Audio
  readonly voiceoverUrl?: string;
  readonly musicUrl?: string;
  readonly musicVolume?: number; // 0-1

  // Captions
  readonly cues: readonly SubtitleCue[];
  readonly captionStyle: SubtitleStyle;

  // Visual
  readonly showProgressBar?: boolean;
  readonly backgroundColor?: string;
}

// ==========================================
// Error Classes
// ==========================================

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class StorageError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', 500, context);
    this.name = 'StorageError';
  }
}

export class QueueError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QUEUE_ERROR', 503, context);
    this.name = 'QueueError';
  }
}

export class RenderError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'RENDER_ERROR', 500, context);
    this.name = 'RenderError';
  }
}

export class TTSError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TTS_ERROR', 500, context);
    this.name = 'TTSError';
  }
}

export class TranscriptionError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TRANSCRIPTION_ERROR', 500, context);
    this.name = 'TranscriptionError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', 404, context);
    this.name = 'NotFoundError';
  }
}

export class QuotaExceededError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QUOTA_EXCEEDED', 429, context);
    this.name = 'QuotaExceededError';
  }
}
