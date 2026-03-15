// Template Engine
export {
  TemplateEngine,
  BUILT_IN_TEMPLATES,
  ALLOWED_FONT_FAMILIES,
  sanitizeStyle,
} from './engines/template-engine';

// Caption Animation
export {
  renderAnimatedCaption,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
} from './engines/caption-animation-renderer';
export type {
  WordSegment,
  WordSegmentStyle,
  AnimatedCaptionFrame,
} from './engines/caption-animation-renderer';
