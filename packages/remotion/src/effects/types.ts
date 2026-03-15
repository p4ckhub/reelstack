// ==========================================
// Effect Animation Types
// ==========================================

export type EntranceAnimation =
  | 'spring-scale'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'glitch'
  | 'bounce'
  | 'pop'
  | 'flip-up'
  | 'elastic'
  | 'zoom-blur'
  | 'flicker'
  | 'ink-print'
  | 'none';

export type ExitAnimation =
  | 'fade'
  | 'slide-down'
  | 'slide-up'
  | 'slide-left'
  | 'shrink'
  | 'scale-blur'
  | 'pop-out'
  | 'glitch'
  | 'none';

// ==========================================
// Base Effect Segment
// ==========================================

export type LoopAnimation =
  | 'pulse'
  | 'wave'
  | 'shake'
  | 'swing'
  | 'neon-pulse'
  | 'float'
  | 'color-cycle'
  | 'none';

export interface BaseEffectSegment {
  readonly type: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly entrance?: EntranceAnimation;
  readonly exit?: ExitAnimation;
  readonly loop?: LoopAnimation;
  readonly sfx?: { readonly url: string; readonly volume?: number };
}

// ==========================================
// Concrete Effect Types
// ==========================================

export interface EmojiPopupEffect extends BaseEffectSegment {
  readonly type: 'emoji-popup';
  readonly emoji: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly size?: number;
  readonly rotation?: number;
}

export interface TextEmphasisEffect extends BaseEffectSegment {
  readonly type: 'text-emphasis';
  readonly text: string;
  readonly fontSize?: number;
  readonly fontColor?: string;
  readonly backgroundColor?: string;
  readonly position?: 'center' | 'top' | 'bottom';
  /** Random x/y jitter per frame in pixels (0 = off). */
  readonly jitter?: number;
  /** Neon glow color. When set, adds pulsing drop-shadow/glow effect. */
  readonly neonGlow?: string;
}

export interface ScreenShakeEffect extends BaseEffectSegment {
  readonly type: 'screen-shake';
  readonly intensity?: number;
  readonly frequency?: number;
}

export interface ColorFlashEffect extends BaseEffectSegment {
  readonly type: 'color-flash';
  readonly color?: string;
  readonly maxOpacity?: number;
}

export interface PngOverlayEffect extends BaseEffectSegment {
  readonly type: 'png-overlay';
  readonly url: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly size?: number;
  readonly opacity?: number;
  /** Optional loop animation: 'bounce-pulse' = spring entrance + gentle scale pulsing. */
  readonly animation?: 'none' | 'bounce-pulse';
}

export interface GifOverlayEffect extends BaseEffectSegment {
  readonly type: 'gif-overlay';
  readonly url: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly size?: number;
}

export interface BlurBackgroundEffect extends BaseEffectSegment {
  readonly type: 'blur-background';
  readonly blurAmount?: number;
  readonly overlayUrl?: string;
  readonly overlayText?: string;
  readonly overlayFontSize?: number;
  readonly overlayColor?: string;
  /** 'blur' (default) = blur background, 'spotlight' = dim 70% + spotlight circle on focusPoint. */
  readonly mode?: 'blur' | 'spotlight';
  /** Focus point for spotlight mode (percentage 0-100). */
  readonly focusPoint?: { readonly x: number; readonly y: number };
  /** Spotlight radius as percentage of screen width (default 20). */
  readonly spotlightRadius?: number;
}

export interface ParallaxScreenshotEffect extends BaseEffectSegment {
  readonly type: 'parallax-screenshot';
  readonly url: string;
  readonly scrollDirection?: 'up' | 'down';
  readonly depth?: number;
  readonly borderRadius?: number;
  /** 'subtle' (default 2deg tilt) or '3d' (10deg Y rotation + deep shadow). */
  readonly tiltMode?: 'subtle' | '3d';
}

export interface SplitScreenDividerEffect extends BaseEffectSegment {
  readonly type: 'split-screen-divider';
  readonly dividerColor?: string;
  readonly dividerWidth?: number;
  readonly direction?: 'horizontal' | 'vertical';
  readonly animationSpeed?: number;
}

export interface SubscribeBannerEffect extends BaseEffectSegment {
  readonly type: 'subscribe-banner';
  readonly channelName: string;
  readonly backgroundColor?: string;
  readonly textColor?: string;
  readonly position?: 'bottom' | 'top';
}

export interface GlitchTransitionEffect extends BaseEffectSegment {
  readonly type: 'glitch-transition';
  readonly rgbSplitAmount?: number;
  readonly scanlineOpacity?: number;
  readonly displacement?: number;
}

export interface CircularCounterEffect extends BaseEffectSegment {
  readonly type: 'circular-counter';
  readonly segments: ReadonlyArray<{ readonly value: number; readonly holdFrames?: number }>;
  readonly size?: number;
  readonly trackColor?: string;
  readonly fillColor?: string;
  readonly textColor?: string;
  readonly fontSize?: number;
  readonly strokeWidth?: number;
  readonly position?: 'center' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export interface RectangularPipEffect extends BaseEffectSegment {
  readonly type: 'rectangular-pip';
  readonly videoUrl: string;
  readonly position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readonly width?: number;
  readonly height?: number;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly borderGlow?: boolean;
  readonly borderRadius?: number;
  /** 'rectangle' (default) or 'circle' (circular PiP with neon glow). */
  readonly shape?: 'rectangle' | 'circle';
}

export interface StickerBurstEffect extends BaseEffectSegment {
  readonly type: 'sticker-burst';
  readonly side?: 'left' | 'right';
  readonly count?: number;
  readonly colors?: readonly string[];
  readonly shapes?: readonly ('burst' | 'sparkle' | 'diamond' | 'star')[];
}

export interface CRTOverlayEffect extends BaseEffectSegment {
  readonly type: 'crt-overlay';
  readonly opacity?: number;
  readonly scanlineSpacing?: number;
  readonly grainIntensity?: number;
}

export interface VignetteOverlayEffect extends BaseEffectSegment {
  readonly type: 'vignette-overlay';
  readonly intensity?: number;
  readonly color?: string;
}

export interface ChromaticAberrationEffect extends BaseEffectSegment {
  readonly type: 'chromatic-aberration';
  /** RGB split amount as percentage of frame (0.01-0.2). */
  readonly intensity?: number;
}

export interface ProgressRingEffect extends BaseEffectSegment {
  readonly type: 'progress-ring';
  readonly targetPercent: number;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly trackColor?: string;
  readonly fillColor?: string;
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelColor?: string;
  readonly position?: 'center' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export interface FilmGrainEffect extends BaseEffectSegment {
  readonly type: 'film-grain';
  readonly intensity?: number;
}

export interface LightLeakEffect extends BaseEffectSegment {
  readonly type: 'light-leak';
  readonly color?: string;
  readonly intensity?: number;
  readonly speed?: number;
}

export interface TerminalTypingEffect extends BaseEffectSegment {
  readonly type: 'terminal-typing';
  readonly text: string;
  readonly fontSize?: number;
  readonly fontColor?: string;
  readonly backgroundColor?: string;
  readonly showCursor?: boolean;
  readonly cursorChar?: string;
  readonly prompt?: string;
  readonly position?: 'center' | 'top' | 'bottom';
}

export interface ParallaxScreenshot3DEffect extends BaseEffectSegment {
  readonly type: 'parallax-screenshot-3d';
  readonly imageUrl: string;
  readonly tiltDegrees?: number;
  readonly borderRadius?: number;
  readonly shadowDepth?: 'shallow' | 'deep';
  readonly position?: 'center' | 'left' | 'right';
}

export interface IconPopInEffect extends BaseEffectSegment {
  readonly type: 'icon-pop-in';
  readonly imageUrl: string;
  readonly size?: number;
  readonly position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readonly glowColor?: string;
}

export interface HighlightMarkerEffect extends BaseEffectSegment {
  readonly type: 'highlight-marker';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly opacity?: number;
}

export interface CircularPipEffect extends BaseEffectSegment {
  readonly type: 'circular-pip';
  readonly videoUrl: string;
  /** Size as percentage of screen width (default 25). */
  readonly size?: number;
  readonly position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Neon glow border color (default '#00f2ff'). */
  readonly glowColor?: string;
  /** Glow intensity 0-1 (default 0.6). */
  readonly glowIntensity?: number;
}

export interface NeonGlowTextEffect extends BaseEffectSegment {
  readonly type: 'neon-glow-text';
  readonly text: string;
  /** Neon color (default '#00f2ff'). */
  readonly color?: string;
  readonly fontSize?: number;
  readonly position?: 'center' | 'top' | 'bottom';
}

// ==========================================
// Discriminated Union
// ==========================================

export type EffectSegment =
  | EmojiPopupEffect
  | TextEmphasisEffect
  | ScreenShakeEffect
  | ColorFlashEffect
  | PngOverlayEffect
  | GifOverlayEffect
  | BlurBackgroundEffect
  | ParallaxScreenshotEffect
  | SplitScreenDividerEffect
  | SubscribeBannerEffect
  | GlitchTransitionEffect
  | CircularCounterEffect
  | RectangularPipEffect
  | StickerBurstEffect
  | CRTOverlayEffect
  | VignetteOverlayEffect
  | ChromaticAberrationEffect
  | ProgressRingEffect
  | TerminalTypingEffect
  | FilmGrainEffect
  | LightLeakEffect
  | ParallaxScreenshot3DEffect
  | IconPopInEffect
  | HighlightMarkerEffect
  | CircularPipEffect
  | NeonGlowTextEffect;
