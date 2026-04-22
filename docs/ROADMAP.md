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

**Depends on:** Faza 19 A + B (renderer abstraction + Hyperframes harness).
Faza 11 ships as the first **native Hyperframes module** — zero Remotion
code in the short-film path. This is why Faza 19 A/B is the first thing
shipped even though its number is higher.

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

## Faza 18: Payment → Credits Flow — partial

**Audited 2026-04-22** — most of the flow is already shipped from
Faza 4. Remaining items are UI surface, not pipeline wiring.

**Already shipped (audit findings):**

- [x] `POST /api/webhooks/sellf` product → action map implemented
      (`apps/web/src/app/api/webhooks/sellf/route.ts`)
- [x] Per-product env var mapping: `SELLF_PRODUCT_{SOLO,PRO,AGENCY}`
      for tier upgrades, `SELLF_PRODUCT_{10,50,150,500}_TOKENS` for
      credit packs
- [x] HMAC-SHA256 signature verification
- [x] `addTokens()` call with reason `'purchase'` + reference ID
- [x] `createAuditLog()` on both token-add and tier-upgrade paths
- [x] In-app credit balance reads live DB (not cached) so balance
      updates reflect instantly after webhook fires

**Still open:**

- [ ] Verify Sellf product slugs in the running env (pull actual IDs
      from Sellf admin, stash in Vaultwarden under "Sellf credit
      products")
- [ ] Owner dashboard: AuditLog view for recent credit additions +
      revenue attribution (per-product breakdown)
- [ ] Email receipt path — verify Sellf itself sends it, or wire
      Listmonk fallback
- [ ] End-to-end smoke test with a real Sellf test-mode purchase

## Faza 19: Renderer Abstraction + Hyperframes Migration — planned

**Strategic rationale:** Remotion is source-available, requires a paid
commercial license above small-team thresholds, and that conflicts with
the TSA brand promise of truly self-hosted tooling. [Hyperframes](https://github.com/heygen-com/hyperframes)
(HeyGen, released 2026-03-10) ships Apache 2.0 (OSI-approved), is HTML +
CSS + GSAP natively (LLMs produce better video compositions in HTML than
in React/TSX per HeyGen's own evals), and has seekable library-clock
animations (GSAP frame-accurate — Remotion plays at wall-clock during
render). Migration unlocks: clean open-source core, plugin marketplace
go-to-market (Faza 20), and removes the license tax on future SaaS scale.

**Architecture principle:** two runtimes ship in parallel for months.
Each module declares its own runtime (`runtime: 'remotion' | 'hyperframes'`).
No IR/DSL translation layer — that would be over-engineering. Renderer
dispatcher routes by runtime at queue-dispatch time. Strangler-fig
migration, module by module, no big-bang.

**Gap today:** Hyperframes is single-machine render only; we use
`@remotion/lambda` in prod (`remotionlambda-eucentral1-m2tmqxyo5p`).
Solved in Faza 19.E.3 with Cloud Run elastic render (not per-render
sharding — that can wait for HeyGen's distributed roadmap or our own fork).

### Phase A: Renderer dispatcher + Hyperframes stub — **done (2026-04-22)**

- [x] New package `packages/renderer/` with `interface.ts`, `dispatcher.ts`, `remotion-adapter.ts`, `hyperframes-renderer.ts`, `index.ts` + 8 tests
- [x] `RemotionRendererAdapter` delegates to existing `@reelstack/remotion/render` `createRenderer()` (no move, no duplication — adapter pattern)
- [x] `HyperframesRenderer` stub throws `NotImplementedError` with pointer to Faza 19.B
- [x] `ReelModule.runtime?: 'remotion' | 'hyperframes'` (optional, default `'remotion'`, zero BC break across every existing module)
- [x] `renderVideo()` in `base-orchestrator.ts` accepts optional `runtime` argument, routes through dispatcher
- [x] `createRenderer` re-exported from `@reelstack/agent` orchestrator for direct callers (demo scripts)
- [x] 1674 package tests + 266 web tests all green; 8 new dispatcher tests added

**Shipped in commit 05bf3eb.**

### Phase B: Hyperframes harness — end-to-end hello world (2-3 days)

**Goal:** actually render a Hyperframes composition in our pipeline.

- [ ] `packages/hyperframes/` package skeleton: `compositions/`, `render/`, `cli-wrapper.ts`
- [ ] `HyperframesRenderer.render()` implementation: spawns `npx hyperframes render`
      subprocess with composition path + props injected as `--data-var-*`
- [ ] Variable injection: HTML template placeholders (`data-var-headline="string"`)
      filled from orchestrator's `PlanResult` at render time
- [ ] Asset URL passthrough: R2/MinIO signed URLs accepted by HF `<video>`/`<img>` `src`
- [ ] Worker dispatch: BullMQ job payload includes `moduleSlug`, worker reads
      runtime from registry, calls dispatcher
- [ ] Preview mode: `npx hyperframes preview` in dev for HF modules (live reload)
- [ ] First "hello world" HF composition: `packages/hyperframes/compositions/hello.html`
      (title + fade-in, 5s, 1080x1920)
- [ ] Registered as module `slug=hello-hf`, `runtime='hyperframes'`
- [ ] Integration test: full pipeline renders hello-hf to MP4 via Hyperframes,
      uploaded to R2, downloadable via signed URL

**Acceptance:** `POST /api/v1/reel/generate {mode:"hello-hf"}` → completed job,
playable MP4, rendered by Hyperframes (logs confirm). Existing Remotion
modules untouched.

### Phase C: First native HF flagship — Faza 11 AI Director (1 week)

**Goal:** ship Faza 11 directly on Hyperframes, prove the stack for a
real product feature.

- [ ] All Faza 11 MVP items implemented, but composition is a Hyperframes
      HTML template, not Remotion
- [ ] Scene chaining via `data-composition-src` nested compositions
      (scene-1.html → scene-2.html → ... composed by `short-film.html` root)
- [ ] Last-frame → next-scene image_url: handled in orchestrator (no
      renderer concern), scene HTML gets correct asset URLs injected
- [ ] Public module: `slug=short-film`, `runtime='hyperframes'`, paid
- [ ] Build-in-public Day 0 post ships with reel generated on Hyperframes

**Acceptance:** Short-film mode works end-to-end. Zero new Remotion code
written in this phase.

### Phase D: Parallel operation + per-runtime metrics (ongoing)

**Goal:** observe both engines in prod, gather data for migration priority.

- [ ] Prometheus metric `reelstack_render_duration_seconds{runtime, module_slug}`
- [ ] Prometheus metric `reelstack_render_failures_total{runtime, module_slug, error_type}`
- [ ] Prometheus metric `reelstack_supervisor_score{runtime, module_slug}` for
      quality comparison
- [ ] Grafana dashboard with side-by-side panels per runtime
- [ ] Weekly internal review: which modules would benefit most from HF port
      (quality? speed? cost?)

**Acceptance:** Dashboard shows both engines, data flowing for 2+ weeks
before any more ports begin.

### Phase E: Strangler-fig module migrations (3-6 months elapsed, ~5h each with LLM assist)

**Goal:** migrate existing modules to Hyperframes one at a time,
least-risky first. Each migration is reversible via `runtime` flag.

**Order (prioritized by: simplicity + freemium-visibility + cards-first-because-27-of-them):**

- [ ] **E.1** `slideshow` module (simplest, few deps, public) → HF
- [ ] **E.2** `captions` module (highest visibility, HF has visual editor!) → HF
- [ ] **E.3** Cloud Run renderer (replaces LambdaRenderer elastically for HF):
      Cloud Run Job spec, queue-to-job dispatcher, cold-start mitigations,
      cost instrumentation vs Lambda baseline. Not per-render sharding —
      that waits for HeyGen's distributed roadmap or our fork.
- [ ] **E.4** `n8n-explainer` module (private, complex) → HF
- [ ] **E.5** `talking-object` module → HF
- [ ] **E.6** `presenter-explainer` module → HF
- [ ] **E.7** 27 cards library via LLM-assisted port:
      prompt-per-card, ~1h each with review, ~1 week total
- [ ] **E.8** 26 transitions library → HF GSAP timelines,
      ~3-4 days
- [ ] **E.9** 5 layouts (fullscreen, split-screen, anchor-bottom,
      hybrid-anchor, comparison-split) → HF compositions

**Per-module acceptance:** (1) visual regression test (pixel diff ≤ 2%
against Remotion reference), (2) supervisor score delta within ±5 points,
(3) feature-flag rollout 10% → 50% → 100% over 1 week with no error rate
spike.

### Phase F: Cutoff + announcement (1-2 days)

**Goal:** remove Remotion, publish open-source core.

- [ ] Verify: no production traffic on Remotion renderer for 2+ weeks
- [ ] Remove `@remotion/*` dependencies from all package.json files
- [ ] Delete `packages/remotion/` (or archive to `_archive/`)
- [ ] Update `docker/Dockerfile.reel-worker` to drop Remotion Chrome
      flags, bundler, fonts
- [ ] Remove `REMOTION_RENDERER` env var from all config
- [ ] Update README, PRODUCTION-GUIDE.md, ARCHITECTURE.md
- [ ] **Public announcement:** "ReelStack core now fully open source
      (Apache 2.0), zero license friction, forever."
- [ ] Unblocks Faza 20 (Plugin Marketplace launch)

**Acceptance:** `grep -rn "remotion" --include="*.ts"` returns zero hits
in production code paths. Docker image size down. All prod reels still
generating.

## Faza 20: Open-source Core + Plugin Marketplace Go-to-Market — planned

**Depends on:** Faza 19 F.

**Strategic rationale:** With Apache 2.0 core shipped (Faza 19 F),
ReelStack becomes credible "self-hosted AI reel factory" (TSA brand fit)
while monetizing via a plugin marketplace — WordPress/Obsidian model.
Public GitHub release turns ReelStack into organic distribution.

### Launch

- [ ] Make `reelstack-monorepo` repo public (currently private)
- [ ] README reframed: "Self-host your AI reel factory. Apache 2.0 core,
      paid modules for advanced layouts/cards/characters."
- [ ] LICENSE_NOTICE audits across public modules (nothing bleeds
      `reelstack-modules` proprietary code into public)
- [ ] Launch post: Hacker News, X/BlueSky, r/selfhosted, r/LocalLLaMA,
      PolishDev discords
- [ ] Submit to Remotion's success-stories alternative coverage (via
      Hyperframes team; they'd likely feature us)

### Plugin marketplace

- [ ] Public plugin registry (`GET /api/v1/plugins/marketplace`):
      name, description, screenshot, price, creditCost per render
- [ ] Checkout flow: plugin purchase → Sellf webhook → `UserModuleAccess`
      row grants access
- [ ] First 3 paid plugins ready on launch day:
  - Card pack "Broadcast" ($29 one-time) — 8 cards: lower-third,
    chapter-card, breaking-news, stat-card, pull-quote, ticker, etc.
  - Effect pack "Cinematic" ($19/mo) — film grain, lens flares,
    color LUTs, motion blur presets
  - Industry pack "Dev Creator" ($49 one-time) — n8n-explainer,
    terminal-reveal, PR-demo, commit-graph visualizer
- [ ] Plugin SDK doc: "How to write and sell a ReelStack plugin"
- [ ] Revenue split: 100% to plugin author for first 6 months,
      then 80/20 (ReelStack takes 20% hosting/distribution fee)

### Positioning + content

- [ ] Blog: "Why we migrated from Remotion to Hyperframes"
      (technical credibility + indirect license comparison — factual,
      not hit-piece)
- [ ] Blog: "Building a plugin marketplace for AI-generated video"
      (content for build-in-public audience)
- [ ] Case study: TSA course builds reel factory in 1 afternoon
      using ReelStack self-hosted (eats our own dog food for brand)

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

## Priority Queue (next 4-8 weeks)

Ranked by business leverage given build-in-public commitment, $1M ARR
vision (`vault/_shared/reference/reelstack-growth-playbook.md`), and
the Hyperframes migration path unlocked 2026-04-22.

**Strategic shift:** Faza 19 A-B goes before Faza 11 because Faza 11
ships natively on Hyperframes — building it on Remotion first would be
throwaway work. Total critical-path delay is ~3-5 days for a permanent
architectural win.

1. **Faza 19.A — Renderer dispatcher + HF stub** (1-2 days).
   Foundation. Zero behavioral change, but every future module declares
   its runtime. Required before Faza 11.

2. **Faza 19.B — Hyperframes harness + hello-world** (2-3 days).
   Proves end-to-end HF render in our pipeline. Unblocks Faza 11.

3. **Faza 11 MVP — AI Director on Hyperframes** (1 week). First
   native HF module, first paid module on new architecture, flagship
   build-in-public deliverable.

4. **Faza 17 — Landing + waitlist + Day-0 post**. Funnel for Faza 11.
   Day-0 post waits for a working HF-rendered demo reel (post-Faza 11
   MVP). Content hook: "Built on Hyperframes, Apache 2.0 core, no
   per-render fees."

5. **Faza 18 — Payment → credits audit** (1-2 h). Block-remover for
   paid conversion. Probably already half-built.

6. **Smoke-test gpt-image-2 live** (15 min). Confirms early-access path
   before demoing to waitlist.

7. **Faza 19.D — per-runtime metrics dashboard** (1 day). So
   subsequent porting decisions are data-driven, not vibes.

8. **Faza 19.E — strangler porting, slideshow first** (~5h per
   module, LLM-assisted). Then captions (visual editor win), then
   cards via prompt-per-card script.

9. **Faza 19.E.3 — Cloud Run renderer** when HF has 2-3 modules in
   prod and single-machine render starts queuing. Not before.

10. **Faza 11 Stretch (LoRA, dialog, shot grammar)** — only after
    MVP has real users.

11. **Faza 19.F + Faza 20 — public OSS launch + plugin marketplace**
    ~3-6 months out, when HF port is >80% complete and 3 paid plugins
    are ready.
