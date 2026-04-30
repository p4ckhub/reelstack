# AGENTS.md - ReelStack

AI video production platform. Generates short-form reels from text or content: TTS voiceover, Whisper captions, AI-generated visuals, deterministic or AI-directed montage, Remotion render.

Extensible via pluggable modules for specialized reel types (talking objects, workflow explainers, presenter reels, and more).

## CRITICAL — never run a full pipeline when iterating

ReelStack is a multi-step pipeline (`fetch-workflow → generate-script → review-script → capture-screenshot → tts-pipeline → assemble-props → render`). Every step persists its output to MinIO under `jobs/{id}/context.json`. **Do not call `POST /api/v1/reel/generate` to test a fix.** That re-runs the LLM, the TTS provider, Whisper, and screenshot capture — minutes of compute and real money — when 9 times out of 10 the change you're testing only affects one step.

Iterate via `POST /api/v1/reel/render/{id}/resume {"fromStepId": "<step>"}` from the latest cached step that contains your change. Mapping:

| Change                                                                                                                          | Resume from                      |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| HTML / CSS / GSAP timeline (e.g. `hyperframes/src/compositions/<id>/index.html`, Remotion `<*Composition>.tsx`)                 | `render`                         |
| Props mapping, runtime selection, sections augmentation (orchestrator's `buildHyperframes…Props` / `buildScreenExplainerProps`) | `assemble-props`                 |
| TTS voice / preset / phonetic transforms / mood-tag stripping                                                                   | `tts-pipeline`                   |
| Script reviewer (linter + LLM correction)                                                                                       | `review-script`                  |
| Script generator prompt                                                                                                         | `generate-script`                |
| Workflow fetch logic                                                                                                            | `fetch-workflow`                 |
| New workflow URL / new language / new voice model / fresh creative                                                              | only here is `/generate` correct |

**Hard rule:** before invoking `/generate`, ask "does my change affect anything strictly upstream of every cached step?" If not, it's a `/resume` case.

Worker note: bun caches TS bytecode. After editing any `.ts` in the orchestrator / module layer, restart the worker (`pkill -f "bun run worker/reel-worker.ts"` → re-launch) before resuming, otherwise the resume runs the stale build.

## Stack

- **Monorepo**: Bun workspaces + Turbo
- **Web**: Next.js 16 (App Router), Prisma + PostgreSQL, BullMQ + Redis
- **Worker**: Separate Docker container, processes BullMQ jobs
- **Render**: Remotion (React) -- local or AWS Lambda
- **Agent**: `packages/agent` -- AI orchestrator (Claude API) + template montage system
- **Modules**: Pluggable module system for specialized reel types
- **CI**: GitHub Actions -> ghcr.io Docker images

## Architecture

Two montage paths, shared rendering:

```
Path A: Template Montage (zero LLM, deterministic)
  ContentPackage + templateId -> buildTemplatePlan() -> ProductionPlan

Path B: LLM Director (AI-driven montage)
  Script + tools -> Claude planner -> ProductionPlan

Both paths:
  ProductionPlan -> assembleComposition() -> ReelProps -> Remotion render -> MP4
```

**ContentPackage** is the bridge: any content producer outputs it, any montage strategy consumes it.

**Template montage details:** see `docs/TEMPLATE_MONTAGE.md`
**Remotion layer stack:** see `packages/remotion/COMPOSITION.md`

## Directory Map

```
apps/web/                              Next.js app (web + API + worker)
  src/app/api/v1/reel/
    generate/route.ts                  POST /api/v1/reel/generate
    captions/route.ts                  POST /api/v1/reel/captions
    batch/route.ts                     POST /api/v1/reel/batch
    [id]/route.ts                      GET /api/v1/reel/:id (poll status)
  src/lib/worker/
    reel-pipeline-worker.ts            Routes by mode -> agent or module

packages/agent/                        AI production agent (@reelstack/agent)
  src/
    index.ts                           Public API exports
    types.ts                           Core interfaces (ProductionPlan, ShotPlan, etc.)
    content/
      content-package.ts               ContentPackage interface
      template-montage.ts              Template registry + buildTemplatePlan()
      render-content.ts                ContentPackage -> template -> assemble -> render
    orchestrator/
      production-orchestrator.ts       Main LLM-directed pipeline (produce())
      composition-assembler.ts         ProductionPlan -> ReelProps
      base-orchestrator.ts             Shared: TTS, Whisper, render
      pipeline-engine.ts               Step-by-step pipeline execution
      asset-generator.ts               Parallel asset generation + polling
    planner/
      production-planner.ts            Claude -> ProductionPlan JSON
      prompt-builder.ts                Dynamic prompt with tool manifest
      montage-profile.ts               3 montage profiles (cyber-retro, clean-corporate, ai-tool-showcase)
      plan-validator.ts                Deterministic fix (overlaps, gaps)
      plan-supervisor.ts               LLM review (Sonnet checks Opus)
    prompts/                           Extracted LLM prompts (see Prompt System below)
      renderer.ts                      Mustache-style engine ({{variable}} + {{> partial}})
      loader.ts                        File loader with cache
      index.ts                         Public API: renderPrompt()
      templates/                       6 main prompt templates (.md)
      partials/                        5 shared rule sections (.md)
      guidelines/                      20 per-tool prompt guidelines (.md)
    registry/                          Tool discovery + registry
    tools/                             19 tool adapters (see Tool Registry below)
    generators/                        Image + video generator abstractions
    modules/                           Module system (registerModule, getModule)

packages/remotion/                     Remotion compositions + components + effects
  COMPOSITION.md                       Layer stack, overlays, transitions
  src/compositions/                    ReelComposition, YouTubeLongForm, VideoClip
  src/components/                      CaptionOverlay, BRollCutaway, PiP, MultiPanelMontage
  src/effects/                         28 effects (emoji-popup, glitch, screen-shake, etc.)
  src/layouts/                         Fullscreen, SplitScreen, Sidebar, HorizontalSplit
  src/schemas/                         Zod schemas + catalog.ts (effect/transition/font catalog)

packages/modules/                      Pluggable module system
packages/types/                        Shared TypeScript interfaces
packages/core/                         Caption animation renderer, validation
packages/tts/                          TTS providers (edge-tts, ElevenLabs, OpenAI)
packages/transcription/                Whisper + word grouping
packages/storage/                      R2/S3/MinIO storage abstraction
packages/database/                     Prisma + PostgreSQL
packages/queue/                        BullMQ + Redis (or Inngest for cloud)
packages/ffmpeg/                       FFmpeg wrapper
packages/image-gen/                    Branded PNG generation (Playwright)
packages/logger/                       Pino structured logging

scripts/
  presenter-dry-run.ts                 Template dry-run (mock boards, real TTS/render)
  presenter-step-by-step.ts            Full pipeline with real AI generation
  dev-seed.ts                          Seed dev DB
docs/                                  Documentation (see below)
priv/                                  Private docs (gitignored)
```

## Key Concepts

### ContentPackage

Standardized format between content production and montage. Contains: script, voiceover (URL + duration + source), word-level caption cues (from Whisper), timed sections, visual assets, optional presenter video, metadata.

**File:** `packages/agent/src/content/content-package.ts`

### Template Montage

Deterministic montage: zero LLM, config-driven. Register a template with `registerTemplate()`, build a plan with `buildTemplatePlan(content, templateId)`. Built-in templates, easily extensible.

**Full docs:** `docs/TEMPLATE_MONTAGE.md`
**File:** `packages/agent/src/content/template-montage.ts`

### ProductionPlan

Output of both montage paths. Contains: shots (with layout, timing, transitions), effects, zoom segments, PiP segments, caption style, CTA, lower thirds, counters, highlights.

**File:** `packages/agent/src/types.ts`

### Modules

ReelStack supports pluggable modules for specialized reel types. Each module registers via `registerModule()` and can define its own content production pipeline, Remotion compositions, and schemas. The worker auto-routes to the correct module based on the `mode` field in the API request.

Core provides the infrastructure (TTS, Whisper, rendering, storage, tools). Modules add domain-specific logic.

**Interface:** `packages/agent/src/modules/module-interface.ts`

### Remotion packages — before writing anything

Before implementing a new card / transition / effect / TTS integration, check
[`docs/remotion-packages.md`](./docs/remotion-packages.md). It lists every official
`@remotion/*` package, what we already use, what's worth adding, and when NOT to
roll custom (e.g. `@remotion/captions` parses SRT/VTT — don't reinvent).
License boundaries live separately in `vault/brands/_shared/reference/remotion-license-strategy.md`.

## Tool Registry

Tools are auto-discovered based on environment variables. The architecture uses a `ProviderTool` base class pattern -- each provider file exports an `allXxxTools` catalog array. Adding a new model = one config object in the provider file (no discovery.ts or pricing.ts changes needed). Tools self-declare pricing via `tool.pricing`.

### Architecture

```
provider-tool.ts          Generic base class (ProviderTool) for REST API providers
                          Takes ProviderConfig (API details) + ModelConfig[] (per-model)
kie-tool.ts               KIE models (KieTool class, same ProviderConfig + ModelConfig pattern)
heygen-tool.ts            HeyGen (HeyGenBaseTool -> Studio/Agent/AvatarV, merged in 1 file)
{provider}-tool.ts        Provider configs + model catalog arrays (allXxxTools)
registry/discovery.ts     Env-gated tool registration (iterates allXxxTools catalogs)
config/pricing.ts         Static fallback pricing (tools self-declare via tool.pricing)
prompts/guidelines/*.md   Per-tool prompt guidelines (editable markdown)
```

Providers migrated to ProviderTool: piapi, wavespeed, aimlapi, replicate, fal, runway, minimax.
KIE has its own KieTool class (same config pattern, KIE-specific API).
HeyGen has HeyGenBaseTool with 3 subclasses: Studio (III), Agent, AvatarV (V/IV).

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

### HeyGen avatar tiers

| Engine     | Flag         | Cost      | API | Features                     |
| ---------- | ------------ | --------- | --- | ---------------------------- |
| Avatar III | (default)    | 1 cr/min  | v2  | Basic, good for testing      |
| Avatar IV  | `--iv`       | 5 cr/min  | v2  | Realistic motion, gestures   |
| Avatar V   | `--avatar-v` | 10 cr/min | v3  | Latest engine, motion_prompt |

Transparent avatar support: `--greenscreen` (ffmpeg chromakey to WebM alpha, any avatar) or `--rmbg` (HeyGen native background removal, requires matting-enabled avatar). When `heygen.json` has `transparent: true`, `assemble` automatically sets `primaryVideoTransparent` and Remotion renders avatar as overlay on top of b-roll.

### Adding a new tool

**For ProviderTool providers** (piapi, wavespeed, aimlapi, replicate, fal, runway, minimax):
Add one `ModelConfig` entry to the `MODELS` array in the provider file. Done. No changes to discovery.ts or pricing.ts.

```typescript
// In {provider}-tool.ts -- add to MODELS array:
{
  id: 'newmodel-provider',
  name: 'New Model via Provider',
  model: 'provider/new-model-v1',
  assetType: 'ai-video',
  pricing: { perSecond: 0.10 },
  capabilities: [{ assetType: 'ai-video', supportsPrompt: true, ... }],
  buildInput: (req) => ({ prompt: req.prompt, ... }),
}
```

**For KIE tools** (same pattern, KieTool class):
Add KieTool instance + add to `allKieTools` array.

```typescript
// In kie-tool.ts
export const kieNewTool = new KieTool({ ... });
export const allKieTools = [..., kieNewTool];
```

**For HeyGen**: Extend `HeyGenBaseTool` in `heygen-tool.ts`.

## Prompt System

All LLM prompts extracted to editable markdown files in `packages/agent/src/prompts/`. Edit a `.md` file to change prompt behavior -- no TypeScript changes needed.

```
prompts/
  renderer.ts                 Mustache-style engine ({{variable}} + {{> partial}})
  loader.ts                   File loader with cache
  index.ts                    Public API: renderPrompt()

  templates/                  6 main prompt templates
    planner.md                AI director system prompt
    composer.md               User materials composition
    revision.md               Plan revision
    supervisor.md             Quality review
    prompt-writer.md          Shot brief expansion
    script-reviewer.md        Fact checking

  partials/                   5 shared sections (included via {{> partial-name}})
    rules-hook.md             Hook rules
    rules-retention.md        Retention patterns
    rules-no-text-redundancy.md  Caption duplication
    rules-text-duplication.md    Text effect rules
    rules-broll.md            B-roll search rules

  guidelines/                 20 per-tool prompt guidelines
    seedance.md, veo3.md, nanobanana.md, kling.md, flux.md, ...
```

Renderer uses Mustache-style `{{variable}}` for data injection and `{{> partial}}` for including shared sections.

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

Use when: HeyGen talking head + przebitki. Do NOT run tts -- audio is already in the HeyGen video.

```bash
# Generate avatar video (pick engine tier)
bun run rs heygen "Skrypt"                     # Avatar III (1 cr/min, cheapest)
bun run rs heygen "Skrypt" --iv                # Avatar IV (5 cr/min)
bun run rs heygen "Skrypt" --avatar-v          # Avatar V (10 cr/min, latest)

# Options
bun run rs heygen "Skrypt" --look <look-id>    # Specific outfit/look
bun run rs heygen "Skrypt" --background "#1a1a2e"  # Custom background
bun run rs heygen "Skrypt" --greenscreen       # Green screen -> transparent overlay
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

## API Endpoints

> **Per-module recipes:** every mode has its own `README.md` next to the
> code. Lazy-load the one you need from the index in
> [`docs/MODULES.md`](./docs/MODULES.md) — don't read the whole catalog
> just to send one request.

### POST /api/v1/reel/generate

Two core modes, detected automatically from body shape:

**Generate mode** (no `assets`) - full AI production pipeline:

```json
{
  "script": "Your script text",
  "style": "dynamic",
  "tts": { "provider": "edge-tts", "voice": "pl-PL-MarekNeural", "language": "pl-PL" },
  "brandPreset": { "highlightColor": "#FFD700" }
}
```

**Compose mode** (with `assets`) - LLM arranges user-provided materials:

```json
{
  "script": "Your script text",
  "assets": [
    {
      "id": "clip1",
      "url": "https://...",
      "type": "video",
      "description": "Talking head",
      "isPrimary": true
    },
    {
      "id": "screen1",
      "url": "https://...",
      "type": "image",
      "description": "Dashboard screenshot"
    }
  ],
  "directorNotes": "Show dashboard screenshot when I mention analytics"
}
```

**Module mode** (with `mode` field) - routes to registered module:

```json
{
  "mode": "module-name",
  "script": "...",
  "config": { "moduleSpecificField": "value" }
}
```

Response: `{ "jobId": "...", "mode": "generate"|"compose"|"module-name" }`

### POST /api/v1/reel/captions

Add captions to an existing video. Supports `script` (runs TTS + Whisper) or pre-computed `cues`.

### GET /api/v1/reel/:id

Poll job status. Returns `{ status, outputUrl?, error? }`.

### Authentication

All endpoints require `Authorization: Bearer <api_key>` header.

Dev key: `rs_test_devSeedKey00000000000000000001` (after running `bun run api:seed`)

### Webhook callback

Delivered on completion/failure. Signed with HMAC-SHA256.

Headers: `X-ReelStack-Signature`, `X-ReelStack-Event` (`reel.completed` or `reel.failed`)

## Pipeline Modes

The worker (`reel-pipeline-worker.ts`) routes by `config.mode`:

| Mode         | Function               | What happens                                                                   |
| ------------ | ---------------------- | ------------------------------------------------------------------------------ |
| `generate`   | `produce()`            | Tool discovery -> LLM plan -> asset gen + TTS (parallel) -> assemble -> render |
| `compose`    | `produceComposition()` | TTS -> LLM composition plan -> assemble -> render                              |
| `captions`   | `produceComposition()` | Existing video + captions only                                                 |
| Module modes | Module pipeline        | Module-specific content production + montage                                   |

### Pipeline Steps (generate mode)

1. **script-review** - Review script for factual errors (optional)
2. **discover-tools** - Scan env for available video/image tools
3. **audio** - Get audio + word-level timestamps (two paths)
4. **plan** - Build production plan (template montage or AI director)
5. **supervisor** - Validate plan quality, virality score
6. **prompt-expansion** - Expand shot briefs into detailed prompts
7. **asset-gen** - Generate images/videos via tool registry
8. **asset-persist** - Upload assets to storage
9. **composition** - Assemble Remotion props from plan + assets + cues

## Running Locally

```bash
bun install
bun run dev                    # Dev server (web + Remotion studio)
bun run api:seed               # Seed dev DB (test user + API key)
bun run test                   # All tests
bun run api:test               # Bruno API tests (requires dev server on :3001)

# Template dry-run (mock boards, real TTS/render):
bun run scripts/presenter-dry-run.ts rapid-content
bun run scripts/presenter-dry-run.ts pip-tutorial "Docker tips" 30
```

## Environment Variables

### Required (at least one LLM provider)

```bash
ANTHROPIC_API_KEY=             # Claude API (LLM planner)
OPENROUTER_API_KEY=            # OpenRouter (alternative LLM provider)
OPENAI_API_KEY=                # OpenAI (alternative LLM provider)
```

LLM provider priority: OpenRouter > Anthropic > OpenAI (based on which key is set).

### Infrastructure

```bash
DATABASE_URL=                  # Neon PostgreSQL connection string
REDIS_URL=                     # Redis for BullMQ job queue
MODEL_PRESET=                  # production (default), development, testing
```

### Storage

```bash
R2_ACCOUNT_ID=                 # Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
# Or MinIO:
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=
```

### Tool API keys (auto-discovered)

```bash
PEXELS_API_KEY=                # Stock video/images
HEYGEN_API_KEY=                # HeyGen avatar video
KIE_API_KEY=                   # KIE.ai (Kling, Seedance, Veo 3.1, NanoBanana, Wan, Flux)
PIAPI_KEY=                     # PiAPI (Kling, Seedance, Hunyuan, Hailuo, Flux)
WAVESPEED_API_KEY=             # WaveSpeed (Seedance, Wan, Flux, NanoBanana, Qwen)
AIMLAPI_KEY=                   # AIML API (Kling v3, Flux, Veo3, Sora2, Pixverse)
REPLICATE_API_TOKEN=           # Replicate (Wan, Flux/Pro, SDXL, Ideogram, Recraft)
FAL_KEY=                       # fal.ai (Kling, Seedance, Wan, Flux, Hailuo, LTX, Pika, Luma)
RUNWAY_API_KEY=                # Runway Gen-4
MINIMAX_API_KEY=               # Minimax Video
VERTEX_PROJECT_ID=             # Veo 3.1 via Google Vertex (gcloud auth)
RUNPOD_API_KEY=                # RunPod (HuMo avatar)
HUMO_RUNPOD_ENDPOINT_ID=       # RunPod serverless endpoint ID
ELEVENLABS_API_KEY=            # ElevenLabs TTS
GEMINI_API_KEY=                # Gemini 2.5 Flash for asset description (lazy-loaded from Vaultwarden if not set)
```

### HeyGen configuration

```bash
HEYGEN_AVATAR_ID=              # Default avatar look ID (Avatar III)
HEYGEN_AVATAR_V_ID=            # Default Avatar V look ID (falls back to HEYGEN_AVATAR_ID)
HEYGEN_VOICE_ID=               # Default voice ID
```

### Other

```bash
WEBHOOK_CALLBACK_SECRET=       # HMAC signing key for webhook callbacks
```

Tools are auto-discovered: if the env var is set and `healthCheck()` passes, the tool is available to the LLM planner.

## Model Presets

Control LLM cost via `MODEL_PRESET` env var.

| Preset        | Planner | Supervisor | PromptWriter | ScriptReviewer |
| ------------- | ------- | ---------- | ------------ | -------------- |
| `production`  | Opus    | Sonnet     | Sonnet       | Sonnet         |
| `development` | Sonnet  | Sonnet     | Sonnet       | Sonnet         |
| `testing`     | Haiku   | Haiku      | Haiku        | Haiku          |

Override individual roles: `PLANNER_MODEL=claude-haiku-4-5-20251001`

## Testing

```bash
bun test packages/          # Run all package tests
bun test packages/agent/    # Run agent tests only (1050+ tests)
bun test packages/remotion/ # Run remotion tests only (122 tests)
```

### Safety

- `tests/setup.ts` (preloaded via bunfig.toml) clears all API keys and sets `MODEL_PRESET=testing`
- Integration tests use `.integration.ts` extension (not picked up by `bun test`)
- `setup-verify.test.ts` guards against accidental real API calls
- `catalog-consistency.test.ts` validates all tool catalogs (no duplicate IDs, required fields, pricing shape)

## Deployment Presets

| Preset       | File                     | Queue        | Storage          | Render       |
| ------------ | ------------------------ | ------------ | ---------------- | ------------ |
| VPS Full     | `env.vps.example`        | BullMQ+Redis | MinIO            | Local worker |
| VPS + Lambda | `env.vps-lambda.example` | BullMQ+Redis | R2/S3            | AWS Lambda   |
| Cloud        | `env.cloud.example`      | Inngest      | Supabase Storage | AWS Lambda   |

Auto-detected: `NEXT_PUBLIC_SUPABASE_URL` + `INNGEST_EVENT_KEY` set = cloud mode, otherwise VPS mode.

## Templates

Templates define deterministic shot patterns (no LLM needed).

| Template               | Layout        | Description                                |
| ---------------------- | ------------- | ------------------------------------------ |
| `anchor-bottom-simple` | anchor-bottom | Presenter bottom, alternating content/head |
| `fullscreen-broll`     | fullscreen    | Full-screen B-roll with varied transitions |
| Premium templates      | various       | Registered by private modules              |

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

## Master Plan (MANDATORY)

**ZAWSZE trzymaj sie planu w `priv/REELSTACK_MASTER_PLAN.md`.**

- Przed rozpoczeciem pracy przeczytaj master plan i znajdz odpowiednia faze/task
- Nie wymyslaj wlasnej kolejnosci - realizuj taski w kolejnosci z planu
- Po zakonczeniu taska zaktualizuj jego status w planie (TODO -> DONE/PARTIAL + notatki)
- Jesli trzeba zmienic plan - zaktualizuj plan ZANIM zaczniesz implementacje
- Plan jest single source of truth dla tego co robimy i w jakiej kolejnosci

## Implementation Rules (MANDATORY)

**After EVERY implementation step**, before moving to the next task:

1. **New field added to any type/interface?** -> Check: `reel-schemas.ts` (Zod), `reel-pipeline-worker.ts` (passthrough), `types.ts` (interface), tests
2. **New file created?** -> Exported from package `index.ts`? Grep for existing similar patterns first.
3. **Copy-pasted code?** -> 2nd occurrence = extract to shared module NOW.
4. **New function/type?** -> Exported from package index?
5. **Post-step scan**: unused imports, missing `resolveMediaUrl()`, inconsistent defaults

**After completing a phase:**

- Cross-step review: diff new files for duplicated patterns
- Wiring trace: API schema -> worker -> orchestrator -> types -> tests

Tests passing is NOT a completion signal. The checklist above IS.

## Key Architectural Decisions

- **Two montage paths**: Template (deterministic, zero LLM) and LLM Director (AI-driven). Both output ProductionPlan.
- **ContentPackage**: Universal bridge between content production and montage. Any producer, any montage.
- **Template extensibility**: `registerTemplate()` to add new templates. Zero code changes. See `docs/TEMPLATE_MONTAGE.md`.
- **Remotion composition**: single-overlay model, held cross-transitions. See `packages/remotion/COMPOSITION.md`.
- **ProviderTool pattern**: Generic base class for REST API providers. Adding a model = 1 config object. Self-declared pricing. No discovery.ts or pricing.ts changes.
- **Tool discovery is env-driven**: no code changes to add/remove tools, just set/unset env vars.
- **Prompt system**: All LLM prompts in editable markdown. Mustache renderer with partials. No TypeScript changes to edit prompts.
- **LLM planner uses structured output**: Claude returns raw JSON ProductionPlan, no markdown parsing.
- **Asset gen + TTS run in parallel** to minimize latency.
- **Module system**: Pluggable modules for specialized reel types. Modules register via `registerModule()`.
- **Bun monorepo**: use `bun` everywhere, not `npm`/`npx`. Exception: `bunx` for remotion CLI.

## Documentation Index

| File                               | What                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `AGENTS.md`                        | This file -- overview, API, setup, rules                    |
| `PRODUCTION-GUIDE.md`              | Condensed production reference (tools, CLI, env vars)       |
| `docs/TEMPLATE_MONTAGE.md`         | Template montage system, ContentPackage, registerTemplate() |
| `docs/ARCHITECTURE.md`             | System architecture, DB schema, auth, adapters              |
| `docs/REEL_PIPELINE.md`            | Pipeline flow diagram                                       |
| `docs/DEPLOYMENT_VPS.md`           | VPS deployment (Docker Compose)                             |
| `docs/DEPLOYMENT_CLOUD.md`         | Cloud deployment (Vercel + Supabase)                        |
| `docs/MULTI_WORKER.md`             | Scaling workers                                             |
| `docs/CONTRIBUTING.md`             | Dev setup, code style, PR process                           |
| `packages/agent/README.md`         | Agent API: produce(), tools, effects                        |
| `packages/remotion/COMPOSITION.md` | Remotion layers, overlays, transitions                      |
| `priv/REELSTACK_MASTER_PLAN.md`    | Master plan (private, gitignored)                           |
