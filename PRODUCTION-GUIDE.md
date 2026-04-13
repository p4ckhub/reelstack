# ReelStack Production Guide

## Architecture

ReelStack is a monorepo for AI-powered short video production.

```
apps/web          Next.js API + dashboard
packages/agent    LLM planning, tool registry, orchestration, CLI
packages/remotion Remotion compositions, effects, overlays
packages/ffmpeg   Audio splitting, frame extraction
packages/storage  R2/MinIO/Supabase storage adapters
packages/tts      Edge-TTS, ElevenLabs, OpenAI TTS providers
packages/transcription  Whisper providers (Cloudflare, Ollama, OpenRouter)
packages/queue    BullMQ adapter
packages/database Prisma + Neon PostgreSQL
packages/modules  Private module implementations (separate repo)
```

## Modes

| Mode         | Description                                                              | LLM usage                           |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------- |
| `generate`   | Script only. AI discovers tools, plans shots, generates assets, renders. | Planner + Supervisor + PromptWriter |
| `compose`    | Script + user assets. AI arranges provided materials into a reel.        | Planner only                        |
| Module modes | e.g. `captions`, `ai-storytelling`, `n8n-explainer`                      | Module-specific                     |

## Pipeline Steps (generate mode)

1. **script-review** - Review script for factual errors (optional)
2. **discover-tools** - Scan env for available video/image tools
3. **audio** - Get audio + word-level timestamps (two paths, see below)
4. **plan** - Build production plan (template montage or AI director)
5. **supervisor** - Validate plan quality, virality score
6. **prompt-expansion** - Expand shot briefs into detailed prompts
7. **asset-gen** - Generate images/videos via tool registry
8. **asset-persist** - Upload assets to storage
9. **composition** - Assemble Remotion props from plan + assets + cues

## CLI

All commands output to `out/` (or `--out <dir>`).

### Pipeline A: Voiceover (TTS generates audio)

Use when: no talking head, voiceover only, AI-generated przebitki.

```bash
bun run rs tts "Your script text here" --voice pl-PL-MarekNeural --lang pl-PL
bun run rs plan out/tts.json --template jump-cut-dynamic
bun run rs assemble out/plan.json out/tts.json
bun run rs render out/composition.json
```

### Pipeline B: HeyGen avatar (audio already exists)

Use when: HeyGen talking head + przebitki. Do NOT run tts - audio is already in the HeyGen video.

```bash
# Generate avatar video (pick engine tier)
bun run rs heygen "Skrypt"                     # Avatar III (1 cr/min, cheapest)
bun run rs heygen "Skrypt" --iv                # Avatar IV (5 cr/min)
bun run rs heygen "Skrypt" --avatar-v          # Avatar V (10 cr/min, latest)

# Options
bun run rs heygen "Skrypt" --look <look-id>    # Specific outfit/look
bun run rs heygen "Skrypt" --background "#1a1a2e"  # Custom background
bun run rs heygen "Skrypt" --greenscreen       # Green screen → transparent overlay
bun run rs heygen "Skrypt" --rmbg              # Native background removal (matting)
bun run rs heygen "Skrypt" --motion "gestures" # Motion prompt (Avatar V/IV)
bun run rs heygen "Skrypt" --emotion Friendly --speed 1.1

# Poll and continue
bun run rs heygen-poll <job-id>
bun run rs transcribe out/heygen.mp4
bun run rs plan out/tts.json --director
bun run rs assets out/plan.json
bun run rs assemble out/plan.json out/tts.json
bun run rs render out/composition.json
```

### Transparent avatar (fullscreen content + talking head overlay)

Two methods:

- `--greenscreen`: generates on green (#00FF00), ffmpeg chromakey to WebM alpha. Works with any avatar.
- `--rmbg`: HeyGen native background removal. Requires avatar trained with matting enabled.

When `heygen.json` has `transparent: true`, `assemble` automatically sets `primaryVideoTransparent` and Remotion renders the avatar as overlay on top of b-roll content.

### Asset management

```bash
bun run rs regen <shot-id>                     # Regenerate one asset
bun run rs regen shot-10 --prompt "new desc"   # Regenerate with new prompt
bun run rs regen shot-10 --tool veo31-lite-kie # Use different tool
bun run rs replace <shot-id> <file>            # Replace with your own file
bun run rs replace shot-5 ~/screen.mp4         # User screencast
```

### User assets for AI director

```bash
bun run rs plan out/tts.json --director --assets ~/my-screenshots/
```

Files in the folder (png, jpg, mp4, webm, mov) are:

1. Described by Gemini 2.5 Flash vision (lazy-loads API key from Vaultwarden)
2. Uploaded to R2
3. Passed to AI director who decides where they fit in the narration

### Avatar management

```bash
bun run rs heygen-looks                        # List your avatar looks (outfits)
bun run rs heygen-looks --public               # List HeyGen stock avatars
bun run rs heygen-looks --type photo_avatar     # Filter by type
bun run rs heygen-status                       # Check quota
```

### Lip sync pipeline

```bash
bun run rs tts "Script for character"
bun run rs split-audio out/tts.json
bun run rs lipsync character.jpg --tool kling    # or --tool seedance
bun run rs plan out/tts.json
```

### CLI flags

| Flag                 | Command       | Description                                  |
| -------------------- | ------------- | -------------------------------------------- |
| `--voice <id>`       | tts           | TTS voice (default: pl-PL-MarekNeural)       |
| `--lang <code>`      | tts           | Language (default: pl-PL)                    |
| `--template <id>`    | plan          | Template ID (default: jump-cut-dynamic)      |
| `--director`         | plan          | Use AI director instead of template          |
| `--assets <dir>`     | plan          | User assets dir (screenshots, screencasts)   |
| `--style <name>`     | plan          | Style: dynamic, calm, cinematic, educational |
| `--avatar-v`         | heygen        | Avatar V engine (10 cr/min, latest)          |
| `--iv`               | heygen        | Avatar IV engine (5 cr/min)                  |
| `--look <id>`        | heygen        | Avatar look ID (outfit from heygen-looks)    |
| `--background <val>` | heygen        | Background color "#hex" or image URL         |
| `--greenscreen`      | heygen        | Green screen (for chromakey post-processing) |
| `--rmbg`             | heygen        | Native background removal (matting required) |
| `--motion <prompt>`  | heygen        | Body motion prompt (Avatar V/IV)             |
| `--emotion <name>`   | heygen        | Excited, Friendly, Serious                   |
| `--speed <n>`        | heygen        | Voice speed 0.5-1.5                          |
| `--prompt <text>`    | regen         | Override generation prompt                   |
| `--tool <name>`      | regen/lipsync | Tool ID for generation                       |
| `--out <dir>`        | all           | Output directory                             |

## API

### Generate reel

```
POST /api/v1/reel/generate
Authorization: Bearer rs_...
```

```json
{
  "script": "Your narration text",
  "mode": "generate",
  "layout": "hybrid-anchor",
  "tts": { "provider": "edge-tts", "voice": "en-US-AriaNeural", "language": "en-US" },
  "whisper": { "provider": "cloudflare" },
  "brandPreset": { "captionPreset": "tiktok" },
  "montageProfile": "ai-tool-showcase",
  "directorNotes": "Fast paced, tech audience",
  "callbackUrl": "https://your-server/webhook"
}
```

Response: `{ jobId, mode, status: "queued", pollUrl }`

### Poll status

```
GET /api/v1/reel/:jobId
```

### Webhook callback

Delivered on completion/failure. Signed with HMAC-SHA256.

Headers: `X-ReelStack-Signature`, `X-ReelStack-Event` (`reel.completed` or `reel.failed`)

## Templates

Templates define deterministic shot patterns (no LLM needed).

| Template               | Layout        | Description                                |
| ---------------------- | ------------- | ------------------------------------------ |
| `anchor-bottom-simple` | anchor-bottom | Presenter bottom, alternating content/head |
| `fullscreen-broll`     | fullscreen    | Full-screen B-roll with varied transitions |
| Premium templates      | various       | Registered by private modules              |

## Tool Registry

Tools are auto-discovered based on environment variables. Each provider file exports an `allXxxTools` catalog array. Adding a new model = one config object in the provider file (no discovery.ts or pricing.ts changes needed).

### Architecture

```
provider-tool.ts          Generic base class (ProviderTool) for REST API providers
kie-tool.ts               KIE models (KieTool class, similar pattern)
heygen-tool.ts            HeyGen (3 variants: Studio/Agent/Avatar V, shared base)
{provider}-tool.ts        Provider configs + model catalog arrays
registry/discovery.ts     Env-gated tool registration (uses allXxxTools catalogs)
config/pricing.ts         Static fallback pricing (tools self-declare via tool.pricing)
prompts/guidelines/*.md   Per-tool prompt guidelines (editable markdown)
```

### Always available

- `user-upload` - Passthrough for user-provided assets
- `pexels` - Stock footage (requires `PEXELS_ENABLED=true`)

### Video/Image generation

| Provider      | Env var                                      | Tools                                                   |
| ------------- | -------------------------------------------- | ------------------------------------------------------- |
| fal.ai        | `FAL_KEY`                                    | Kling, Seedance, Wan, Flux, Hailuo, LTX, Pika, Luma     |
| KIE.ai        | `KIE_API_KEY`                                | Kling, Seedance 2.0/1.5, Wan, Flux, NanoBanana, Veo 3.1 |
| PiAPI         | `PIAPI_KEY`                                  | Kling, Seedance 2.0, Hunyuan, Hailuo, Flux              |
| AIML API      | `AIMLAPI_KEY`                                | Kling v3, Flux, Veo3, Sora2, Pixverse                   |
| WaveSpeed     | `WAVESPEED_API_KEY`                          | Seedance, Wan 2.1/2.6, Flux, NanoBanana, Qwen           |
| Replicate     | `REPLICATE_API_TOKEN`                        | Wan, Flux/Pro, SDXL, Ideogram, Recraft                  |
| Runway        | `RUNWAY_API_KEY`                             | Runway Gen-4                                            |
| Minimax       | `MINIMAX_API_KEY`                            | Minimax Video                                           |
| Google Vertex | `VERTEX_PROJECT_ID`                          | Veo 3.1 (native audio, gcloud auth)                     |
| HeyGen        | `HEYGEN_API_KEY`                             | Avatar V/IV/III, Video Agent                            |
| HuMo          | `RUNPOD_API_KEY` + `HUMO_RUNPOD_ENDPOINT_ID` | Self-hosted avatar (RunPod serverless)                  |

### Veo 3.1 via KIE (3 tiers)

| Model   | Tool ID             | Cost         | Use for                     |
| ------- | ------------------- | ------------ | --------------------------- |
| Lite    | `veo31-lite-kie`    | ~$0.15/video | Batch testing, cheap B-roll |
| Fast    | `veo31-fast-kie`    | ~$0.50/video | Quick turnaround            |
| Quality | `veo31-quality-kie` | ~$1.00/video | Hero shots                  |

### HeyGen avatar tiers

| Engine     | Flag         | Cost      | API | Features                     |
| ---------- | ------------ | --------- | --- | ---------------------------- |
| Avatar III | (default)    | 1 cr/min  | v2  | Basic, good for testing      |
| Avatar IV  | `--iv`       | 5 cr/min  | v2  | Realistic motion, gestures   |
| Avatar V   | `--avatar-v` | 10 cr/min | v3  | Latest engine, motion_prompt |

### Tool priority (AI director)

AI video: seedance2-kie > seedance2-piapi > veo31-gemini > kling > others
AI image: nanobanana2-kie > flux > others

### Adding a new model

For providers using `ProviderTool` (piapi, wavespeed, aimlapi, replicate):

```typescript
// In {provider}-tool.ts — add one entry to the MODELS array:
{
  id: 'newmodel-provider',
  name: 'New Model via Provider',
  model: 'provider/new-model-v1',
  assetType: 'ai-video',
  pricing: { perSecond: 0.10 },
  capabilities: [{ assetType: 'ai-video', supportsPrompt: true, ... }],
  buildInput: (req) => ({ prompt: req.prompt, ... }),
}
// Done. No changes to discovery.ts or pricing.ts.
```

For KIE tools (same pattern but KieTool class):

```typescript
// In kie-tool.ts — add instance + add to allKieTools array
export const kieNewTool = new KieTool({ ... });
// Add to: export const allKieTools = [..., kieNewTool];
```

## Prompt System

All LLM prompts extracted to editable markdown files:

```
packages/agent/src/prompts/
  renderer.ts                 Mustache-style engine ({{variable}} + {{> partial}})
  loader.ts                   File loader with cache
  index.ts                    Public API: renderPrompt()

  templates/
    planner.md                AI director system prompt
    composer.md               User materials composition
    revision.md               Plan revision
    supervisor.md             Quality review
    prompt-writer.md          Shot brief expansion
    script-reviewer.md        Fact checking

  partials/
    rules-hook.md             Hook rules (shared)
    rules-retention.md        Retention patterns (shared)
    rules-no-text-redundancy.md  Caption duplication (shared)
    rules-text-duplication.md    Text effect rules (shared)
    rules-broll.md            B-roll search rules (shared)

  guidelines/
    seedance.md, veo3.md, nanobanana.md, ...  (20 per-tool guideline files)
```

Edit a prompt: modify the `.md` file. No TypeScript changes needed.

## ContentPackage

Standardized format between content production and rendering:

```typescript
interface ContentPackage {
  script: string;
  voiceover: { url: string; durationSeconds: number; source: 'tts' | 'ai-video-native' };
  cues: CaptionCue[]; // Word-level timing from Whisper
  sections: ContentSection[]; // Timed script sections with assetId references
  assets: ContentAsset[]; // Visual assets (video/image)
  primaryVideo?: PrimaryVideo; // Talking head (optional)
  metadata: { language: string };
}
```

## Modules

Modules extend ReelStack with custom pipelines.

```typescript
import { registerModule } from '@reelstack/agent';
import type { ReelModule } from '@reelstack/agent';

const myModule: ReelModule = {
  id: 'my-module',
  name: 'My Custom Module',
  compositionId: 'ReelComposition',
  configFields: [{ name: 'script', type: 'string', required: true, description: 'Narration' }],
  progressSteps: { Generating: 50, Rendering: 90 },
  async orchestrate(baseRequest, moduleConfig) {
    // Your pipeline logic
    return { outputPath: '/tmp/out.mp4', durationSeconds: 30 };
  },
};

registerModule(myModule);
```

Private modules live in a separate repo and register at import time via `import '@reelstack/modules'`.

## Remotion Components

### Compositions

- `ReelComposition` - Main reel (B-roll, captions, effects, overlays, transparent avatar)
- `VideoClip` - Single clip with captions (used by captions module)

### Overlay components

- `CaptionOverlay` - Word-level captions with highlight modes (hormozi, pill, single-word, glow)
- `LabelOverlay` - Text badges with directional arrows
- `MultiVideoOverlay` - Multiple video/image windows with staggered entrance
- `LogoOverlay` - Brand logo
- `CtaOverlay` - Call-to-action buttons
- `TextCardOverlay` - Full-screen text cards

### Transparent avatar support

When `primaryVideoTransparent: true` in composition props:

- Base layer renders background color (or nothing)
- B-roll overlays render fullscreen as usual
- Primary video (avatar) renders as transparent overlay on TOP of b-roll (LAYER 2.5)
- Captions, effects, etc. render above avatar

Enabled by `--greenscreen` (ffmpeg chromakey) or `--rmbg` (HeyGen native matting).

## Model Presets

Control LLM cost via `MODEL_PRESET` env var.

| Preset        | Planner | Supervisor | PromptWriter | ScriptReviewer |
| ------------- | ------- | ---------- | ------------ | -------------- |
| `production`  | Opus    | Sonnet     | Sonnet       | Sonnet         |
| `development` | Sonnet  | Sonnet     | Sonnet       | Sonnet         |
| `testing`     | Haiku   | Haiku      | Haiku        | Haiku          |

Override individual roles: `PLANNER_MODEL=claude-haiku-4-5-20251001`

LLM provider priority: OpenRouter > Anthropic > OpenAI (based on which key is set).

## Environment Variables

### Required (at least one LLM provider)

- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` or `OPENAI_API_KEY`

### Storage

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Or: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`

### Optional

- `MODEL_PRESET` - production (default), development, testing
- `DATABASE_URL` - Neon PostgreSQL connection string
- `REDIS_URL` - Redis for BullMQ job queue
- `GEMINI_API_KEY` - Gemini 2.5 Flash for asset description (lazy-loaded from Vaultwarden if not set)
- Tool-specific keys (see Tool Registry above)
- `HEYGEN_AVATAR_ID` - Default avatar look ID
- `HEYGEN_AVATAR_V_ID` - Default Avatar V look ID (falls back to HEYGEN_AVATAR_ID)
- `HEYGEN_VOICE_ID` - Default voice ID
- `WEBHOOK_CALLBACK_SECRET` - HMAC signing key for webhook callbacks

## Testing

```bash
bun test packages/          # Run all package tests
bun test packages/agent/    # Run agent tests only (1050 tests)
bun test packages/remotion/ # Run remotion tests only (122 tests)
```

### Safety

- `tests/setup.ts` (preloaded via bunfig.toml) clears all API keys and sets `MODEL_PRESET=testing`
- Integration tests use `.integration.ts` extension (not picked up by `bun test`)
- `setup-verify.test.ts` guards against accidental real API calls
- `catalog-consistency.test.ts` validates all tool catalogs (no duplicate IDs, required fields, pricing shape)
