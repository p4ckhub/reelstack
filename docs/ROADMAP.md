# Roadmap

ReelStack roadmap: reel pipeline, AI director, provider ecosystem, and
monetization. Rewritten from scratch 2026-04-22 to reflect ~100 merged
commits since the last accurate update.

## Status Legend

| Symbol   | Meaning                                |
| -------- | -------------------------------------- |
| done     | Implemented, tested, merged            |
| partial  | Core shipped; secondary items pending  |
| planned  | Not started                            |
| deferred | Intentionally not on the critical path |

Checklists inside a phase use `[x]` / `[ ]`. A phase is only `done` when
every checklist item is `[x]`.

---

## Faza 0: Foundation (Subtitle Burner) — done

Original subtitle-burning app that seeded the codebase: visual timeline
editor, 8 subtitle templates, client + server rendering, Whisper,
SRT/.sbp import-export, REST API v1 (21 endpoints), API keys,
dual-deploy (VPS + Cloud), Auth.js, 414 tests.

## Faza 1: Real Video via Remotion — done

Replaced FFmpeg overlay with `@reelstack/remotion`. Layouts
(fullscreen / split / PiP), style presets, word-timed overlays, Ken
Burns b-roll, progress bar, music bed, Remotion Dev Studio.

## Faza 2: TTS + Whisper — done

`@reelstack/tts` (ElevenLabs) + `@reelstack/transcription` (Whisper).
Pipeline: script → TTS → Whisper word-level cues. Audio caching.

## Faza 3: AI Director (v1) — done

First creative layer: `ai-director.ts` + Pexels b-roll. Script →
voiceover → alignment → b-roll → render with progress callbacks. This
v1 is the foundation; the multi-model / multi-step director in Faza 11
replaces it for short-film mode.

## Faza 4: API + Monetization + Publishing — done

- REST: `POST /api/v1/reel`, `GET /api/v1/reel/[id]`, publish endpoint
- Tier system (FREE / PRO / ENTERPRISE) + token balance
- Sellf webhook (`POST /api/webhooks/sellf`) with HMAC-SHA256 and
  product → action mapping
- `@reelstack/publisher` via Postiz, multi-platform, schedule/hashtags
- 475 tests after this phase

## Faza 5: Docker + Deploy — done

- Renderer abstraction: `LocalRenderer`, `LambdaRenderer`,
  `createRenderer()` factory
- BullMQ workers: `reel-render` (concurrency 1), `reel-publish` (5)
- `docker/Dockerfile.reel-worker` with pre-bundled Remotion webpack
- `scripts/setup-vps.sh --with-reel`
- Memory limits, graceful shutdown
- 537 tests after this phase

## Faza 6: Web UI — partial

**Shipped:**

- [x] Dashboard + reel wizard (mode-aware inputs: script / topic /
      videoUrl / workflowUrl)
- [x] Caption-preset picker + custom color editor
- [x] Real-time job progress (polling with case-normalized status)
- [x] Token balance + monthly usage display, dev login bypass
- [x] Module catalog dropdown (7 modes including private ones)
- [x] Image model + video model override selects
- [x] TTS provider + voice picker (curated Gemini voice list)

**Still open:**

- [ ] B-roll preview + manual override before render
- [ ] Template gallery (browse + clone existing reels)
- [ ] In-browser editor for cue text + timing tweaks post-render

## Faza 7: Hardening & Observability — done

### P0

- [x] Structured logging via Pino (`@reelstack/logger`)
- [x] Sentry exception capture with jobId / step / userId tags
- [x] `/api/health` checks DB, Redis, MinIO
- [x] `scripts/cleanup-storage.ts` (lifecycle + dry-run)
- [x] `scripts/backup-db.sh` (pg_dump, 30-day retention)

### P1

- [x] `AppError` hierarchy (StorageError, QueueError, RenderError,
      TTSError, ...)
- [x] Error mapping middleware in `withAuth`
- [x] +93 tests (template engine, storage, queue, publisher)
- [x] `/api/metrics` (Prometheus: HTTP, render step duration, queue depth)
- [x] Redis-backed rate limiter with in-memory fallback

### P2

- [x] Multi-worker docs + `docker-compose --scale`
- [x] Lambda renderer (activated via `REMOTION_RENDERER=lambda`)
- [x] Read replica (`DATABASE_READ_URL`, `prismaRead` for analytics)
- [x] `JobStatus` state machine (QUEUED → PROCESSING → {COMPLETED|FAILED})
- [x] `AuditLog` model + logging on API key ops, tier upgrades

### Security

- [x] 61 fixes across 2 audit rounds (memory/reelstack-audit.md)
- [x] AbortSignal.timeout on every external fetch
- [x] execSync → execFileSync, atomic DB ops, path-traversal guards
- [x] TruffleHog pre-commit + CI
- [x] Docker: image pins, Redis password, resource limits, security headers

## Faza 8: Quick Wins — done

- [x] Webhook callbacks (`callbackUrl`, HMAC-SHA256, SSRF guarded,
      fire-and-forget with 10s timeout, `callbackSent` flag)
- [x] Batch API: `POST /api/v1/reel/batch` (up to 20 reels, per-reel
      credit, shared callbackUrl, `parentJobId`)
- [x] Multi-language reels: `POST /api/v1/reel/multi-lang` (10 langs,
      Claude Haiku / GPT-4o-mini translation, 30 locales supported)
- [x] 204 cumulative tests after this phase

## Faza 9: Modular Architecture + Layouts — done

- [x] `registerModule()` plug-in system (orchestrator + Remotion composition)
- [x] Public modules: slideshow, captions (transcribe / script / cues)
- [x] Private modules: n8n-explainer, talking-object, presenter-explainer,
      ai-tips, zoom-reframe (gitignored overlay under `packages/modules/src/private/`)
- [x] 5 layouts: fullscreen, split-screen, anchor-bottom, hybrid-anchor,
      comparison-split
- [x] 3 montage profiles: cyber-retro, clean-corporate, ai-tool-showcase
- [x] Per-profile supervisor rejection rules
- [x] Freemium caption modes (public: text; premium: pill / hormozi / glow)
- [x] `VideoClip` multi-clip composition, `MultiPanelMontage` component

## Faza 10: Effects & Polish — done

- [x] Vignette, chromatic aberration (global VFX)
- [x] Circular PiP with neon glow (face bubble)
- [x] Neon glow text, highlight marker
- [x] 3D tilt parallax screenshots, icon pop-in, progress ring
- [x] Screen-to-face morph + varied section transitions
- [x] End-card overlay (CTA, spring reveal, glow-pulse action)
- [x] Scroll-stopper intro (7 presets, default `zoom-bounce @ 0.6s`)
- [x] Card + pack library primitives (`packages/modules/src/cards`)
- [x] Transitions infrastructure (`packages/modules/src/transitions`,
      Remotion type re-exports)
- [x] Wow-factor Remotion packages: motion-blur, noise, light-leaks,
      lottie, animated-emoji, three + @react-three/fiber

## Faza 11: AI Director — Short-Film Mode — planned

**Started 2026-04-22, build in public.**

Goal: a `short-film` mode where the LLM acts as director for a 30–60s
film. Instead of a flat b-roll list, it produces a stable character
sheet + world + scene list; the pipeline chains scene N's last frame
into scene N+1's `imageUrl` for visual continuity. First flagship
feature no direct competitor ships. Paid module, credits scale with
scene count.

### MVP

- [ ] `short-film-director.md` prompt template (characterSheet,
      worldSheet, sceneList: opening / rising / climax / resolution)
- [ ] New orchestrator mode `short-film` in `generate-pipeline.ts`
- [ ] Force i2v tools: prefer kling-o3-std-fal, fallback
      seedance-img2video / veo31
- [ ] Chain: scene N last frame (`extractAndUploadLastFrame`) →
      scene N+1 `imageUrl`
- [ ] CharacterSheet re-injected into every scene prompt (models drift
      after ~3 scenes without it)
- [ ] API schema: `mode: "short-film"`, `topic`, optional
      `characterDescription`, `worldDescription`, `numberOfScenes` (3–10)
- [ ] Dashboard wizard: new mode option + scene-count slider
- [ ] Module row: `slug=short-film`, creditCost = 10 × sceneCount

### Quality loop

- [ ] Character-drift detection (cosine distance on first-frame
      embeddings, >0.4 triggers re-roll)
- [ ] Supervisor rubric extension: narrative arc + scene pacing +
      visual continuity
- [ ] I2V failure fallback: regenerate with tighter character
      description, max 2 retries

### Stretch

- [ ] LoRA / IP-Adapter for real identity lock
      (`fal-ai/flux-lora-portrait-trainer`)
- [ ] Dialog support, voice matched to characterSheet gender/age,
      Gemini TTS `voicePrompt` per scene
- [ ] Shot composition grammar (wide / medium / close-up rotation)
- [ ] Weekly build-in-public drops on Twitter/BlueSky with generated
      films + cost breakdown

## Faza 12: Module Marketplace + Access Control — done

Converted ad-hoc `isOwner` flag into a real module marketplace backed
by DB rows so third-party packs can be gated by tier + purchase.

- [x] `Module` table (slug, name, creditCost, requiredTier, active)
- [x] `UserModuleAccess` join table for per-user purchases
- [x] `Tier.OWNER` replaces `User.isOwner` (OWNER_EMAILS env seed)
- [x] Private modules cloned into Docker build context via
      `MODULES_DEPLOY_KEY` in CI
- [x] Auto-seed modules on boot, per-module `creditCost`, UI catalog in wizard
- [x] `GET /api/v1/modules` endpoint drives the wizard dropdown
- [x] Pricing registry self-declared on tools / modules with fallback
      to static table

## Faza 13: Provider Plugin System — done

Unified catalog-driven tool registration so adding a model is one entry.

- [x] `ProductionTool` contract + `ToolRegistry`
- [x] Auto-discovery by env vars in `registry/discovery.ts`
- [x] fal.ai catalog (17 models: Kling v3/o3, Seedance, Hailuo, WAN,
      Pika 2.2, LTX 2.3, Luma, FLUX schnell/pro/dev, Imagen 4,
      NanoBanana 2/Pro, Ideogram v3, Recraft, SD 3.5, Seedream 4.5, + OpenAI gpt-image-1/2 proxy)
- [x] PiAPI + Replicate + Kie + WaveSpeed + AIML catalogs
- [x] HeyGen (Studio, V3, Agent), Veo 3.1 via Vertex, MiniMax direct,
      Runway Gen-4, HuMo via RunPod
- [x] OpenAI direct: gpt-image-1 (stable) + gpt-image-2 (early access,
      registered alongside as drop-in fallback)
- [x] Gemini Flash TTS via Generative Language API (AI Studio key, no
      Cloud TTS enablement required)
- [x] External module tools via `registerExternalTool()`

**Live tool count: 24 models discoverable when all keys set.**

## Faza 14: AI Quality (script-doctor + supervisor rubric) — done

- [x] `script-writer` prompt (script doctor): 4 failure modes, PL
      GOOD/BAD examples, `{assessment, rewritten, script, changeNotes}`
      response
- [x] `script-rewrite` pipeline step between script-review and tts,
      threaded into tts / plan / supervisor / whisper-timing
- [x] Supervisor rubric rewritten: 20 YES/NO sub-checks (5 pts each
      across 4 pillars), `max_tokens: 6000`
- [x] Hook rules partial expanded 7 → 52 lines with 4 patterns
- [x] Retention rules partial expanded 7 → 58 lines with pacing buckets
- [x] Prompt-writer upgraded with cinematography vocabulary (78 lines)
- [x] Planner adds mandatory self-critique before output
- [x] Template loader registers all prompts (script-writer bug fixed)

## Faza 15: Watermark System — done

Per-render watermark decision so purchased tokens never carry the
brand stamp, but FREE-tier reels do.

- [x] `reelstack.dev` watermark rotates across safe edges
- [x] Per-render decision (not user-level) — token-respecting
- [x] Flag-gated (off by default)
- [x] Auto-wrap via HOC in `Root.tsx`, DRY helper `shouldShowWatermark`
- [x] Enforcement test + mock for `database-mock` test helper

## Faza 16: Local Dev Stack + Private-module Build — done

- [x] `docker-compose.dev.yml` one-command stack (web + worker +
      postgres + redis + minio + n8n)
- [x] Named volumes for `node_modules` across services
- [x] Sibling n8n service (no DinD)
- [x] Auto-seed modules + dev API key (`rs_test_devSeedKey...`) on boot
- [x] Bun linker workarounds for monorepo Prisma darwin-binary bug
- [x] CI clones private `reelstack-modules` via deploy key into Docker
      build context
- [x] Test infra: vitest 3.x hoisting fix across 18 test files, remotion
      mock adds delayRender/continueRender (125 tests green)
- [x] Dashboard status-case fix, mode-aware wizard inputs

## Faza 17: Landing + Build-in-Public Funnel — planned

**Rationale:** Faza 11 ships as build-in-public. A waitlist + social
loop is the funnel. No marketing spend, only organic.

- [ ] Landing page: above-the-fold demo reel + one-line positioning
- [ ] Waitlist form (Sellf form + Listmonk list or Resend)
- [ ] "Watch a film generated in 2 min" interactive demo
- [ ] Day-0 launch post (Twitter/BlueSky/LinkedIn) scheduled for Faza 11 MVP
- [ ] Weekly cost+film breakdown posts during MVP iteration
- [ ] Affiliate link tracking (30% lifetime, per Submagic playbook)

## Faza 18: Payment → Credits Flow — planned

**Rationale:** Sellf webhook exists (Faza 4), but credit top-up product
mapping needs verification. Without this, paid conversion is blocked.

- [ ] Audit existing `POST /api/webhooks/sellf` product → action map
- [ ] Credit top-up products in Sellf (100/500/2000 credit packs)
- [ ] Per-product env var mapping (`SELLF_PRODUCT_100_CREDITS=prod_xyz`)
- [ ] Email receipt + in-app credit balance update (already exists,
      verify path)
- [ ] Owner dashboard: AuditLog view for recent credit additions

## Future Ideas (unplanned)

- Custom font uploads
- GPU-accelerated server rendering
- Plugin system for custom caption animation styles
- WebVTT / TTML import-export
- In-browser editor for cue text + timing tweaks
- Dedicated `@reelstack/vertex-tts` provider (OAuth path)
- Character LoRA self-service trainer (UI wrapper around fal)
- Storyboard preview before render (first-frame grid per scene)

---

## Current Stats (2026-04-22)

| Metric                | Value                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tests (total)         | ~1930 (1666 bun-test + 266 vitest)                                                                                             |
| Packages              | 14 (agent, core, database, ffmpeg, image-gen, logger, modules, publisher, queue, remotion, storage, transcription, tts, types) |
| Reel layouts          | 5 (fullscreen, split-screen, anchor-bottom, hybrid-anchor, comparison-split)                                                   |
| Montage profiles      | 3 (cyber-retro, clean-corporate, ai-tool-showcase)                                                                               |
| Modules               | 7+ (public: slideshow, captions · private: n8n-explainer, talking-object, presenter-explainer, ai-tips, zoom-reframe)          |
| AI tools discoverable | 24 (with all provider keys set)                                                                                                |
| Docker images         | 3 (web, worker, reel-worker)                                                                                                   |

## Priority Queue (next 4 weeks)

Ranked by business leverage given build-in-public commitment and $1M
ARR vision in `vault/_shared/reference/reelstack-growth-playbook.md`.

1. **Faza 11 MVP — AI Director** (3–4 h for first end-to-end cut,
   iterative from there). Flagship, competitive moat, already committed.
2. **Faza 17 — Landing + waitlist + Day-0 post**. Funnel for Faza 11.
   Day 0 post scheduled 2026-04-21 per growth playbook.
3. **Faza 18 — Payment → credits audit**. Block-remover for paid
   conversion. Probably already half-built; 1–2 h to verify + patch.
4. **Smoke-test gpt-image-2 live** (15 min). Confirms early-access path
   works on our OpenAI key before demoing to waitlist.
5. **Dialog support in Faza 11 stretch** only after MVP has users
   reporting voice/film mismatch. Don't pre-build.
