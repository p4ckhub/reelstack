# Roadmap

ReelStack roadmap: reel pipeline, image generation, and publishing automation.

## Status Legend

| Symbol  | Meaning                     |
| ------- | --------------------------- |
| done    | Implemented, tested, merged |
| skipped | Deferred or deprioritized   |
| planned | Not started                 |

---

## Faza 0: Foundation (Subtitle Burner)

**Status: done**

Original subtitle burning application with full editor, API, and deployment.

- Visual timeline editor with drag and resize
- 8 built-in subtitle templates, 6 caption animation styles
- Client-side rendering (FFmpeg.wasm) + server-side rendering (BullMQ worker)
- Auto-transcription with in-browser Whisper
- SRT import/export, project file format (.sbp)
- Public REST API v1 (21 endpoints)
- Undo/redo action system, API key management
- Dual deployment: VPS (Docker + BullMQ + MinIO) / Cloud (Vercel + Inngest + Supabase)
- Auth (email/password + magic links via Auth.js)
- 414 tests across 7 packages

## Faza 1: Real Video via Remotion

**Status: done**

Replaced FFmpeg subtitle overlay with Remotion (React-based video rendering via headless Chrome).

- `packages/remotion` - Remotion composition with React components
- Layout system: fullscreen, split-screen, picture-in-picture
- Style presets: cinematic, energetic, minimal, educational
- Animated text overlays with word-level timing
- B-roll segments with Ken Burns effect
- Progress bar, background music support
- Remotion Dev Studio integration (`bun dev:remotion`)

## Faza 2: TTS + Whisper

**Status: done**

Text-to-speech voiceover and Whisper word-level alignment.

- `packages/tts` - ElevenLabs TTS integration (generate speech from script)
- `packages/transcription` - Whisper word-level timestamps for TTS audio
- Pipeline: script -> TTS audio -> Whisper alignment -> word-timed cues
- Voice selection, stability/similarity boost params
- Audio caching for re-renders

## Faza 3: AI Director

**Status: done**

AI-powered creative decisions for automated reel production.

- `packages/remotion/src/pipeline/` - full reel creation pipeline
- `reel-creator.ts` - orchestrator: script -> voiceover -> alignment -> B-roll -> render
- `ai-director.ts` - Claude AI selects B-roll timing, music, visual style
- `broll-source.ts` - Pexels API integration for stock footage
- Step-by-step pipeline with progress callbacks
- Configurable: skip AI, manual B-roll, custom music

## Faza 4: API + Monetization + Publishing

**Status: done**

REST API for reel creation, Sellf payment webhook, Postiz publishing.

### API Endpoints

- `POST /api/v1/reel` - create reel job (script + config)
- `GET /api/v1/reel/[id]` - job status + progress
- `POST /api/v1/reel/[id]/publish` - publish to social media via Postiz

### Monetization

- Tier system (FREE / PRO / ENTERPRISE) with token-based usage
- Sellf webhook (`POST /api/webhooks/sellf`) - universal format:
  - Direct: `{email, product, reference}`
  - Sellf: `{event: "purchase.completed", data: {customer, product, order}}`
  - HMAC-SHA256 signature verification
  - Product-to-action mapping via env vars (tier upgrades, token packs)

### Publishing

- `packages/publisher` - Postiz API integration
- Multi-platform publish (TikTok, Instagram, YouTube, etc.)
- Schedule support, hashtags, captions

### Tests

- 475 tests after this phase

## Faza 5: Docker + Deploy

**Status: done**

Containerization, renderer abstraction, reel worker.

### Renderer Abstraction

- `packages/remotion/src/render/` - pluggable renderer interface
- `LocalRenderer` - programmatic `@remotion/renderer` with pre-bundle support (`REMOTION_BUNDLE_PATH`)
- `LambdaRenderer` - AWS Lambda via `@remotion/lambda` (opt-in via `REMOTION_RENDERER=lambda`)
- Factory: `createRenderer()` based on `REMOTION_RENDERER` env
- Replaced `execSync('bunx remotion render ...')` with programmatic API

### Reel Worker

- `apps/web/worker/reel-worker.ts` - BullMQ worker entry point
- `reel-render` queue (concurrency 1 - Chromium heavy)
- `reel-publish` queue (concurrency 5 - HTTP calls)
- Graceful shutdown (SIGTERM/SIGINT)

### Docker

- `docker/Dockerfile.reel-worker` - node:22-slim + Bun + Chromium + FFmpeg + fonts
- Pre-bundled Remotion webpack at build time (no 10-30s bundling per render)
- Docker Compose profiles: `--profile reel` for optional reel-worker
- Fixed existing Dockerfiles (added remotion, tts, publisher package.json copies)
- CI: GitHub Actions builds 3 images (web, worker, reel-worker)

### Deployment

- `scripts/setup-vps.sh` - `--with-reel` flag for reel worker
- `.env.example` - all new env vars documented
- Memory limits: 4G limit / 2G reservation for reel-worker

### Tests

- 537 tests across 8 packages after this phase

## Faza 6: Web UI - Reel Editor

**Status: skipped (deferred)**

Web interface for reel creation. Not blocking - everything works via API/CLI.

Planned scope (when needed):

- Reel creation wizard (script input, config, preview)
- Real-time job progress tracking
- B-roll preview and manual override
- Publish flow with platform selection
- Token balance display and purchase flow
- Template gallery for reel styles

## Faza 7: Hardening & Observability

**Status: planned**

From architecture audit (2026-03-06). Priority order.

### P0 - Before scaling (immediate)

- [x] Structured logging: Pino via `@reelstack/logger` (all production server code, JSON in prod, pretty in dev)
- [x] Error tracking: Sentry integration (capture exceptions with jobId, step, userId tags)
- [x] Health check expansion: `/api/health` verifies DB, Redis, MinIO connectivity
- [x] Storage lifecycle: `scripts/cleanup-storage.ts` (--days 30, --dry-run)
- [x] Automated DB backups: `scripts/backup-db.sh` (pg_dump + gzip, 30-day retention)

### P1 - Month 1

- [x] Custom error classes: `AppError` hierarchy (StorageError, QueueError, RenderError, TTSError, etc.)
- [x] Error mapping middleware: AppError → structured HTTP error codes in withAuth()
- [x] Test coverage: +93 tests (template engine, storage adapters, queue, publisher)
- [x] Monitoring: Prometheus metrics endpoint `/api/metrics` (HTTP requests, render duration per step, queue depth)
- [x] Redis-backed rate limiter (ioredis with memory fallback)

### P2 - Month 3+ (at scale)

- [x] Multi-worker deployment: docs/MULTI_WORKER.md + docker-compose --scale support
- [x] Lambda renderer: already implemented, activate via `REMOTION_RENDERER=lambda`
- [x] Read replica: `prismaRead` client (DATABASE_READ_URL), analytics/listing queries routed through it
- [x] State machine validation: enforce valid JobStatus transitions (QUEUED→PROCESSING→COMPLETED/FAILED)
- [x] Audit log: AuditLog model + logging on API key ops, tier upgrades, token additions

### Security audit fixes applied (2026-03-06)

61 fixes across 2 audit rounds:

- All external fetch() calls have AbortSignal.timeout()
- execSync → execFileSync with array args (no shell injection)
- Atomic DB operations (token balance, preferences merge)
- Storage path traversal validation
- TruffleHog secret scanning (pre-commit + CI)
- API key routes wrapped with withAuth + rate limiting
- Worker: lockDuration, retry/backoff, graceful shutdown
- Docker: image versioning, Redis password, resource limits, security headers
- Full report: see memory/reelstack-audit.md

## Faza 8: Quick Wins

**Status: done**

High-impact features with minimal implementation effort.

### Webhook Callbacks

- `callbackUrl` field on reel jobs - POST result when job completes/fails
- HMAC-SHA256 signed payloads (`X-ReelStack-Signature` header)
- SSRF protection: blocks private IPs, localhost, non-HTTPS in production
- `callbackSent` flag prevents duplicate deliveries
- Fire-and-forget with 10s timeout

### Batch Reel API

- `POST /api/v1/reel/batch` - up to 20 reels per request
- Per-reel credit consumption (partial success supported)
- Shared or per-reel `callbackUrl`
- `parentJobId` links batch jobs together

### Multi-Language Reels

- `POST /api/v1/reel/multi-lang` - same script in up to 10 languages
- Auto-translation via Claude (Haiku) or GPT-4o-mini
- Per-language TTS with correct BCP-47 locale mapping
- 30 supported languages
- Each language = separate reel job with own credit

### Tests

- 204 tests after this phase (+20 new: SSRF validation, batch schema, multi-lang schema)

## Faza 9: Modular Architecture + Layouts

**Status: done**

- Pluggable module system: `registerModule()` with orchestrator + Remotion composition
- Public modules: slideshow, captions (3 modes: transcribe/script/cues)
- Private module overlay: gitignored `packages/modules/src/private/`, loaded via synchronous require()
- Private modules: n8n-explainer, talking-object, presenter-explainer
- 5 reel layouts: fullscreen, split-screen, anchor-bottom, hybrid-anchor (4 shot types), comparison-split
- Montage profiles: cyber-retro, clean-corporate, ai-tool-showcase with rich directorRules
- Per-profile supervisor rejection rules
- Freemium model: public text captions, premium pill/hormozi/glow modes
- New tools: Veo 3.1 (Vertex AI, native audio), NanoBanana 2, Kie Seedance img2video, PiAPI Kling img2video
- ImageGenerator adapter for image-to-video pipelines
- VideoClip composition for multi-clip stitching
- MultiPanelMontage component (animated 2-4 panel montage with spring entrance)
- 50+ new tests across all areas

## Faza 10: Effects & Polish

**Status: in progress**

New visual effects from competitive analysis:

- Vignette overlay, chromatic aberration (global VFX)
- Circular PiP with neon glow (face bubble)
- Neon glow text, highlight marker
- 3D tilt parallax screenshots
- Icon pop-in with spring bounce
- Progress ring (animated SVG)
- Screen-to-face morph transition
- Enhanced supervisor: virality scoring, retention patterns, hook rules

## Future Ideas (unplanned)

- Custom font uploads
- GPU-accelerated server rendering
- Plugin system for custom animation styles
- WebVTT and TTML import/export

---

## Current Stats

| Metric           | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Tests            | 300+                                                                         |
| Packages         | 13 (added: agent, modules, image-gen)                                        |
| Reel layouts     | 5 (fullscreen, split-screen, anchor-bottom, hybrid-anchor, comparison-split) |
| Montage profiles | 3 (cyber-retro, clean-corporate, ai-tool-showcase)                             |
| Modules          | 5 (slideshow, captions, n8n-explainer, talking-object, presenter-explainer)  |
| Effects          | 15+                                                                          |
| Docker images    | 3                                                                            |
