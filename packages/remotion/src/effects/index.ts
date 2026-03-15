export type { EffectPlugin } from './registry';
export { registerEffect, getEffect, getAllEffects } from './registry';
export { useEffectAnimation } from './hooks/useEffectAnimation';
export { computeLoopStyle } from './hooks/useLoopAnimation';
export { effectSegmentSchema } from './schemas';
export type {
  BaseEffectSegment,
  EffectSegment,
  EntranceAnimation,
  ExitAnimation,
  EmojiPopupEffect,
  TextEmphasisEffect,
  ScreenShakeEffect,
  ColorFlashEffect,
  PngOverlayEffect,
  GifOverlayEffect,
  BlurBackgroundEffect,
  ParallaxScreenshotEffect,
  SplitScreenDividerEffect,
  SubscribeBannerEffect,
  GlitchTransitionEffect,
  CircularCounterEffect,
  RectangularPipEffect,
  StickerBurstEffect,
  CRTOverlayEffect,
  VignetteOverlayEffect,
  ChromaticAberrationEffect,
  ProgressRingEffect,
  TerminalTypingEffect,
  FilmGrainEffect,
  LightLeakEffect,
  ParallaxScreenshot3DEffect,
  IconPopInEffect,
  HighlightMarkerEffect,
  CircularPipEffect,
  NeonGlowTextEffect,
  LoopAnimation,
} from './types';

// ── Auto-register built-in effects (public, open-source) ──────
// Premium effects are registered by private modules via registerEffect().
import { registerEffect } from './registry';

import {
  textEmphasisSchema,
  screenShakeSchema,
  colorFlashSchema,
  blurBackgroundSchema,
  subscribeBannerSchema,
} from './schemas';
import { TextEmphasis } from './components/TextEmphasis';
import { ScreenShake } from './components/ScreenShake';
import { ColorFlash } from './components/ColorFlash';
import { BlurBackground } from './components/BlurBackground';
import { SubscribeBanner } from './components/SubscribeBanner';

registerEffect({
  type: 'text-emphasis',
  name: 'Text Emphasis',
  layer: 26,
  schema: textEmphasisSchema,
  component: TextEmphasis,
  defaultSfx: 'whoosh',
});
registerEffect({
  type: 'screen-shake',
  name: 'Screen Shake',
  layer: 5,
  schema: screenShakeSchema,
  component: ScreenShake,
});
registerEffect({
  type: 'color-flash',
  name: 'Color Flash',
  layer: 60,
  schema: colorFlashSchema,
  component: ColorFlash,
});
registerEffect({
  type: 'blur-background',
  name: 'Blur Background',
  layer: 2,
  schema: blurBackgroundSchema,
  component: BlurBackground,
});
registerEffect({
  type: 'subscribe-banner',
  name: 'Subscribe Banner',
  layer: 42,
  schema: subscribeBannerSchema,
  component: SubscribeBanner,
  defaultSfx: 'ding',
});
