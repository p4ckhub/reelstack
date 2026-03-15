/**
 * Lightweight composition catalog — NO React imports.
 * Used by the agent package to auto-build LLM prompts.
 * When you add a new effect or segment type, add it here too.
 */

// ── Effect catalog ──────────────────────────────────────────

export interface EffectCatalogEntry {
  readonly type: string;
  readonly description: string;
  readonly config: string;
  /** Default SFX ID from SFX_CATALOG (auto-applied unless overridden) */
  readonly defaultSfx?: string;
  /** Which video styles should use this effect */
  readonly recommendedStyles?: readonly (
    | 'dynamic'
    | 'calm'
    | 'cinematic'
    | 'educational'
    | 'cyber-retro'
    | 'clean-corporate'
    | 'ai-tool-showcase'
  )[];
  /** Short hint WHEN to use this effect (e.g., "at punchlines", "on topic shifts") */
  readonly styleHint?: string;
}

export const EFFECT_CATALOG: readonly EffectCatalogEntry[] = [
  {
    type: 'emoji-popup',
    description: 'Animated emoji reaction overlay',
    config:
      'emoji (string), position ({x,y} percentage), size (number 20-300), rotation (number), entrance, exit',
    defaultSfx: 'pop',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'reactions, reveals, funny moments',
  },
  {
    type: 'text-emphasis',
    description: 'Bold text flash overlay',
    config:
      'text (string max 50 chars), fontSize (number 24-200), fontColor (string), backgroundColor (string, optional), position ("top"|"center"|"bottom"), jitter (number 0-10, random per-frame x/y offset in px, 0=off, 3-5=glitchy), neonGlow (hex color, optional — adds pulsing neon drop-shadow), entrance, exit',
    defaultSfx: 'whoosh',
    recommendedStyles: ['dynamic', 'cinematic', 'educational'],
    styleHint: 'hook word, key terms, URLs, prices — NOT captions text',
  },
  {
    type: 'screen-shake',
    description: 'Camera shake/jitter effect',
    config: 'intensity (number 1-30), frequency (number 1-10). Duration: 0.3-0.5s',
    recommendedStyles: ['dynamic'],
    styleHint: 'impact moments, shocking stats, emphasis',
  },
  {
    type: 'color-flash',
    description: 'Fullscreen color flash overlay',
    config: 'color (hex string), maxOpacity (0-1). Duration: 0.2-0.4s',
    recommendedStyles: ['dynamic', 'cinematic'],
    styleHint: 'topic shifts, dramatic beats',
  },
  {
    type: 'glitch-transition',
    description: 'RGB split + scanlines + displacement',
    config:
      'rgbSplitAmount (number 1-30), scanlineOpacity (0-1), displacement (number 1-50). Duration: 0.3-0.6s',
    defaultSfx: 'glitch',
    recommendedStyles: ['dynamic', 'cinematic'],
    styleHint: 'topic/scene changes, tech themes',
  },
  {
    type: 'subscribe-banner',
    description:
      'CTA banner at top/bottom of screen. channelName is the FULL banner text displayed (e.g. "Obserwuj po więcej" or "Follow @TechSkills"). Do NOT put just a username — put the complete CTA text.',
    config:
      'channelName (string — FULL banner text, not just username), backgroundColor (hex), textColor (hex), position ("top"|"bottom"), entrance, exit',
    defaultSfx: 'ding',
    recommendedStyles: ['dynamic', 'calm', 'cinematic', 'educational'],
    styleHint: 'near the end of reel, max 1 per reel',
  },
  {
    type: 'circular-counter',
    description: 'Animated circular progress counter',
    config:
      'segments ([{value, holdFrames?}]), size (50-500), fillColor, trackColor, textColor, fontSize, strokeWidth, position ("center"|"top-right"|"top-left"|"bottom-right"|"bottom-left"), entrance, exit',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'stats, percentages, progress indicators',
  },
  {
    type: 'png-overlay',
    description: 'Static image overlay',
    config:
      'url (URL), position ({x,y} 0-100), size (5-100%), opacity (0-1), animation ("none"|"bounce-pulse" — bounce-pulse=spring entrance + gentle scale pulsing), entrance, exit',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'logos, screenshots, product images',
  },
  {
    type: 'gif-overlay',
    description: 'Animated GIF overlay',
    config: 'url (URL), position ({x,y} 0-100), size (5-100%), entrance, exit',
    recommendedStyles: ['dynamic'],
    styleHint: 'animated reactions, memes',
  },
  {
    type: 'blur-background',
    description: 'Blur background with optional overlay text/image',
    config:
      'blurAmount (1-50), overlayUrl (optional), overlayText (optional), overlayFontSize, overlayColor, mode ("blur"|"spotlight" — spotlight=dim 70% with circle spotlight), focusPoint ({x,y} % for spotlight center), spotlightRadius (5-50% of screen width)',
    recommendedStyles: ['cinematic', 'educational'],
    styleHint: 'focus attention on overlay content',
  },
  {
    type: 'parallax-screenshot',
    description: '3D perspective scroll effect on screenshot/image',
    config:
      'url (URL), scrollDirection ("up"|"down"), depth (0.5-3), borderRadius, tiltMode ("subtle"|"3d" — 3d=rotateY(-10deg) with deep shadow and borderRadius:24)',
    recommendedStyles: ['dynamic', 'cinematic', 'educational'],
    styleHint: 'app/website demos, long screenshots',
  },
  {
    type: 'split-screen-divider',
    description: 'Split screen with glowing animated divider',
    config:
      'direction ("horizontal"|"vertical"), dividerWidth, dividerColor, animationSpeed (0.1-5)',
    recommendedStyles: ['cinematic'],
    styleHint: 'comparisons, before/after',
  },
  {
    type: 'rectangular-pip',
    description: 'Picture-in-picture video overlay with glowing border',
    config:
      'videoUrl (URL), position ("top-left"|"top-right"|"bottom-left"|"bottom-right"), width (10-80%), height (10-80%), borderColor, borderWidth, borderGlow (boolean), borderRadius, shape ("rectangle"|"circle" — circle=round PiP with pulsing neon glow)',
    recommendedStyles: ['educational'],
    styleHint: 'screen recording with talking head',
  },
  {
    type: 'sticker-burst',
    description:
      'Multiple colorful decorative shapes fly in from one side — creates energy burst / reaction moment',
    config:
      'side ("left"|"right"), count (2-5, default 3), colors (array of hex, optional), shapes (array of "burst"|"sparkle"|"diamond"|"star", optional). Duration: 0.5-1.5s.',
    defaultSfx: 'whoosh',
    recommendedStyles: ['dynamic'],
    styleHint: 'punchlines, reveals, topic transitions, wow moments',
  },
  {
    type: 'crt-overlay',
    description:
      'CRT monitor effect — horizontal scanlines + animated film grain. Full-reel overlay (set startTime=0, endTime=total duration).',
    config:
      'opacity (0.01-0.2, default 0.08), scanlineSpacing (1-8px, default 4), grainIntensity (0-1, default 0.3)',
    recommendedStyles: ['dynamic'],
    styleHint: 'hacker/retro/terminal aesthetic — use for entire reel, not per-shot',
  },
  {
    type: 'vignette-overlay',
    description:
      'Darkened corners via radial gradient. Full-reel overlay for cinematic/moody look.',
    config: 'intensity (0.05-0.8, default 0.3), color (hex, default #000000)',
    recommendedStyles: ['dynamic', 'cinematic', 'cyber-retro'],
    styleHint: 'cinematic mood, dark/moody aesthetic — use for entire reel',
  },
  {
    type: 'progress-ring',
    description: 'Animated SVG progress ring filling from 0% to target',
    config:
      'targetPercent (0-100, REQUIRED), size (50-500, default 200), strokeWidth (4-40, default 12), fillColor (hex), trackColor (hex), label (string, optional — auto-shows percentage if omitted), labelFontSize, labelColor, position ("center"|"top-right"|"top-left"|"bottom-right"|"bottom-left"), entrance, exit',
    recommendedStyles: ['dynamic', 'educational', 'cyber-retro'],
    styleHint: 'stats, progress indicators, completion rates, scores',
  },
  {
    type: 'chromatic-aberration',
    description: 'Subtle permanent RGB split — red/blue channel offset. Full-reel overlay.',
    config: 'intensity (0.01-0.2, fraction of frame width, default 0.05)',
    recommendedStyles: ['dynamic', 'cyber-retro'],
    styleHint: 'glitchy/tech aesthetic — use for entire reel, not per-shot',
  },
  {
    type: 'terminal-typing',
    description:
      'Terminal/code typing animation — text appears letter-by-letter with blinking cursor in a dark terminal box',
    config:
      'text (string, REQUIRED — the command/code to type), fontSize (16-80, default 32), fontColor (hex, default #00FF00), backgroundColor (hex, default #1E1E1E), showCursor (bool, default true), cursorChar (string, default "▌"), prompt (string, default "$ "), position ("center"|"top"|"bottom")',
    defaultSfx: 'keyboard',
    recommendedStyles: ['dynamic', 'educational'],
    styleHint: 'terminal commands, code snippets, CLI demos, dev content',
  },
  {
    type: 'film-grain',
    description: 'Subtle film noise texture overlay. Full-reel overlay for cinematic/vintage look.',
    config: 'intensity (0.01-0.5, default 0.15)',
    recommendedStyles: ['cinematic'],
    styleHint: 'cinematic/vintage aesthetic — use for entire reel, pairs well with vignette',
  },
  {
    type: 'light-leak',
    description: 'Warm drifting light leak overlay — animated gradient spots. Full-reel overlay.',
    config:
      'color (hex, default #FF6B35), intensity (0.05-0.6, default 0.3), speed (0.1-3, default 1)',
    recommendedStyles: ['cinematic', 'calm'],
    styleHint: 'warm/dreamy aesthetic — use for entire reel, subtle warmth',
  },
  {
    type: 'parallax-screenshot-3d',
    description:
      'Floating UI screenshot with 3D perspective tilt, deep shadow, and rounded corners. NOT flat.',
    config:
      'imageUrl (URL, REQUIRED), tiltDegrees (number -45 to 45, default -10), borderRadius (number, default 24), shadowDepth ("shallow"|"deep", default "deep"), position ("center"|"left"|"right"), entrance, exit',
    recommendedStyles: ['clean-corporate', 'ai-tool-showcase', 'dynamic'],
    styleHint: 'app/website demos, UI showcases, SaaS screenshots, tool previews',
  },
  {
    type: 'icon-pop-in',
    description:
      'Tool logo/icon bounces in with spring animation + subtle pulse after landing. Optional glow.',
    config:
      'imageUrl (URL, REQUIRED — logo/icon), size (20-500, default 120px), position ("center"|"top-left"|"top-right"|"bottom-left"|"bottom-right"), glowColor (hex, optional — adds drop-shadow glow), entrance, exit',
    defaultSfx: 'pop',
    recommendedStyles: ['ai-tool-showcase', 'dynamic'],
    styleHint: 'tool logos, app icons, brand marks — use when introducing a tool by name',
  },
  {
    type: 'highlight-marker',
    description:
      'Semi-transparent marker overlay — draws left-to-right like a physical highlighter pen. Uses mix-blend-mode: multiply.',
    config:
      'x, y, width, height (all 0-100% of screen, REQUIRED), color (hex, default #FFFF00), opacity (0-1, default 0.35), entrance, exit',
    recommendedStyles: ['cyber-retro', 'educational'],
    styleHint:
      'highlight key text in screenshots, documents, code — pair with parallax-screenshot or B-roll',
  },
  {
    type: 'circular-pip',
    description:
      'Circular PiP with pulsating neon glow border and gentle floating motion. Face bubble overlay.',
    config:
      'videoUrl (URL, REQUIRED), size (10-50% of screen width, default 25), position ("top-left"|"top-right"|"bottom-left"|"bottom-right"), glowColor (hex, default #00f2ff), glowIntensity (0-1, default 0.6), entrance, exit',
    recommendedStyles: ['dynamic', 'cyber-retro'],
    styleHint: 'talking head bubble on screen recordings, face cam overlay',
  },
  {
    type: 'neon-glow-text',
    description:
      'Text with intense neon glow and organic flickering effect. Multiple text-shadow layers for neon look.',
    config:
      'text (string, REQUIRED), color (hex, default #00f2ff), fontSize (24-200, default 72), position ("center"|"top"|"bottom"), entrance, exit',
    recommendedStyles: ['dynamic', 'cyber-retro'],
    styleHint: 'titles, brand names, key phrases with neon/cyberpunk aesthetic',
  },
];

// ── Segment catalog (non-effect composition elements) ────────

export interface SegmentCatalogEntry {
  readonly type: string;
  readonly description: string;
  readonly config: string;
  readonly dynamicGuideline: string;
}

export const SEGMENT_CATALOG: readonly SegmentCatalogEntry[] = [
  {
    type: 'zoomSegments',
    description: 'Punch-in zoom on base content — creates camera movement illusion',
    config:
      'startTime, endTime, scale (1.0-3.0, default 1.5), focusPoint ({x,y} percentage, default center), easing ("spring"|"smooth"|"instant" — instant=jump-cut zoom, no transition)',
    dynamicGuideline:
      'Use 3-5 per 30s with spring easing. Each 1-3s. Zoom in on key words, zoom out to reveal.',
  },
  {
    type: 'lowerThirds',
    description: 'Animated name/title bar at bottom of screen',
    config:
      'startTime, endTime, title (string), subtitle (string, optional), backgroundColor (default #000000CC), textColor (default #FFFFFF), position ("left"|"center"), accentColor (default #3B82F6)',
    dynamicGuideline: 'Use to introduce tool names, URLs, handles. Max 2 per reel.',
  },
  {
    type: 'counters',
    description:
      'Spring-animated number counter — MANDATORY for any number/stat/percentage in the script',
    config:
      'startTime, endTime, value (number), prefix (e.g. "$"), suffix (e.g. "%"), format ("full"|"abbreviated"), textColor, fontSize, position ("center"|"top"|"bottom"), mode ("count-up"|"countdown" — count-up=0→value default, countdown=value→0 with mono font)',
    dynamicGuideline:
      'ALWAYS use when script mentions a number, stat, price, or percentage. 2-3s duration. Pair with "rise" SFX.',
  },
  {
    type: 'highlights',
    description: 'Colored rectangle highlight — points at things on screen',
    config:
      'startTime, endTime, x, y, width, height (all percentages 0-100), color (default #FF0000), borderWidth, label (optional), glow (boolean), style ("border"|"marker" — border=outline box, marker=filled semi-transparent highlighter pen)',
    dynamicGuideline:
      'Use for UI demos to highlight buttons, inputs, areas of interest. COMBO: pair with B-roll image (auto Ken Burns) for document/screenshot walkthroughs — slow zoom + highlight markers appearing on key phrases.',
  },
  {
    type: 'ctaSegments',
    description: 'Animated call-to-action button/banner',
    config:
      'startTime, endTime, text (string), style ("button"|"banner"|"pill"), backgroundColor, textColor, position ("bottom"|"center"|"top")',
    dynamicGuideline: 'Use near the end. Max 1 per reel. "Follow for more" or product link.',
  },
  {
    type: 'speedRamps',
    description: 'Speed ramp — slow motion / fast forward on base video',
    config: 'startTime, endTime, rate (0.1-4.0, default 1.0 — 0.3=slow-mo, 2.0=fast forward)',
    dynamicGuideline:
      'Use 0.3x slow-mo at dramatic reveals, punchlines. Use 2-4x fast-forward for skippable setup/transitions. Max 2-3 per reel. Each 0.5-2s. Extremely popular on TikTok.',
  },
];

// ── Sound effects catalog ───────────────────────────────────

export interface SfxCatalogEntry {
  readonly id: string;
  readonly description: string;
  readonly durationMs: number;
}

/**
 * Built-in SFX files in public/sfx/.
 * The LLM director can reference these by ID (e.g. "whoosh") in effect configs.
 */
export const SFX_CATALOG: readonly SfxCatalogEntry[] = [
  {
    id: 'pop',
    description: 'Quick pop/bubble sound — emoji reactions, item appearing',
    durationMs: 480,
  },
  {
    id: 'whoosh',
    description: 'Swoosh/whoosh — text emphasis, slide transitions, fast motion',
    durationMs: 600,
  },
  {
    id: 'ding',
    description: 'Bell/notification ding — subscribe banners, achievements',
    durationMs: 800,
  },
  {
    id: 'glitch',
    description: 'Digital glitch noise — glitch transitions, error moments',
    durationMs: 500,
  },
  {
    id: 'swipe',
    description: 'Swipe/slide sound — screen transitions, card reveals',
    durationMs: 500,
  },
  { id: 'click', description: 'UI click sound — button presses, selections', durationMs: 400 },
  {
    id: 'rise',
    description: 'Rising tone — counters going up, building tension',
    durationMs: 1000,
  },
  {
    id: 'keyboard',
    description: 'Rapid mechanical keyboard typing burst, 300-500ms — coding/terminal scenes',
    durationMs: 400,
  },
  {
    id: 'thud',
    description: 'Deep bass thud/hit, ~400ms — emotional accent on zoom/emphasis moments',
    durationMs: 400,
  },
];

// ── SFX override registry (private modules can register premium SFX) ──

const sfxOverrides = new Map<string, string>();

/** Register a premium SFX URL override. The ID must match an SFX_CATALOG entry. */
export function registerSfxOverride(sfxId: string, url: string): void {
  sfxOverrides.set(sfxId, url);
}

/** Map SFX ID to URL. Premium override takes priority over built-in. */
export function sfxIdToUrl(sfxId: string): string {
  return sfxOverrides.get(sfxId) ?? `sfx/${sfxId}.mp3`;
}

// ── Shot layout catalog ─────────────────────────────────────
// Per-shot layout options for hybrid-anchor mode.

export interface ShotLayoutCatalogEntry {
  readonly type: string;
  readonly description: string;
  readonly requiresMultiPanel?: boolean;
  readonly example?: string;
}

export const SHOT_LAYOUT_CATALOG: readonly ShotLayoutCatalogEntry[] = [
  {
    type: 'head',
    description:
      'Fullscreen presenter/primary video. No b-roll overlay. Use for talking-to-camera, hooks, CTAs.',
  },
  {
    type: 'content',
    description:
      'Fullscreen b-roll. Content fills entire screen. Use for demos, screenshots, AI visuals.',
  },
  {
    type: 'split',
    description:
      'Anchor split — head bottom 45%, content top 55% with rounded card. Use for "explaining while showing".',
  },
  {
    type: 'montage',
    description:
      'Multi-panel — 2-4 horizontal strips with animated entrances. Requires media.type="multi-panel" with panels array. Use for rapid showcases.',
    requiresMultiPanel: true,
    example:
      '{"media":{"type":"multi-panel","url":"#000","panels":[{"url":"img1","type":"image"},{"url":"vid1","type":"video"}]},"shotLayout":"montage"}',
  },
];

// ── Background music catalog ────────────────────────────────
export interface BgmCatalogEntry {
  readonly id: string;
  readonly description: string;
  readonly bpm: string;
}

/**
 * Built-in BGM tracks in public/bgm/.
 * The LLM director can reference these by ID in musicUrl.
 */
export const BGM_CATALOG: BgmCatalogEntry[] = [
  {
    id: 'synthwave',
    description: 'Dark synthwave / retrowave, 100-120 BPM. For cyber-retro profile.',
    bpm: '100-120',
  },
  {
    id: 'lofi',
    description: 'Lo-fi hip hop / chill beats, 60-80 BPM. For educational/calm content.',
    bpm: '60-80',
  },
  {
    id: 'upbeat-corporate',
    description: 'Upbeat corporate / motivational, 100-120 BPM. For clean-corporate profile.',
    bpm: '100-120',
  },
];

// ── BGM override registry (private modules can register premium BGM) ──

const bgmOverrides = new Map<string, string>();

/** Register a premium BGM URL override. */
export function registerBgmOverride(bgmId: string, url: string): void {
  bgmOverrides.set(bgmId, url);
}

/** Register additional BGM tracks (extends catalog + provides URL). */
export function registerBgm(entry: BgmCatalogEntry & { url: string }): void {
  (BGM_CATALOG as BgmCatalogEntry[]).push(entry);
  bgmOverrides.set(entry.id, entry.url);
}

/** Map BGM ID to URL. Premium override takes priority over built-in. */
export function bgmIdToUrl(bgmId: string): string {
  return bgmOverrides.get(bgmId) ?? `bgm/${bgmId}.mp3`;
}

// ── Font catalog ────────────────────────────────────────────
// Single source of truth for all loadable fonts.
// ReelComposition.tsx loads these; prompt-builder.ts lists them for the LLM.

export const FONT_CATALOG = [
  'Arial',
  'Helvetica',
  'Inter',
  'Outfit',
  'Roboto',
  'Montserrat',
  'Poppins',
  'Ubuntu',
  'Fira Code',
  'JetBrains Mono',
] as const;

// ── Layout catalog ──────────────────────────────────────────

export interface LayoutCatalogEntry {
  readonly type: string;
  readonly description: string;
}

export const LAYOUT_CATALOG: readonly LayoutCatalogEntry[] = [
  {
    type: 'fullscreen',
    description: 'Single video fills the frame (best for faceless or avatar-only reels)',
  },
  {
    type: 'split-screen',
    description: 'Two video sources side by side (talking head + screen recording)',
  },
  { type: 'picture-in-picture', description: 'Small overlay on main content' },
];

// ── Caption style property catalog ──────────────────────────
// Tells the LLM what captionStyle properties are available and what they do.
// Derived from SubtitleStyle interface in @reelstack/types.

export interface CaptionPropertyCatalogEntry {
  readonly key: string;
  readonly type: string;
  readonly description: string;
}

export const CAPTION_PROPERTY_CATALOG: readonly CaptionPropertyCatalogEntry[] = [
  {
    key: 'fontFamily',
    type: 'string',
    description: `One of: ${['Arial', 'Helvetica', 'Inter', 'Outfit', 'Roboto', 'Montserrat', 'Poppins', 'Ubuntu'].map((f) => `"${f}"`).join(', ')}`,
  },
  { key: 'fontSize', type: 'number', description: '48-96 for reels, bigger = more impact' },
  { key: 'fontColor', type: 'hex', description: 'Text color (e.g. "#FFFFFF")' },
  { key: 'fontWeight', type: '"normal" | "bold"', description: 'Font weight' },
  { key: 'backgroundColor', type: 'hex', description: 'Caption background box color' },
  { key: 'backgroundOpacity', type: '0-1', description: '0 = no background box, 1 = solid' },
  { key: 'outlineColor', type: 'hex', description: 'Text outline/stroke color' },
  { key: 'outlineWidth', type: '0-5', description: '0 = no outline' },
  { key: 'shadowBlur', type: '0-20', description: 'Text shadow blur radius' },
  {
    key: 'position',
    type: '0-100',
    description: 'Vertical %, 0=top, 100=bottom, 70-80 recommended',
  },
  { key: 'highlightColor', type: 'hex', description: 'Color for highlighted/active word' },
  {
    key: 'highlightMode',
    type: 'string',
    description:
      'Highlight mode ID. Built-in: "text" = color change, "pill" = rounded pill. Additional modes available via plugins.',
  },
  {
    key: 'textTransform',
    type: '"none" | "uppercase"',
    description: 'TikTok/MrBeast style = uppercase',
  },
  {
    key: 'pillColor',
    type: 'hex',
    description: 'Background color of the pill highlight (when highlightMode="pill")',
  },
  { key: 'pillBorderRadius', type: 'number', description: 'Border radius of the pill highlight' },
];

// ── Animation catalogs ──────────────────────────────────────

export const ENTRANCE_ANIMATIONS = [
  'fade',
  'spring-scale',
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
] as const;
export const EXIT_ANIMATIONS = [
  'fade',
  'slide-down',
  'slide-up',
  'slide-left',
  'shrink',
  'scale-blur',
  'pop-out',
  'glitch',
  'none',
] as const;
export const LOOP_ANIMATIONS = [
  'pulse',
  'wave',
  'shake',
  'swing',
  'neon-pulse',
  'float',
  'color-cycle',
  'none',
] as const;

// ── Transition catalog ──────────────────────────────────────

export interface TransitionCatalogEntry {
  readonly type: string;
  readonly description: string;
  readonly recommendedStyles?: readonly (
    | 'dynamic'
    | 'calm'
    | 'cinematic'
    | 'educational'
    | 'cyber-retro'
    | 'clean-corporate'
    | 'ai-tool-showcase'
  )[];
}

export const TRANSITION_CATALOG: readonly TransitionCatalogEntry[] = [
  {
    type: 'crossfade',
    description: 'Smooth opacity blend',
    recommendedStyles: ['calm', 'cinematic', 'educational'],
  },
  {
    type: 'slide-left',
    description: 'Slide in from the right',
    recommendedStyles: ['dynamic', 'educational'],
  },
  { type: 'slide-right', description: 'Slide in from the left', recommendedStyles: ['dynamic'] },
  {
    type: 'slide-perspective-right',
    description:
      '3D card sliding in from right with perspective depth — left edge closer, right edge recedes',
    recommendedStyles: ['dynamic', 'cinematic'],
  },
  {
    type: 'zoom-in',
    description: 'Zoom and crossfade',
    recommendedStyles: ['dynamic', 'cinematic'],
  },
  { type: 'wipe', description: 'Horizontal wipe reveal', recommendedStyles: ['dynamic'] },
  {
    type: 'blur-dissolve',
    description: 'Blur-to-sharp dissolve — clean, professional transition',
    recommendedStyles: ['calm', 'cinematic'],
  },
  {
    type: 'flash-white',
    description: 'White flash between clips — beat-sync staple',
    recommendedStyles: ['dynamic'],
  },
  {
    type: 'whip-pan',
    description: 'Fast slide with directional motion blur',
    recommendedStyles: ['dynamic'],
  },
  {
    type: 'cross-zoom',
    description: 'Zoom in with blur, then zoom out revealing new clip',
    recommendedStyles: ['dynamic', 'cinematic'],
  },
  {
    type: 'iris-circle',
    description: 'Circular reveal expanding from center',
    recommendedStyles: ['dynamic', 'cinematic'],
  },
  {
    type: 'spin',
    description: 'Rotating entrance with scale — energetic, playful',
    recommendedStyles: ['dynamic'],
  },
  {
    type: 'morph-to-pip',
    description:
      'Small circle in bottom-right corner morphs to fill the entire screen — screen-to-face reveal',
    recommendedStyles: ['dynamic', 'cinematic'],
  },
  { type: 'none', description: 'Hard cut', recommendedStyles: ['dynamic'] },
];

/** Flat list of transition type strings (backward compat) */
export const TRANSITION_TYPES = TRANSITION_CATALOG.map((t) => t.type);

// ── Montage profile catalog ─────────────────────────────────
// Director style profiles that determine pacing, transitions, SFX, and rules.
// Independent from layouts — any profile can combine with any layout.
// Uses a Map-backed registry so private modules can register additional profiles.

export interface MontageProfileEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly pacing: 'fast' | 'very-fast' | 'extreme';
  readonly maxShotDurationSec: number;
  readonly effectsPerThirtySec: number;
  readonly allowedTransitions: readonly string[];
  readonly sfxMapping: Record<string, string>;
  readonly directorRules: readonly string[];
  readonly topicKeywords: readonly string[];
  readonly toolPreference: readonly string[];
  readonly colorPalette: Record<string, string>;
  /** CSS filter string auto-applied to B-roll segments (e.g. 'brightness(0.8) contrast(1.1)'). */
  readonly bRollFilter?: string;
  /** Suggested reel arc template for the LLM director. */
  readonly arcTemplate?: string;
}

// ── Registry (Map-backed) ───────────────────────────────────

const _profileRegistry = new Map<string, MontageProfileEntry>();

/** Register a montage profile. Overwrites if id already exists. */
export function registerMontageProfile(profile: MontageProfileEntry): void {
  _profileRegistry.set(profile.id, profile);
}

/** Get a single profile by ID, or undefined if not found. */
export function getMontageProfile(id: string): MontageProfileEntry | undefined {
  return _profileRegistry.get(id);
}

/** Return all registered profiles as a readonly array (snapshot). */
export function listMontageProfiles(): readonly MontageProfileEntry[] {
  return [..._profileRegistry.values()];
}

/**
 * Backward-compat alias: returns the same as `listMontageProfiles()`.
 * @deprecated Use `listMontageProfiles()` instead.
 */
export function getMontageProfileCatalog(): readonly MontageProfileEntry[] {
  return listMontageProfiles();
}

/** @deprecated Use `listMontageProfiles()` or `getMontageProfile()`. */
export const MONTAGE_PROFILE_CATALOG: readonly MontageProfileEntry[] = new Proxy(
  [] as MontageProfileEntry[],
  {
    get(_target, prop) {
      const arr = [..._profileRegistry.values()];
      if (prop === 'length') return arr.length;
      if (prop === Symbol.iterator) return arr[Symbol.iterator].bind(arr);
      if (typeof prop === 'string' && !isNaN(Number(prop))) return arr[Number(prop)];
      // Forward array methods (find, map, filter, etc.)
      const val = (arr as any)[prop];
      return typeof val === 'function' ? val.bind(arr) : val;
    },
  }
) as any;

// ── Default profile (generic, no creator references) ────────

registerMontageProfile({
  id: 'default',
  name: 'Dynamic General',
  description: 'Versatile fast-paced montage style. Works for any topic.',
  pacing: 'fast',
  maxShotDurationSec: 4,
  effectsPerThirtySec: 10,
  allowedTransitions: ['crossfade', 'slide-left', 'zoom-in', 'blur-dissolve', 'none'],
  sfxMapping: {
    'text-appear': 'pop',
    cut: 'whoosh',
    transition: 'swipe',
    highlight: 'ding',
  },
  directorRules: [
    'Visual change every 3-4s. Shots without zoom/effect should not exceed max duration.',
    'Use text-emphasis for key terms and numbers.',
    'Pair counters with "rise" SFX for statistics.',
    'Subscribe banner near the end, max 1 per reel.',
  ],
  topicKeywords: ['general', 'tips', 'how-to', 'explainer', 'tutorial'],
  toolPreference: ['pexels', 'ai-image', 'ai-video'],
  colorPalette: {
    accent: '#3B82F6',
    text: '#FFFFFF',
    background: '#0F172A',
  },
  arcTemplate: `0-2s: HOOK - attention-grabbing text + zoom + SFX
2-8s: SETUP - introduce the topic, B-roll illustrations
8-20s: BODY - main content, fast cuts between visuals and face
20s+: CTA - call to action, subscribe banner`,
});
