# ReelStack Production Guide

Practical reference for producing reels. Covers all production modes, configuration, and when to use what.

## Decision Tree: Which Mode to Use?

```
Do you have a script + want AI to decide everything?
  YES → produce() (Mode 1: Full Auto)

Do you have your own footage/images + want AI to arrange them?
  YES → produceComposition() (Mode 2: Compose)

Do you have a repeatable format (same pattern every time)?
  YES → renderContentPackage() (Mode 3: Template Montage)

Do you just need captions on existing video?
  YES → Captions module (overlay-only)
```

### When to use each mode

| Mode                     | LLM?           | Assets                                | Best for                                   |
| ------------------------ | -------------- | ------------------------------------- | ------------------------------------------ |
| `produce()`              | Yes (planner)  | AI-generated (Veo, Pexels, HeyGen...) | One-off reels from script                  |
| `produceComposition()`   | Yes (composer) | User-provided                         | Arranging your own footage                 |
| `renderContentPackage()` | No (template)  | Pre-prepared ContentPackage           | Repeatable series (AI tips, n8n tutorials) |
| Captions module          | No             | Existing video                        | Adding subtitles/effects                   |

---

## Mode 1: `produce()` — Full Auto

AI decides shots, layout, effects. You provide script + preferences.

```typescript
import { produce } from '@reelstack/agent';

const result = await produce({
  script: 'AI zabije copywriting. Ale nie tak jak myślisz...',
  style: 'dynamic',        // 'dynamic' | 'calm' | 'cinematic' | 'educational'
  layout: 'fullscreen',    // optional, LLM decides if not set
  tts: { provider: 'edge-tts', voice: 'pl-PL-MarekNeural' },
  brandPreset: { ... },    // see Brand Preset section
});
```

**Pipeline:** TTS → Whisper → LLM plans shots → generate assets → assemble → render

**What LLM decides:** primary source (avatar/recording/AI video), all shots + timing, B-roll prompts, effects, zoom segments, captions suggestions.

**What you control:** script, style (pacing), layout (hint), TTS voice, brandPreset (overrides LLM).

---

## Mode 2: `produceComposition()` — Compose

You provide footage. AI arranges it on timeline.

```typescript
import { produceComposition } from '@reelstack/agent';

const result = await produceComposition({
  script: 'Oto 3 narzędzia AI które musisz znać...',
  assets: [
    {
      id: 'head',
      url: '/path/to/talking-head.mp4',
      type: 'video',
      description: 'Mówię do kamery',
      isPrimary: true,
      metadata: { avatarFraming: 'bottom-aligned' },
    },
    {
      id: 'screen1',
      url: '/path/to/screenshot.png',
      type: 'image',
      description: 'Screenshot narzędzia ChatGPT',
    },
  ],
  directorNotes: 'Pokaż screenshot gdy mówię o ChatGPT',
  layout: 'hybrid-anchor',
});
```

**Pipeline:** TTS → Whisper → LLM arranges your assets → assemble → render

**Key difference from produce():** No asset generation. LLM places YOUR materials.

---

## Mode 3: `renderContentPackage()` — Template Montage

Zero LLM. Template defines shot pattern deterministically.

```typescript
import { renderContentPackage } from '@reelstack/agent';

const result = await renderContentPackage({
  content: myContentPackage,  // pre-built ContentPackage
  templateId: 'jump-cut-dynamic',
  brandPreset: { ... },
});
```

**Pipeline:** Template → deterministic plan → assemble → render

**Templates available:**

| Template ID            | Style     | Layout        | Shots                         | Use case                        |
| ---------------------- | --------- | ------------- | ----------------------------- | ------------------------------- |
| `anchor-bottom-simple` | Calm      | anchor-bottom | 5-shot, head <35%             | Educational, tutorials          |
| `fullscreen-broll`     | Varied    | fullscreen    | 4-shot alternating            | B-roll heavy content            |
| `hybrid-dynamic`       | Dynamic   | hybrid-anchor | 8-shot + montage + PiP        | Mixed presenter + content       |
| `rapid-content`        | Fast      | hybrid-anchor | 9-shot + montage, single-word | Brad Gaines style               |
| `pip-tutorial`         | Calm      | hybrid-anchor | 5-shot, big PiP               | Screen tutorials (NetworkChuck) |
| `jump-cut-dynamic`     | Very fast | fullscreen    | 8-shot, aggressive zoom       | Jabłoński/Hormozi talking head  |

---

## Configuration Reference

### Caption System (3 independent axes)

Captions have THREE orthogonal concerns. Don't confuse them:

```
1. ANIMATION (how words appear over time)
   → Set via: BrandPreset.animationStyle OR template captionStyleOverrides.animationStyle

2. HIGHLIGHT (how active words look visually)
   → Set via: template highlightMode (maps to highlightMode)

3. STYLE (typography: font, size, color, position)
   → Set via: BrandPreset fields (fontSize, fontColor, ...) OR captionStyleOverrides
```

#### Animation styles (axis 1)

| Style            | Effect                                        | Best for                        |
| ---------------- | --------------------------------------------- | ------------------------------- |
| `none`           | All words visible at once                     | Minimal, clean                  |
| `word-highlight` | Active word changes color + scale 1.15x       | TikTok default                  |
| `word-by-word`   | Only active word visible                      | MrBeast, high impact            |
| `karaoke`        | Progressive word fill                         | Cinematic, classic              |
| `bounce`         | Words bounce in (easeOutBounce)               | Neon, playful                   |
| `typewriter`     | Words fade in sequentially                    | Documentary                     |
| `snap-pop`       | Words snap in at 1.3x, settle to 1.0 in 0.12s | Jabłoński, dynamic talking head |

#### Highlight modes (axis 2)

| Mode              | Effect                           | Where registered |
| ----------------- | -------------------------------- | ---------------- |
| `text`            | Color change only                | Built-in         |
| `pill`            | Colored background pill          | Premium          |
| `single-word`     | One giant centered word          | Premium          |
| `hormozi`         | Scale 1.15x (Alex Hormozi style) | Premium          |
| `glow`            | Glowing text effect              | Premium          |
| `pop-word`        | Pop-in animation                 | Premium          |
| `underline-sweep` | Animated underline               | Premium          |
| `box-highlight`   | Box around word                  | Premium          |

#### How to combine them

```typescript
// Jabłoński style: snap entrance + hormozi scale + gold color
templateConfig: {
  highlightMode: 'hormozi',           // highlight: active word scales 1.15x
  captionStyleOverrides: {
    animationStyle: 'snap-pop',     // animation: words snap in at 1.3x
    highlightColor: '#FFD700',      // style: gold color
    fontSize: 54,
    position: 45,                   // chest height
  },
}

// MrBeast style: one word at a time + text highlight + green
brandPreset: {
  captionPreset: 'mrbeast',        // preset bundles: word-by-word + bold + green
}

// TikTok style: word highlight + text mode + amber
brandPreset: {
  captionPreset: 'tiktok',         // preset bundles: word-highlight + Outfit font + amber
}

// Custom: karaoke animation + pill highlight + custom colors
brandPreset: {
  animationStyle: 'karaoke',
}
// + template:
templateConfig: {
  highlightMode: 'pill',
  captionStyleOverrides: {
    highlightColor: '#FF6B6B',
    fontSize: 48,
  },
}
```

### BrandPreset (master override)

BrandPreset is the highest-priority config. It overrides LLM suggestions and preset defaults.

```typescript
const brandPreset: BrandPreset = {
  // ── Caption preset (base) ──
  captionPreset: 'tiktok', // loads preset defaults
  animationStyle: 'snap-pop', // overrides preset's animation
  maxWordsPerCue: 3, // overrides preset's grouping

  // ── Caption style (overrides everything) ──
  fontSize: 54,
  fontFamily: 'Outfit',
  fontColor: '#FFFFFF',
  fontWeight: 'bold',
  highlightColor: '#FFD700',
  outlineWidth: 4,
  outlineColor: '#000000',
  position: 45, // vertical % (0=top, 100=bottom)
  textTransform: 'uppercase',

  // ── Layout ──
  layout: 'fullscreen', // WARNING: overrides even LLM/user choice

  // ── Music ──
  musicUrl: 'https://example.com/bgm.mp3',
  musicVolume: 0.15,

  // ── Persona ──
  personaId: 'animated-dev',

  // ── Logo ──
  logoOverlay: {
    url: 'https://example.com/logo.png',
    position: 'top-right',
    size: 8,
    opacity: 0.7,
  },
};
```

**Priority cascade:** Preset defaults < LLM suggestions < BrandPreset fields

**WARNING:** If you set `brandPreset.layout`, it overrides the layout in ALL modes, even if the user explicitly requested a different layout. Only set it if you want to force a layout for the brand.

### Template Montage Config

Full config for `registerTemplate()`:

```typescript
registerTemplate({
  // ── Required ──
  id: 'my-template',
  name: 'My Template',
  layout: 'fullscreen', // 'fullscreen' | 'hybrid-anchor' | 'anchor-bottom'
  shotPattern: [
    // cycles through sections
    { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 1.5 },
    { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 3 },
  ],
  transition: 'varied', // 'crossfade' | 'slide-left' | 'zoom-in' | 'varied'

  // ── Captions ──
  highlightMode: 'hormozi', // highlight mode (axis 2)
  captionStyleOverrides: {
    // style overrides (axis 3)
    highlightColor: '#FFD700',
    fontSize: 54,
    position: 45,
    animationStyle: 'snap-pop', // animation override (axis 1)
  },

  // ── Zoom ──
  zoom: {
    enabled: true,
    pattern: 'alternate', // 'alternate' | 'all' | 'none'
    scale: 1.15, // zoom factor
    focusPoint: { x: 50, y: 45 }, // center of zoom (%)
  },

  // ── PiP ──
  showPip: true,
  pipConfig: { position: 'bottom-right', size: 28, shape: 'circle' },
  pipStyle: { borderColor: '#FFD700', borderWidth: 4 },

  // ── Hook / CTA ──
  hook: { type: 'head', minDuration: 1.5, maxDuration: 2.5 },
  maxCtaSeconds: 2.5,
  cta: 'Obserwuj!',

  // ── Effects ──
  effectsConfig: {
    hookTextEmphasis: true,
    subscribeBanner: true,
    subscribeBannerText: 'Obserwuj po więcej!',
  },
  scrollStopper: { preset: 'zoom-bounce', durationSeconds: 0.5 },
  sfxMode: 'auto', // 'auto' | 'ai-director' | 'none'

  // ── Transitions ──
  transitionDurationMs: 200, // default 300
  animations: ['spring-scale', 'fade', 'slide'],
});
```

### Shot types in template patterns

| Type      | Consumes section? | Duration              | Visual                           |
| --------- | ----------------- | --------------------- | -------------------------------- |
| `head`    | No                | Fixed (1-2s)          | Primary video (presenter)        |
| `content` | Yes               | Fill section (capped) | B-roll from asset                |
| `split`   | Yes               | Fill section (capped) | Side-by-side presenter + content |
| `montage` | No (filler)       | Fixed                 | Multi-panel grid of assets       |

---

## ContentPackage (for Mode 3)

If using template montage, you need to build a ContentPackage first:

```typescript
const content: ContentPackage = {
  script: 'Full narration text...',
  voiceover: {
    url: '/path/to/voiceover.mp3',
    durationSeconds: 28,
    source: 'tts', // 'tts' | 'ai-video-native' | 'talking-head-native'
  },
  cues: [
    // from Whisper transcription
    {
      id: 'cue-1',
      text: 'AI zabije',
      startTime: 0,
      endTime: 1.2,
      words: [
        { text: 'AI', startTime: 0, endTime: 0.4 },
        { text: 'zabije', startTime: 0.4, endTime: 1.2 },
      ],
    },
  ],
  sections: [
    // timed script segments
    { index: 0, text: 'AI zabije copywriting', startTime: 0, endTime: 5, assetId: 'board-1' },
  ],
  assets: [
    // visual materials
    {
      id: 'board-1',
      url: '/path/to/image.jpg',
      type: 'image',
      role: 'board',
      description: 'Spider-man meme',
      sectionIndex: 0,
    },
  ],
  primaryVideo: {
    // optional talking head
    url: '/path/to/presenter.mp4',
    durationSeconds: 28,
    framing: 'bottom-aligned', // 'bottom-aligned' | 'centered' | 'top-aligned'
    loop: false,
    source: 'user-recording',
  },
  metadata: { language: 'pl' },
};
```

---

## Common Recipes

### "I want Jabłoński-style dynamic talking head reel"

```typescript
await renderContentPackage({
  content: myContentPackage,
  templateId: 'jump-cut-dynamic',
  // No brandPreset needed - template has all settings baked in
});
```

### "I want the same but with custom colors"

```typescript
await renderContentPackage({
  content: myContentPackage,
  templateId: 'jump-cut-dynamic',
  brandPreset: {
    highlightColor: '#FF6B6B', // overrides template's #FFD700
    fontColor: '#00FF88',
  },
});
```

### "I want AI to decide everything from my script"

```typescript
await produce({
  script: 'My script here...',
  style: 'dynamic',
  tts: { provider: 'edge-tts', voice: 'pl-PL-MarekNeural' },
});
```

### "I have my own footage, arrange it for me"

```typescript
await produceComposition({
  script: 'Narration text...',
  assets: [
    {
      id: 'talking',
      url: 'head.mp4',
      type: 'video',
      isPrimary: true,
      description: 'Mówię do kamery',
    },
    { id: 'demo', url: 'screen.png', type: 'image', description: 'Screenshot narzędzia' },
  ],
  directorNotes: 'Pokaż screenshot gdy mówię o narzędziu',
});
```

### "I want a series with consistent brand look"

```typescript
const BRAND: BrandPreset = {
  captionPreset: 'tiktok',
  animationStyle: 'snap-pop',
  highlightColor: '#FFD700',
  fontSize: 54,
  fontWeight: 'bold',
  textTransform: 'uppercase',
  personaId: 'animated-dev',
  logoOverlay: { url: 'logo.png', position: 'top-right', size: 8 },
};

// Every reel uses same brand:
await renderContentPackage({ content, templateId: 'jump-cut-dynamic', brandPreset: BRAND });
await renderContentPackage({ content2, templateId: 'jump-cut-dynamic', brandPreset: BRAND });
```

---

## HeyGen Avatar Integration

HeyGen generates talking-head videos from script. Two character types, two quality tiers.

### Character types

| Type               | Field              | Use case                         |
| ------------------ | ------------------ | -------------------------------- |
| `avatar` (default) | `avatar_id`        | Digital twin / pre-built avatars |
| `talking_photo`    | `talking_photo_id` | Animate a single photo           |

### Quality tiers

| Tier                  | Flag                        | Cost          | What you get                               |
| --------------------- | --------------------------- | ------------- | ------------------------------------------ |
| Standard (Engine III) | default                     | 1 credit/min  | Basic lip sync                             |
| Avatar IV             | `use_avatar_iv_model: true` | 6 credits/min | Realistic face, body, background movements |

### Configuration

`heygen_character` and `heygen_voice` use **exact HeyGen API field names** - pure passthrough, zero mapping.

```typescript
// Standard avatar (Engine III)
generate({
  script: 'Cześć, dzisiaj pokażę...',
  avatarId: 'my-avatar-id', // or HEYGEN_AVATAR_ID env var
});

// Avatar IV with motion prompt + voice emotion
generate({
  script: 'Cześć, dzisiaj pokażę...',
  heygen_character: {
    use_avatar_iv_model: true,
    prompt: 'gestures enthusiastically while explaining',
    keep_original_prompt: false,
  },
  heygen_voice: {
    emotion: 'Friendly', // Excited, Friendly, Serious, Soothing, Broadcaster
    speed: 1.1, // 0.5-1.5
  },
});

// Talking photo
generate({
  script: 'Hello from a photo...',
  heygen_character: {
    type: 'talking_photo',
    talking_photo_id: 'photo-abc',
    use_avatar_iv_model: true,
  },
});
```

### Env vars

| Var                | Purpose                                 | Default          |
| ------------------ | --------------------------------------- | ---------------- |
| `HEYGEN_API_KEY`   | API key (required)                      | -                |
| `HEYGEN_AVATAR_ID` | Default avatar ID                       | Abigail (public) |
| `HEYGEN_VOICE_ID`  | Default voice ID                        | Polish voice     |
| `HEYGEN_TEST_MODE` | `true` = free test videos (5/day limit) | `false`          |

### In produce() mode

LLM planner decides whether to use HeyGen based on script content and available tools. Set `HEYGEN_API_KEY` and the tool auto-discovers.

### In template montage mode

Set `primaryVideo.source: 'heygen'` in ContentPackage. Pre-generate avatar video, pass URL.

---

## Frame Chaining (Visual Continuity Between Clips)

When generating multiple AI video clips for a reel, each clip normally starts from scratch visually. Frame chaining fixes this: the last frame of clip N becomes the first frame of clip N+1, creating smooth visual transitions.

### How it works

Set `chainFromPrevious: true` on consecutive `ai-video` shots in the plan:

```typescript
shots: [
  { id: 's1', visual: { type: 'ai-video', prompt: 'developer at desk', toolId: 'seedance2-kie' } },
  {
    id: 's2',
    visual: { type: 'ai-video', prompt: 'developer stands up excited', toolId: 'seedance2-kie' },
    chainFromPrevious: true,
  },
  {
    id: 's3',
    visual: {
      type: 'ai-video',
      prompt: 'developer shows screen to colleague',
      toolId: 'seedance2-kie',
    },
    chainFromPrevious: true,
  },
];
```

Asset generator processes chained shots **sequentially**:

1. Generate clip 1 → complete
2. Download clip 1 → extract last frame → upload frame to storage
3. Generate clip 2 with `imageUrl` = last frame of clip 1 (maps to `first_frame_url` in Seedance 2.0)
4. Repeat for clip 3...

Independent shots (no `chainFromPrevious`) still generate in parallel.

### Tool support

| Tool                    | Field                       | Status         |
| ----------------------- | --------------------------- | -------------- |
| Seedance 2.0 (KIE)      | `first_frame_url`           | Native support |
| Veo 3.1 (Gemini)        | `imageUrl` → image-to-video | Supported      |
| fal.ai (Kling/Seedance) | `image_url`                 | Supported      |

### When to use

- Multi-scene AI video sequences (story reels)
- Smooth transitions between generated B-roll clips
- NOT needed for: HeyGen avatars (already consistent), user recordings, AI images

### Performance

Chained clips are sequential — each waits for the previous one. Budget ~5-10 min per clip (Seedance 2.0). A 3-clip chain = 15-30 min total vs ~10 min parallel.

---

## Lip Sync (AI Talking Head in Multiple Scenes)

Generate AI characters speaking to camera with lip sync to your TTS audio.

### CLI workflow

```bash
# 1. Generate voiceover
bun run rs tts "AI zmieni sposób w jaki pracujesz. To się dzieje teraz."

# 2. Split into per-scene audio fragments
bun run rs split-audio out/tts.json

# 3. Generate lip-synced clips (needs character portrait image)
bun run rs lipsync character.jpg
bun run rs lipsync character.jpg --tool seedance  # use Seedance instead of Kling

# 4. Continue normal pipeline
bun run rs plan out/tts.json
bun run rs render out/composition.json
```

### Tools

| Tool                             | How                                                     | Cost      | Best for                        |
| -------------------------------- | ------------------------------------------------------- | --------- | ------------------------------- |
| **Kling Avatar v2 Pro** (fal.ai) | `image_url` + `audio_url` → video                       | ~$0.115/s | Fast, stable API, good lip sync |
| **Seedance 2.0** (KIE)           | `reference_audio_urls` + `reference_image_urls` → video | ~$0.205/s | Higher quality, multi-reference |

### AI Storytelling module (private)

Full automated pipeline: script + character image → TTS → scene planning (LLM) → audio splitting → N lip-synced clips → template montage → render.

```typescript
// Mode: 'ai-storytelling' in reel config
{
  mode: 'ai-storytelling',
  script: 'Your narration text...',
  characterImageUrl: 'https://storage/character.jpg',
  lipSyncTool: 'kling',        // or 'seedance'
  templateId: 'jump-cut-dynamic',
  tts: { voice: 'pl-PL-MarekNeural' },
}
```

### Overlay components

- **MultiVideoOverlay**: Multiple floating video/image windows (for "reveal" moments)
- **LabelOverlay**: Text badges + arrows ("NOT A REAL PERSON" style callouts)

---

## Architecture Notes

1. **Layout priority:** request > plan > preset. `BrandPreset.layout` is ignored by the assembler - set layout at request/orchestrator level.

2. **animationStyle is global** (in captionStyle), not per-cue. Flows through 3-layer cascade: preset < template/plan < brandPreset.

3. **Template captionStyle goes through assembler cascade** - template sets layer 2 (like LLM suggestions), brandPreset overrides at layer 3.

4. **Premium highlight modes require module import** - `hormozi`, `pill`, `single-word` etc. only work if private modules are loaded. Without them, falls back to `text`.
