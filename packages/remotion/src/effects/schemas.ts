import { z } from 'zod';

// ==========================================
// Shared sub-schemas
// ==========================================

const entranceSchema = z
  .enum([
    'spring-scale',
    'fade',
    'slide-up',
    'slide-down',
    'slide-left',
    'slide-right',
    'glitch',
    'bounce',
    'pop',
    'flip-up',
    'elastic',
    'zoom-blur',
    'flicker',
    'ink-print',
    'none',
  ])
  .optional();

const exitSchema = z
  .enum([
    'fade',
    'slide-down',
    'slide-up',
    'slide-left',
    'shrink',
    'scale-blur',
    'pop-out',
    'glitch',
    'none',
  ])
  .optional();

const loopSchema = z
  .enum(['pulse', 'wave', 'shake', 'swing', 'neon-pulse', 'float', 'color-cycle', 'none'])
  .optional();

const sfxSchema = z
  .object({
    url: z.string(),
    volume: z.number().min(0).max(1).optional(),
  })
  .optional();

const positionXYSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

function baseFields() {
  return {
    startTime: z.number().min(0),
    endTime: z.number().min(0),
    entrance: entranceSchema,
    exit: exitSchema,
    loop: loopSchema,
    sfx: sfxSchema,
  };
}

// ==========================================
// Per-effect schemas
// ==========================================

export const emojiPopupSchema = z.object({
  type: z.literal('emoji-popup'),
  ...baseFields(),
  emoji: z.string().min(1),
  position: positionXYSchema.default({ x: 50, y: 30 }),
  size: z.number().min(20).max(300).default(80),
  rotation: z.number().default(0),
});

export const textEmphasisSchema = z.object({
  type: z.literal('text-emphasis'),
  ...baseFields(),
  text: z.string().min(1).max(50),
  fontSize: z.number().min(24).max(200).default(96),
  fontColor: z.string().default('#FFFFFF'),
  backgroundColor: z.string().optional(),
  position: z.enum(['center', 'top', 'bottom']).default('center'),
  jitter: z.number().min(0).max(10).default(0),
  neonGlow: z.string().optional(),
});

export const screenShakeSchema = z.object({
  type: z.literal('screen-shake'),
  ...baseFields(),
  intensity: z.number().min(1).max(30).default(8),
  frequency: z.number().min(1).max(10).default(3),
});

export const colorFlashSchema = z.object({
  type: z.literal('color-flash'),
  ...baseFields(),
  color: z.string().default('#FFFFFF'),
  maxOpacity: z.number().min(0).max(1).default(0.6),
});

export const pngOverlaySchema = z.object({
  type: z.literal('png-overlay'),
  ...baseFields(),
  url: z.string(),
  position: positionXYSchema.default({ x: 50, y: 50 }),
  size: z.number().min(5).max(100).default(30),
  opacity: z.number().min(0).max(1).default(1),
  animation: z.enum(['none', 'bounce-pulse']).default('none'),
});

export const gifOverlaySchema = z.object({
  type: z.literal('gif-overlay'),
  ...baseFields(),
  url: z.string(),
  position: positionXYSchema.default({ x: 50, y: 50 }),
  size: z.number().min(5).max(100).default(30),
});

export const blurBackgroundSchema = z.object({
  type: z.literal('blur-background'),
  ...baseFields(),
  blurAmount: z.number().min(1).max(50).default(20),
  overlayUrl: z.string().optional(),
  overlayText: z.string().optional(),
  overlayFontSize: z.number().default(64),
  overlayColor: z.string().default('#FFFFFF'),
  mode: z.enum(['blur', 'spotlight']).default('blur'),
  focusPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).optional(),
  spotlightRadius: z.number().min(5).max(50).default(20),
});

export const parallaxScreenshotSchema = z.object({
  type: z.literal('parallax-screenshot'),
  ...baseFields(),
  url: z.string(),
  scrollDirection: z.enum(['up', 'down']).default('up'),
  depth: z.number().min(0.5).max(3).default(1.2),
  borderRadius: z.number().default(16),
  tiltMode: z.enum(['subtle', '3d']).default('subtle'),
});

export const splitScreenDividerSchema = z.object({
  type: z.literal('split-screen-divider'),
  ...baseFields(),
  dividerColor: z.string().default('#FFFFFF'),
  dividerWidth: z.number().default(4),
  direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  animationSpeed: z.number().min(0.1).max(5).default(1),
});

export const subscribeBannerSchema = z.object({
  type: z.literal('subscribe-banner'),
  ...baseFields(),
  channelName: z.string().min(1),
  backgroundColor: z.string().default('#FF0000'),
  textColor: z.string().default('#FFFFFF'),
  position: z.enum(['bottom', 'top']).default('bottom'),
});

export const glitchTransitionSchema = z.object({
  type: z.literal('glitch-transition'),
  ...baseFields(),
  rgbSplitAmount: z.number().min(1).max(30).default(10),
  scanlineOpacity: z.number().min(0).max(1).default(0.3),
  displacement: z.number().min(1).max(50).default(15),
});

export const circularCounterSchema = z.object({
  type: z.literal('circular-counter'),
  ...baseFields(),
  segments: z
    .array(
      z.object({
        value: z.number(),
        holdFrames: z.number().optional(),
      })
    )
    .min(1),
  size: z.number().min(50).max(500).default(200),
  trackColor: z.string().default('#333333'),
  fillColor: z.string().default('#3B82F6'),
  textColor: z.string().default('#FFFFFF'),
  fontSize: z.number().default(48),
  strokeWidth: z.number().min(2).max(30).default(10),
  position: z
    .enum(['center', 'top-right', 'top-left', 'bottom-right', 'bottom-left'])
    .default('center'),
});

export const rectangularPipSchema = z.object({
  type: z.literal('rectangular-pip'),
  ...baseFields(),
  videoUrl: z.string(),
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('bottom-right'),
  width: z.number().min(10).max(80).default(40),
  height: z.number().min(10).max(80).default(30),
  borderColor: z.string().default('#3B82F6'),
  borderWidth: z.number().default(3),
  borderGlow: z.boolean().default(true),
  borderRadius: z.number().default(12),
  shape: z.enum(['rectangle', 'circle']).default('rectangle'),
});

export const stickerBurstSchema = z.object({
  type: z.literal('sticker-burst'),
  ...baseFields(),
  side: z.enum(['left', 'right']).default('left'),
  count: z.number().min(2).max(5).default(3),
  colors: z.array(z.string()).optional(),
  shapes: z.array(z.enum(['burst', 'sparkle', 'diamond', 'star'])).optional(),
});

export const vignetteOverlaySchema = z.object({
  type: z.literal('vignette-overlay'),
  ...baseFields(),
  intensity: z.number().min(0.05).max(0.8).default(0.3),
  color: z.string().default('#000000'),
});

export const chromaticAberrationSchema = z.object({
  type: z.literal('chromatic-aberration'),
  ...baseFields(),
  intensity: z.number().min(0.01).max(0.2).default(0.05),
});

export const progressRingSchema = z.object({
  type: z.literal('progress-ring'),
  ...baseFields(),
  targetPercent: z.number().min(0).max(100),
  size: z.number().min(50).max(500).default(200),
  strokeWidth: z.number().min(4).max(40).default(12),
  trackColor: z.string().default('#333333'),
  fillColor: z.string().default('#3B82F6'),
  label: z.string().optional(),
  labelFontSize: z.number().min(16).max(120).default(48),
  labelColor: z.string().default('#FFFFFF'),
  position: z
    .enum(['center', 'top-right', 'top-left', 'bottom-right', 'bottom-left'])
    .default('center'),
});

export const crtOverlaySchema = z.object({
  type: z.literal('crt-overlay'),
  ...baseFields(),
  opacity: z.number().min(0.01).max(0.2).default(0.08),
  scanlineSpacing: z.number().min(1).max(8).default(4),
  grainIntensity: z.number().min(0).max(1).default(0.3),
});

export const filmGrainSchema = z.object({
  type: z.literal('film-grain'),
  ...baseFields(),
  intensity: z.number().min(0.01).max(0.5).default(0.15),
});

export const lightLeakSchema = z.object({
  type: z.literal('light-leak'),
  ...baseFields(),
  color: z.string().default('#FF6B35'),
  intensity: z.number().min(0.05).max(0.6).default(0.3),
  speed: z.number().min(0.1).max(3).default(1),
});

export const terminalTypingSchema = z.object({
  type: z.literal('terminal-typing'),
  ...baseFields(),
  text: z.string().min(1),
  fontSize: z.number().min(16).max(80).default(32),
  fontColor: z.string().default('#00FF00'),
  backgroundColor: z.string().default('#1E1E1E'),
  showCursor: z.boolean().default(true),
  cursorChar: z.string().default('▌'),
  prompt: z.string().default('$ '),
  position: z.enum(['center', 'top', 'bottom']).default('center'),
});

export const parallaxScreenshot3DSchema = z.object({
  type: z.literal('parallax-screenshot-3d'),
  ...baseFields(),
  imageUrl: z.string(),
  tiltDegrees: z.number().min(-45).max(45).default(-10),
  borderRadius: z.number().min(0).default(24),
  shadowDepth: z.enum(['shallow', 'deep']).default('deep'),
  position: z.enum(['center', 'left', 'right']).default('center'),
});

export const iconPopInSchema = z.object({
  type: z.literal('icon-pop-in'),
  ...baseFields(),
  imageUrl: z.string(),
  size: z.number().min(20).max(500).default(120),
  position: z
    .enum(['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('center'),
  glowColor: z.string().optional(),
});

export const highlightMarkerSchema = z.object({
  type: z.literal('highlight-marker'),
  ...baseFields(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0).max(100),
  height: z.number().min(0).max(100),
  color: z.string().default('#FFFF00'),
  opacity: z.number().min(0).max(1).default(0.35),
});

export const circularPipSchema = z.object({
  type: z.literal('circular-pip'),
  ...baseFields(),
  videoUrl: z.string(),
  size: z.number().min(10).max(50).default(25),
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('bottom-right'),
  glowColor: z.string().default('#00f2ff'),
  glowIntensity: z.number().min(0).max(1).default(0.6),
});

export const neonGlowTextSchema = z.object({
  type: z.literal('neon-glow-text'),
  ...baseFields(),
  text: z.string().min(1),
  color: z.string().default('#00f2ff'),
  fontSize: z.number().min(24).max(200).default(72),
  position: z.enum(['center', 'top', 'bottom']).default('center'),
});

// ==========================================
// Discriminated union
// ==========================================

export const effectSegmentSchema = z.discriminatedUnion('type', [
  emojiPopupSchema,
  textEmphasisSchema,
  screenShakeSchema,
  colorFlashSchema,
  pngOverlaySchema,
  gifOverlaySchema,
  blurBackgroundSchema,
  parallaxScreenshotSchema,
  splitScreenDividerSchema,
  subscribeBannerSchema,
  glitchTransitionSchema,
  circularCounterSchema,
  rectangularPipSchema,
  stickerBurstSchema,
  crtOverlaySchema,
  vignetteOverlaySchema,
  chromaticAberrationSchema,
  progressRingSchema,
  terminalTypingSchema,
  filmGrainSchema,
  lightLeakSchema,
  parallaxScreenshot3DSchema,
  iconPopInSchema,
  highlightMarkerSchema,
  circularPipSchema,
  neonGlowTextSchema,
]);
