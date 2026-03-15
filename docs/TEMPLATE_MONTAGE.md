# Template Montage System

Deterministic video montage from content packages. Zero LLM. Template config in, production plan out.

## When to Use

| Path                 | When                                                                       | LLM Cost             |
| -------------------- | -------------------------------------------------------------------------- | -------------------- |
| **Template montage** | You have content (script + assets + voiceover) and want predictable layout | $0                   |
| **LLM planner**      | You want AI to make creative decisions about shots/effects/transitions     | ~$0.05-0.15 per reel |
| **Module hardcoded** | Specialized compositions (ai-tips clips, n8n screenshots)                  | N/A                  |

Template montage is used by the `presenter-explainer` module. It can be used by any code that produces a `ContentPackage`.

## Core Flow

```
ContentPackage + templateId
  --> buildTemplatePlan()          Zero LLM, deterministic
  --> ProductionPlan               Shots, effects, zooms, PiP, captions
  --> assembleComposition()        Plan --> Remotion props
  --> ReelProps                    Ready for Remotion render
  --> renderVideo()                MP4 output
```

## ContentPackage

Standardized format between content production and montage. Any content producer (LLM script gen, user upload, n8n screenshots) outputs a ContentPackage; any montage strategy (template or LLM) consumes it.

```typescript
interface ContentPackage {
  script: string; // full narration text
  voiceover: {
    url: string; // audio file URL
    durationSeconds: number;
    source: 'tts' | 'ai-video-native' | 'talking-head-native';
  };
  cues: CaptionCue[]; // word-level timestamps from Whisper
  sections: ContentSection[]; // script split into timed segments
  assets: ContentAsset[]; // visual materials (images, videos)
  primaryVideo?: PrimaryVideo; // talking head / avatar (optional)
  metadata: ContentMetadata;
}
```

**Sections** map 1:1 to assets. Each section is a segment of narration with a corresponding visual.

**File:** `packages/agent/src/content/content-package.ts`

## Templates

A template defines a shot pattern that cycles through sections. It controls layout, timing, transitions, captions, PiP, zoom, effects, and animations.

### Built-in Templates

| ID                     | Name                        | Layout        | Style                                        |
| ---------------------- | --------------------------- | ------------- | -------------------------------------------- |
| `anchor-bottom-simple` | Anchor Bottom               | anchor-bottom | Simple head+content cycle                    |
| `hybrid-dynamic`       | Hybrid Dynamic              | hybrid-anchor | Mix of head/split/content shots              |
| `fullscreen-broll`     | Fullscreen B-Roll           | fullscreen    | Head bookends, fullscreen content            |
| `rapid-content`        | Rapid Content (Brad Gaines) | hybrid-anchor | Fast cuts, montage panels, minimal presenter |
| `pip-tutorial`         | PiP Tutorial (NetworkChuck) | hybrid-anchor | Fullscreen content + PiP presenter circle    |

### Adding a New Template

```typescript
import { registerTemplate } from '@reelstack/agent';

registerTemplate({
  // Required:
  id: 'my-template',
  name: 'My Custom Template',
  layout: 'hybrid-anchor', // 'hybrid-anchor' | 'anchor-bottom' | 'fullscreen'
  shotPattern: [
    { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 5 },
    { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 1.5 },
    { type: 'split', durationStrategy: 'fill-section', maxDurationSeconds: 4 },
    { type: 'montage', durationStrategy: 'fixed', fixedDurationSeconds: 3, panelCount: 3 },
  ],
  transition: 'varied', // 'crossfade' | 'slide-left' | 'zoom-in' | 'varied'

  // Optional (all have sensible defaults):
  captionMode: 'hormozi', // 'hormozi' | 'single-word' | 'pill' | 'text'
  maxCtaSeconds: 3,
  cta: 'Follow for more!',

  // Hook shot:
  hook: { type: 'head', minDuration: 1.5, maxDuration: 2.5 },

  // Zoom on head shots:
  zoom: { enabled: true, pattern: 'alternate', scale: 1.15 },

  // Deterministic effects:
  effectsConfig: { subscribeBanner: true, hookTextEmphasis: false },

  // PiP (presenter circle over content):
  showPip: true,
  pipConfig: { position: 'bottom-right', size: 32, shape: 'rounded' },
  pipStyle: { borderColor: '#00f2ff', borderWidth: 3 },

  // B-roll animation pool:
  animations: ['fade', 'slide', 'spring-scale'],

  // Transition duration:
  transitionDurationMs: 400,

  // Caption overrides:
  captionStyleOverrides: { highlightColor: '#FFFF00', fontSize: 72 },
});
```

Zero other code changes needed. Test immediately:

```bash
bun run scripts/presenter-dry-run.ts my-template
```

### Template Registry API

```typescript
import { registerTemplate, getTemplate, listTemplates } from '@reelstack/agent';

registerTemplate(config); // add or overwrite
const t = getTemplate('rapid-content'); // get by ID (or undefined)
const all = listTemplates(); // list all registered
```

**File:** `packages/agent/src/content/template-montage.ts`

## Shot Types

Templates define a repeating shot pattern. Each entry has a `type` that determines what's shown:

| Type      | What's visible                      | Consumes section? | Use                               |
| --------- | ----------------------------------- | ----------------- | --------------------------------- |
| `head`    | Fullscreen presenter (talking head) | No                | Short transitions between content |
| `content` | Fullscreen asset (image/video)      | Yes               | Main content display              |
| `split`   | Top: asset, bottom: presenter       | Yes               | Anchor-bottom style               |
| `montage` | 2-3 panels side by side             | No                | Quick multi-asset showcase        |

- **head** shots don't consume sections -- they're transition breathers between content
- **montage** shots don't consume sections -- they reuse existing assets as filler
- **content** and **split** each consume one section + its linked asset
- Pattern cycles: when the pattern ends, it starts over

### Duration Strategies

| Strategy       | Behavior                                                         |
| -------------- | ---------------------------------------------------------------- |
| `fill-section` | Duration = section audio length (capped by `maxDurationSeconds`) |
| `fixed`        | Duration = `fixedDurationSeconds` exactly                        |

## Configurable Behaviors

All optional. Defaults in parentheses match the current behavior.

### Hook (`hook`)

First shot of every reel. Default: 1.5-2.5s head shot.

```typescript
hook: {
  type: 'head',        // (head) or 'content' for content-first hooks
  minDuration: 1.5,    // (1.5) seconds minimum
  maxDuration: 2.5,    // (2.5) seconds maximum
}
```

### Zoom (`zoom`)

Subtle zoom effects on head shots for visual dynamism.

```typescript
zoom: {
  enabled: true,          // (true)
  pattern: 'alternate',   // (alternate) | 'all' | 'none'
  scale: 1.15,            // (1.15) zoom factor
  focusPoint: { x: 50, y: 45 },  // (center-top) CSS transform origin %
}
```

### Effects (`effectsConfig`)

Deterministic effects (no LLM needed).

```typescript
effectsConfig: {
  hookTextEmphasis: false,              // (false) text emphasis on hook
  subscribeBanner: true,                // (true) banner in last 3s if reel > 10s
  subscribeBannerText: 'Follow!',       // ('Obserwuj po wiecej!')
}
```

### PiP (`showPip` + `pipConfig` + `pipStyle`)

Show presenter as a rounded rectangle/circle overlaid on content shots.

```typescript
showPip: true,
pipConfig: {
  position: 'bottom-right',   // bottom-right | bottom-left | top-right | top-left | bottom-center
  size: 32,                    // (28) % of viewport width
  shape: 'rounded',           // (circle) | 'rounded'
},
pipStyle: {
  borderColor: '#FFD700',     // (#FFD700) gold
  borderWidth: 4,             // (4) px
  captionOffset: 55,          // (55) caption position % from top when PiP active
},
```

Adjacent content shots are merged into one continuous PiP segment (no re-entrance animation between them).

### Animations (`animations`)

B-roll entrance animation pool. Cycled per segment for variety.

```typescript
animations: ['spring-scale', 'fade', 'slide']; // default pool
```

Available: `spring-scale`, `fade`, `slide`, `none`.

### Transition Duration (`transitionDurationMs`)

```typescript
transitionDurationMs: 300; // (300) ms per transition
```

### Caption Style (`captionMode` + `captionStyleOverrides`)

```typescript
captionMode: 'hormozi',   // highlight mode for active word
captionStyleOverrides: {
  highlightColor: '#FFFF00',
  fontSize: 72,
  fontFamily: 'Inter',
  position: 50,            // % from top
},
```

## Layouts

Templates use one of three layouts (rendered in `ReelComposition.tsx`):

| Layout          | Behavior                                              | Shot types used |
| --------------- | ----------------------------------------------------- | --------------- |
| `hybrid-anchor` | Per-shot switching between head/content/split/montage | All 4           |
| `anchor-bottom` | Presenter fixed at bottom, content overlays on top    | head + content  |
| `fullscreen`    | 100% frame per shot, hard switching                   | head + content  |

## Dry-Run Testing

Test templates without AI generation costs:

```bash
# Mock boards (colored placeholders), real LLM + TTS + Whisper + render
bun run scripts/presenter-dry-run.ts [templateId] [topic] [targetDuration]

# Examples:
bun run scripts/presenter-dry-run.ts rapid-content
bun run scripts/presenter-dry-run.ts pip-tutorial "Docker tips" 30

# Full pipeline with real AI generation
bun run scripts/presenter-step-by-step.ts
```

## Key Files

| File                                                       | What                                      |
| ---------------------------------------------------------- | ----------------------------------------- |
| `packages/agent/src/content/template-montage.ts`           | Template registry + `buildTemplatePlan()` |
| `packages/agent/src/content/content-package.ts`            | ContentPackage interface                  |
| `packages/agent/src/content/render-content.ts`             | ContentPackage --> render pipeline        |
| `packages/agent/src/orchestrator/composition-assembler.ts` | ProductionPlan --> ReelProps              |
| `packages/agent/src/types.ts`                              | ProductionPlan, ShotPlan interfaces       |
| `packages/remotion/src/compositions/ReelComposition.tsx`   | Remotion rendering (layouts, shots)       |
| `packages/remotion/src/components/CaptionOverlay.tsx`      | Caption rendering (shared)                |
| `packages/remotion/src/components/PictureInPicture.tsx`    | PiP component                             |
| `packages/remotion/src/components/MultiPanelMontage.tsx`   | Multi-panel grid                          |
| `scripts/presenter-dry-run.ts`                             | Dry-run test tool                         |
