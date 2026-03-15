# AGENTS.md - ReelStack

AI video production platform. Generates short-form reels from text or content: TTS voiceover, Whisper captions, AI-generated visuals, deterministic or AI-directed montage, Remotion render.

Extensible via pluggable modules for specialized reel types (talking objects, workflow explainers, presenter reels, and more).

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
    registry/                          Tool discovery + registry
    tools/                             18 tool adapters (Veo3, Kling, Pexels, HeyGen, etc.)
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

Deterministic montage: zero LLM, config-driven. Register a template with `registerTemplate()`, build a plan with `buildTemplatePlan(content, templateId)`. 5 built-in templates, easily extensible.

**Full docs:** `docs/TEMPLATE_MONTAGE.md`
**File:** `packages/agent/src/content/template-montage.ts`

### ProductionPlan

Output of both montage paths. Contains: shots (with layout, timing, transitions), effects, zoom segments, PiP segments, caption style, CTA, lower thirds, counters, highlights.

**File:** `packages/agent/src/types.ts`

### Modules

ReelStack supports pluggable modules for specialized reel types. Each module registers via `registerModule()` and can define its own content production pipeline, Remotion compositions, and schemas. The worker auto-routes to the correct module based on the `mode` field in the API request.

Core provides the infrastructure (TTS, Whisper, rendering, storage, tools). Modules add domain-specific logic.

**Interface:** `packages/agent/src/modules/module-interface.ts`

## API Endpoints

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

## Pipeline Modes

The worker (`reel-pipeline-worker.ts`) routes by `config.mode`:

| Mode         | Function               | What happens                                                                   |
| ------------ | ---------------------- | ------------------------------------------------------------------------------ |
| `generate`   | `produce()`            | Tool discovery -> LLM plan -> asset gen + TTS (parallel) -> assemble -> render |
| `compose`    | `produceComposition()` | TTS -> LLM composition plan -> assemble -> render                              |
| `captions`   | `produceComposition()` | Existing video + captions only                                                 |
| Module modes | Module pipeline        | Module-specific content production + montage                                   |

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

```bash
# Required
ANTHROPIC_API_KEY=          # Claude API (LLM planner)
DATABASE_URL=               # PostgreSQL
REDIS_URL=                  # BullMQ

# Optional - enable additional tools (auto-discovered)
PEXELS_API_KEY=             # Stock video/images
HEYGEN_API_KEY=             # Avatar video (talking head)
VEO3_API_KEY=               # Google Veo 3 AI video
VEO3_PROJECT_ID=            # Google Cloud project ID
VERTEX_PROJECT_ID=          # Vertex AI (Veo 3.1)
KLING_API_KEY=              # Kling AI video
SEEDANCE_API_KEY=           # Seedance (ByteDance) AI video
NANOBANANA_API_KEY=         # NanoBanana image (or use GEMINI_API_KEY)
GEMINI_API_KEY=             # Google Gemini (NanoBanana fallback)
ELEVENLABS_API_KEY=         # ElevenLabs TTS
OPENAI_API_KEY=             # OpenAI TTS / Whisper
RUNPOD_API_KEY=             # RunPod (HuMo avatar-video)
HUMO_RUNPOD_ENDPOINT_ID=    # RunPod serverless endpoint ID
FAL_KEY=                    # fal.ai tools (Kling, Seedance on fal)
```

Tools are auto-discovered: if the env var is set and `healthCheck()` passes, the tool is available to the LLM planner.

## Deployment Presets

| Preset       | File                     | Queue        | Storage          | Render       |
| ------------ | ------------------------ | ------------ | ---------------- | ------------ |
| VPS Full     | `env.vps.example`        | BullMQ+Redis | MinIO            | Local worker |
| VPS + Lambda | `env.vps-lambda.example` | BullMQ+Redis | R2/S3            | AWS Lambda   |
| Cloud        | `env.cloud.example`      | Inngest      | Supabase Storage | AWS Lambda   |

Auto-detected: `NEXT_PUBLIC_SUPABASE_URL` + `INNGEST_EVENT_KEY` set = cloud mode, otherwise VPS mode.

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
- **Tool discovery is env-driven**: no code changes to add/remove tools, just set/unset env vars.
- **LLM planner uses structured output**: Claude returns raw JSON ProductionPlan, no markdown parsing.
- **Asset gen + TTS run in parallel** to minimize latency.
- **Module system**: Pluggable modules for specialized reel types. Modules register via `registerModule()`.
- **Bun monorepo**: use `bun` everywhere, not `npm`/`npx`. Exception: `bunx` for remotion CLI.

## Adding a New Tool

See `packages/agent/README.md` for the full guide.

1. Create `packages/agent/src/tools/mytool-tool.ts` implementing `ProductionTool`
2. Add env var check + instantiation in `packages/agent/src/registry/discovery.ts`
3. Write `promptGuidelines` based on the tool's prompting documentation

Reference implementations: `wavespeed-tool.ts` (simplest), `heygen-tool.ts` (avatar + script), `humo-tool.ts` (self-hosted RunPod).

## Documentation Index

| File                               | What                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `AGENTS.md`                        | This file -- overview, API, setup, rules                    |
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
