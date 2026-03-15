# Composition Architecture

## Compositions

ReelStack has two compositions sharing common components:

| Composition | Aspect | Resolution | Use Case |
|-------------|--------|------------|----------|
| `Reel` | 9:16 | 1080x1920 | Instagram/TikTok/Shorts |
| `YouTubeLongForm` | 16:9 | 1920x1080 | YouTube videos |

Both compositions use the same effect components. All effects use CSS percentages and transforms (no pixel values), so they work at any resolution.

## Core Principle: One Transition Per Moment

The compositions use a **single-overlay architecture** that guarantees exactly one visual transition at any given time.

## Reel Layer Stack (ReelComposition)

```
Layer 0:  BASE + ZOOM    - fullscreen/split-screen video + punch-in zoom effects
Layer 1a: HELD           - previous segment kept visible during incoming entrance
Layer 1b: EXITING        - gentle fade out when ending with gap
Layer 2:  ACTIVE         - current overlay with entrance transition (B-roll, text-card, ken-burns)
Layer 3:  PIP            - picture-in-picture webcam overlay
Layer 4:  LOWER THIRD    - animated name tag bar
Layer 5:  HIGHLIGHTS     - colored highlight boxes on screen regions
Layer 6:  Audio          - voiceover + music (all OffthreadVideo muted)
Layer 7:  Captions       - karaoke word-by-word
Layer 8:  COUNTERS       - animated counting numbers
Layer 9:  CTA            - call-to-action buttons and pills
Layer 10: Progress bar
```

## YouTube Layer Stack (YouTubeLongFormComposition)

```
Layer 0:  BASE           - fullscreen / sidebar / horizontal-split layout
Layer 1:  ZOOM           - punch-in zoom effects
Layer 2a: HELD overlay
Layer 2b: EXITING overlay
Layer 3:  ACTIVE overlay - B-roll + text-card + ken-burns
Layer 4:  PIP
Layer 5:  LOWER THIRD
Layer 6:  HIGHLIGHTS
Layer 7:  Audio          - voiceover + music
Layer 8:  Captions
Layer 9:  CHAPTERS       - overlay mode here; fullscreen mode replaces all
Layer 10: COUNTERS
Layer 11: CTA
Layer 12: Progress bar
```

## Shared Effects

All effect schemas defined in `src/schemas/reel-props.ts` and imported by `youtube-props.ts`:

| Effect | Schema | Component | Both Compositions |
|--------|--------|-----------|-------------------|
| B-Roll Cutaways | `bRollSegmentSchema` | `BRollCutaway` | Yes |
| Text Cards | part of bRollSegment | `TextCardSlide` | Yes |
| PiP | `pipSegmentSchema` | `PiPOverlay` | Yes |
| Lower Third | `lowerThirdSegmentSchema` | `LowerThird` | Yes |
| CTA | `ctaSegmentSchema` | `CTAOverlay` | Yes |
| Animated Counter | `counterSegmentSchema` | `AnimatedCounter` | Yes |
| Zoom Effect | `zoomSegmentSchema` | `ZoomEffect` | Yes |
| Highlight Box | `highlightSegmentSchema` | `HighlightBox` | Yes |
| Captions | `captionCueSchema` | `CaptionOverlay` | Yes |
| Progress Bar | boolean flag | `ProgressBar` | Yes |
| Chapter Card | `chapterSegmentSchema` | `ChapterCard` | YouTube only |

## Effect Details

### ZoomEffect (Punch-in Zoom)

Wraps the base layer content with `transform: scale()` + `transform-origin` based on `focusPoint`.

```typescript
interface ZoomSegment {
  startTime: number;
  endTime: number;
  scale: number;           // 1.0-3.0, default 1.5
  focusPoint: { x: number; y: number }; // % coordinates, default {50,50}
  easing: 'spring' | 'smooth';          // spring = snappy, smooth = gradual
}
```

- Spring easing: fast entrance with overshoot
- Smooth easing: linear interpolation
- Applied to base layer (under overlays), so overlays are not zoomed

### AnimatedCounter

Animated number counting from 0 to target value.

```typescript
interface CounterSegment {
  startTime: number;
  endTime: number;
  value: number;            // target number
  prefix: string;           // "$", "" etc
  suffix: string;           // " subscribers", " views"
  format: 'full' | 'abbreviated'; // 1,234,567 vs 1.2M
  textColor: string;
  fontSize: number;
  position: 'center' | 'top' | 'bottom';
}
```

- Interpolates from 0 to `value` over segment duration
- Spring overshoot at end (briefly shows higher number, settles)
- `abbreviated` format: K/M/B suffixes

### HighlightBox

Colored border around a screen region to draw attention.

```typescript
interface HighlightSegment {
  startTime: number;
  endTime: number;
  x: number;          // % from left
  y: number;          // % from top
  width: number;      // % of screen width
  height: number;     // % of screen height
  color: string;      // border color, default '#FF0000'
  borderWidth: number; // px, default 3
  borderRadius: number;
  label?: string;     // text above/below box
  glow: boolean;      // box-shadow glow effect
}
```

- Spring entrance: scale 0.8 → 1 + opacity fade
- Glow: `box-shadow: 0 0 20px color`
- Label rendered in small font near the box

### ChapterCard (YouTube only)

Full-screen or overlay card for chapter transitions.

```typescript
interface ChapterSegment {
  startTime: number;
  endTime: number;       // typically 1.5-2.5s
  number?: number;       // "Chapter 3"
  title: string;
  subtitle?: string;
  style: 'fullscreen' | 'overlay';
  backgroundColor?: string;
  accentColor?: string;
}
```

- `fullscreen`: fills entire screen, spring scale entrance
- `overlay`: semi-transparent bar at bottom, slide-up

### TextCardSlide

Part of bRollSegment with `media.type: 'text-card'`:

```typescript
textCard: {
  headline: string;
  subtitle?: string;
  background: string;    // CSS gradient or color
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  fontSize: number;
}
```

### BRollCutaway Transitions

Available transition types for `bRollSegment.transition.type`:
- `crossfade` - opacity blend
- `slide-left` - enters from right
- `slide-right` - enters from left
- `zoom-in` - scales up from center
- `wipe` - horizontal wipe reveal
- `none` - instant cut

## How Overlays Work

### Base = Always Fullscreen
When `bRollSegments` are present, the base is ALWAYS fullscreen video. Split-screen is an overlay, not the base.

### Everything is an Overlay
All visual changes are entries in `bRollSegments`:
- `media.type: 'split-screen'` - split-screen layout, crossfades over fullscreen
- `media.type: 'color' | 'image'` - B-roll cutaway with label/content
- `media.type: 'text-card'` - gradient text card
- No overlay active = fullscreen base visible

### Entrance-Only Transitions
`computeEntrance()` only animates entrance (opacity 0→1, translateX 100%→0, etc). No exit animation. Exit handled by:
1. **Adjacent segments** - held overlay keeps previous visible under incoming
2. **Gap to fullscreen** - 300ms crossfade out

### Held Overlay (Cross-Transition)
When segment B starts right when A ends (`A.endTime === B.startTime`, <100ms tolerance):
- A stays at opacity 1 underneath B
- B enters with its transition ON TOP of A
- Single visual motion: B entering over A

### Exit Fade
When overlay ends with no adjacent next segment:
- 300ms crossfade out reveals fullscreen base

## YouTube Layouts

### Fullscreen
Standard single-source layout. Same as Reel but 16:9.

### Sidebar (screen + webcam)
```
┌──────────────────────┬──────────┐
│   Main content       │  Webcam  │
│   (screen/demo)      │  (30%)   │
└──────────────────────┴──────────┘
```
Props: `sidebarPosition: 'left' | 'right'`, `sidebarWidth: number` (% default 30)

### Horizontal Split (dual-source)
```
┌───────────┬───────────┐
│  Left     │  Right    │
│  (50%)    │  (50%)    │
└───────────┴───────────┘
```

## Audio

All `OffthreadVideo` components must be `muted`. Audio extracted as separate MP3, played via single `<Audio>` component. Prevents double audio and video freeze.

## OffthreadVideo startFrom

`startFrom` adds to the global frame: `video_frame = global_frame + startFrom`.
For B-roll showing same video at current timeline position: do NOT use `startFrom`.

## Caption Rendering

- Font: Outfit via `@remotion/google-fonts` with `latin-ext` for Polish
- Karaoke: word-by-word highlight with per-word `startTime`/`endTime`
- Highlight: solid color swap (CSS `color` doesn't support `linear-gradient`)
- Outline: 8-directional `text-shadow` (NOT `WebkitTextStroke` which creates holes)
- Last word: `isLastWord` check keeps highlight past `endTime`

## Whisper.cpp Token Merging

whisper.cpp returns sub-word BPE tokens. Leading space = new word boundary:
- ` C` + `ze` + `ść` + `!` → `Cześć!`
- ` ur` + `uch` + `omi` + `ć` → `uruchomić`
- Punctuation tokens append to previous word

## Schema Organization

```
reel-props.ts (shared schemas)
├── bRollSegmentSchema
├── captionCueSchema
├── captionStyleSchema
├── pipSegmentSchema
├── lowerThirdSegmentSchema
├── ctaSegmentSchema
├── counterSegmentSchema    ← shared
├── zoomSegmentSchema       ← shared
├── highlightSegmentSchema  ← shared
└── reelPropsSchema

youtube-props.ts (imports shared + adds YouTube-only)
├── imports from reel-props.ts
├── chapterSegmentSchema   ← YouTube only
└── youtubePropsSchema
```
