<div align="center">

# ReelStack

**Programmatic video pipeline. Generate reels, YouTube videos, and captioned content from text. 40+ AI tools, CLI pipeline, self-hostable, API-first, no vendor lock-in.**

[![CI](https://github.com/jurczykpawel/reelstack/actions/workflows/ci.yml/badge.svg)](https://github.com/jurczykpawel/reelstack/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-orange.svg)](https://github.com/jurczykpawel/reelstack)
[![Open Source](https://img.shields.io/badge/Open%20Source-100%25-brightgreen.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)](docs/CONTRIBUTING.md)

[Live Demo](https://reelstack.sellf.app) | [Documentation](docs/) | [Pipeline Guide](docs/REEL_PIPELINE.md) | [Modules](docs/MODULES.md) | [API Reference](#public-api-v1) | [Report Bug](https://github.com/jurczykpawel/reelstack/issues)

</div>

---

## Demo Reels

Generated entirely by ReelStack. No editing software, no designer, just one API call.

<table>
<tr>
<td align="center">
<a href="https://www.youtube.com/watch?v=QSM9JQevxjw"><img src="docs/assets/demo-meta-preview.gif" width="200" alt="AI Video Automation"/></a><br/>
<b>AI Video Automation</b><br/>
<sub>tip-card + karaoke captions</sub>
</td>
<td align="center">
<a href="https://www.youtube.com/watch?v=fE48rRCLx7Y"><img src="docs/assets/demo-science-preview.gif" width="200" alt="Science Facts"/></a><br/>
<b>Science Facts</b><br/>
<sub>quote-card + single-word mode</sub>
</td>
<td align="center">
<a href="https://www.youtube.com/watch?v=pzi6JYb3Icc"><img src="docs/assets/demo-iphone-preview.gif" width="200" alt="iPhone Tips"/></a><br/>
<b>iPhone Tips</b><br/>
<sub>tip-card + karaoke captions</sub>
</td>
</tr>
</table>

> Click any preview to watch the full reel on YouTube.

### Image Generator

ReelStack also generates standalone branded images for social media. No video required. Upload your brand CSS, pick a template and size, get a pixel-perfect PNG.

<details>
<summary><b>See examples</b>, 12 templates, 3 sizes, 2 built-in brands</summary>

<br/>

**Dark theme** (`example` brand)

| Post (1080x1080)                                              | Story (1080x1920)                                              | YouTube (1280x720)                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| <img src="docs/assets/covers/dark-tip-post.png" width="200"/> | <img src="docs/assets/covers/dark-tip-story.png" width="120"/> | <img src="docs/assets/covers/dark-tip-youtube.png" width="240"/> |
| tip-card                                                      | tip-card                                                       | tip-card                                                         |

**Light theme** (`example-light` brand)

| Post (1080x1080)                                                 | Story (1080x1920)                                                 | YouTube (1280x720)                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| <img src="docs/assets/covers/light-quote-post.png" width="200"/> | <img src="docs/assets/covers/light-quote-story.png" width="120"/> | <img src="docs/assets/covers/light-quote-youtube.png" width="240"/> |
| quote-card                                                       | quote-card                                                        | quote-card                                                          |

**More templates:** ad-card, announcement, webinar-cover, webinar-point, webinar-cta-slide, webinar-countdown, webinar-lastcall, webinar-myth, webinar-program, webinar-question

**Standalone image server:** `apps/image-gen-server`. One `docker compose up` for a self-hosted image API.

</details>

---

## Why ReelStack?

Most video tools are either closed-source SaaS products with usage limits, or scattered scripts requiring manual assembly. ReelStack is a complete pipeline:

- **Script to reel in seconds.** Write text, get a finished video with voiceover, karaoke captions, transitions, and effects
- **40+ AI tools across 10+ providers.** AI video (Veo 3.1, Seedance, Kling), AI images (NanoBanana, Flux, Ideogram), stock footage (Pexels), avatars (HeyGen)
- **CLI pipeline for step-by-step production.** Run each stage independently: TTS, plan, assets, assemble, render
- **AI Director (Claude) for automated shot planning.** Selects tools, plans shots, writes prompts, reviews quality
- **Configurable prompt system.** All LLM prompts are editable markdown templates. No code changes needed
- **Transparent avatar overlay.** Greenscreen or background removal for talking-head-over-content layouts
- **Asset management.** Regenerate or replace individual shots without re-running the whole pipeline
- **11 composable effects.** Text cards, B-roll cutaways, punch-in zoom, highlight boxes, animated counters, lower thirds, CTAs, PiP, and more
- **Two output formats.** 9:16 reels (Instagram/TikTok/Shorts) and 16:9 YouTube videos with the same effect library
- **Real karaoke captions.** TTS voiceover + whisper.cpp word-level timestamps = pixel-accurate word-by-word highlighting
- **API-first.** REST API with auth, rate limiting, and scoped permissions. Automate from your app or n8n workflow
- **Fully self-hostable.** Deploy on your own VPS with Docker. Your data, your infrastructure

### What It Does

ReelStack is a programmatic video pipeline. You provide a script (or video + subtitles), configure effects and style, and the pipeline generates a finished MP4: text-to-speech voiceover, whisper-based word timestamps, karaoke captions, B-roll transitions, overlays, and more. It includes a web app with wizard UI, dashboard, and REST API.

### Who It's For

- **Content creators** who want to generate reels and YouTube clips from scripts without editing software
- **Developers** who need programmatic video rendering via API or CLI
- **Agencies** who produce video content at scale with batch rendering
- **Educators** who teach video production with code

### Alternative To

ReelStack replaces manual editing workflows in tools like **Kapwing**, **Descript**, **VEED.io**, **Opus Clip**, or scattered **FFmpeg** scripts, with a single self-hosted pipeline.

---

## ReelStack + HeyGen, Veo, Seedance

ReelStack is the production pipeline. HeyGen, Veo, Seedance, and other AI tools are the content generators. ReelStack orchestrates them.

Instead of competing with AI video platforms, ReelStack integrates them into a unified production workflow. You get the best of both worlds: AI-generated content (avatars, B-roll, images) with full pipeline control (timing, transitions, captions, effects, branding).

|                          | AI Video SaaS alone                                  | ReelStack (orchestrating AI tools)                                       |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| **Control**              | Prompt in, video out. No timeline, no pacing control | Full programmatic control. Templates, effects, frame-level precision     |
| **Tool choice**          | Locked to one platform's models                      | 40+ tools across 10+ providers. Swap freely per shot                     |
| **Avatar support**       | Platform-specific avatars only                       | HeyGen Avatar III/IV/V + transparent overlay on any content              |
| **Cost at scale**        | $1-5+ per reel (credit-based, credits expire)        | ~$0.10-0.50 per reel (self-hosted TTS + Remotion Lambda)                 |
| **Automation**           | Limited API, no webhook pipeline                     | REST API + BullMQ + CLI + n8n webhooks. Zero-click batch production      |
| **Data ownership**       | Your assets, their servers                           | Your infrastructure, your storage, your data. AGPL-3.0                   |
| **Customization**        | Choose from their templates                          | Build your own Remotion compositions in React. 11 effects, 5 transitions |
| **Offline / air-gapped** | Requires internet, their servers                     | Runs on a Raspberry Pi if you want                                       |

### When to use AI Video SaaS directly

If all you need is a quick avatar video and you do not care about pipeline automation, tools like HeyGen are great standalone. ReelStack adds value when you need batch production, brand consistency, multi-tool orchestration, or cost predictability.

> ReelStack is video infrastructure. AI video tools are content engines. ReelStack connects them into a production line.

---

## CLI Pipeline

ReelStack includes a step-by-step CLI for local reel production. Each stage outputs a JSON file consumed by the next.

### Pipeline A: Voiceover (TTS generates audio)

```bash
bun run rs tts "Your script text here"
bun run rs plan out/tts.json
bun run rs assets out/plan.json
bun run rs assemble out/plan.json out/tts.json
bun run rs render out/composition.json
```

### Pipeline B: HeyGen avatar (audio from talking head)

```bash
bun run rs heygen "Your script text here"
bun run rs transcribe out/heygen.mp4
bun run rs plan out/tts.json --director
bun run rs assets out/plan.json
bun run rs assemble out/plan.json out/tts.json
bun run rs render out/composition.json
```

Each step can be re-run independently. Replace a single asset with `bun run rs regen <shot-id>` or `bun run rs replace <shot-id> <file>`.

For full CLI reference, see [PRODUCTION-GUIDE.md](PRODUCTION-GUIDE.md).

---

## Tool Registry

ReelStack auto-discovers 40+ AI tools across 10+ providers based on which API keys are configured.

| Category        | Providers                                                                      | Example tools                             |
| --------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| **AI Video**    | fal.ai, KIE, PiAPI, AIML, WaveSpeed, Replicate, Runway, Minimax, Google Vertex | Veo 3.1, Seedance 2.0, Kling, Wan, Hailuo |
| **AI Images**   | fal.ai, KIE, WaveSpeed, Replicate                                              | NanoBanana, Flux, Ideogram, Recraft       |
| **Stock**       | Pexels                                                                         | Stock footage search                      |
| **Avatars**     | HeyGen                                                                         | Avatar III, IV, V                         |
| **Self-hosted** | RunPod                                                                         | HuMo avatar                               |

Adding a new model is one config object in the provider file. No other files need changes. See [PRODUCTION-GUIDE.md](PRODUCTION-GUIDE.md#adding-a-new-model) for details.

Each tool has an editable markdown prompt guideline in `packages/agent/src/prompts/guidelines/`. The AI Director uses these when writing generation prompts.

---

## Features

### Reel & YouTube Pipeline

- **Script to video.** Write text, generate voiceover (Edge TTS / ElevenLabs / OpenAI), auto-caption with whisper.cpp, render with Remotion
- **Two compositions.** 9:16 vertical reels and 16:9 horizontal YouTube, sharing the same effect library
- **Karaoke captions.** Word-by-word highlighting with real whisper.cpp word-level timestamps
- **11 composable effects.** Text cards, B-roll cutaways, punch-in zoom, highlight boxes, animated counters, lower thirds, CTAs, PiP, chapter cards, progress bar
- **5 transition types.** Crossfade, slide-left, slide-right, zoom-in, wipe

### AI Director & Tool Orchestration

- **AI Director (Claude).** Automated shot planning: selects tools, plans B-roll, writes generation prompts, reviews quality
- **40+ AI tools.** Video generation, image generation, stock footage, avatars. Auto-discovered from environment
- **Configurable prompt system.** All LLM prompts are editable markdown files. Modify planning behavior without code changes
- **Transparent avatar overlay.** Greenscreen chromakey or native background removal for talking-head-over-content layouts
- **Asset management.** Regenerate or replace individual shots. Swap tools per shot

### Subtitle Editor

- **Visual timeline editor.** Drag and resize subtitle blocks with snap-to-grid
- **8 built-in templates.** Classic, Cinematic, Bold Box, Modern, Minimal Top, Neon, Yellow Box, Typewriter
- **Full style control.** Font family, size, color, outline, shadow, position, alignment
- **SRT import/export.** Load existing subtitle files, edit visually, export back to SRT

### Rendering

- **Remotion-based.** React compositions rendered to MP4 with @remotion/renderer
- **Remotion Lambda.** AWS serverless rendering for fast, scalable output
- **Client-side rendering.** FFmpeg.wasm for subtitle burning in the browser
- **Server-side rendering.** Queue jobs to server with BullMQ for longer videos
- **3 render presets.** Speed, balanced, and quality modes

### Public API v1

- **REST API** with API key authentication (`Authorization: Bearer rs_...`)
- **Reel pipeline endpoint.** POST /api/v1/reel/generate with script, TTS config, style
- **Full CRUD.** Render jobs, projects, templates, API keys
- **Zod-validated** requests and responses

### Monetization

- **Sellf webhook integration.** Tier upgrades (Free/Pro/Enterprise) and token purchases
- **Token system.** Render credits with daily limits per tier + purchasable token packs
- **API key scoping.** Granular permissions (render, reel, publish, templates, projects)

### Self-Hosting

- **Docker deployment.** PostgreSQL, Redis, MinIO, all in Docker Compose
- **Cloud deployment.** Vercel + Supabase + Inngest alternative
- **No vendor lock-in.** Swap storage or queue backends without code changes

---

## Quick Start

### Prerequisites

| Requirement                               | Version                        |
| ----------------------------------------- | ------------------------------ |
| [Bun](https://bun.sh/)                    | 1.3+                           |
| [Node.js](https://nodejs.org/)            | 20+                            |
| [PostgreSQL](https://www.postgresql.org/) | 15+ (or use Docker)            |
| OS                                        | macOS, Linux, or Windows (WSL) |

### Run Locally (Docker, one command)

The fastest path: everything in Docker, hot-reload, sign in without SMTP.

```bash
git clone https://github.com/jurczykpawel/reelstack.git
cd reelstack
bin/dev-up.sh                 # first run creates .env.dev, re-run after editing
```

What this starts:

- Postgres, Redis, MinIO (S3-compatible storage) — all with auto-setup
- `web` (Next.js) on `http://localhost:3001`
- `worker` (reel pipeline) with hot reload from mounted source

On first run the script prints the path to `.env.dev`. Open it and add at least:

```env
ANTHROPIC_API_KEY=sk-ant-...   # required — Claude plans the video
OPENAI_API_KEY=sk-...          # required — Whisper transcribes for captions
```

Then re-run `bin/dev-up.sh`. Open `http://localhost:3001/login` and click **“Dev login”** to sign in with any email. No password, no SMTP.

Reset the environment (drop DB + storage): `docker compose -f docker-compose.dev.yml down -v`.

### Run Locally (bare metal, no Docker)

If you prefer running Next.js on the host:

```bash
bun install
docker compose up -d postgres redis minio       # infra only
bunx prisma db push --schema=packages/database/prisma/schema.prisma
bun run dev                                     # web
bun run worker --filter web                     # second terminal
```

Set `ALLOW_DEV_LOGIN=1` and `NEXT_PUBLIC_ALLOW_DEV_LOGIN=1` in `apps/web/.env` for the Dev login button.

### Build for Production

```bash
bun run build
```

For full deployment instructions:

- **VPS (Docker)**: See [Self-host guide](docs/DEPLOYMENT_VPS.md). PostgreSQL, Redis, MinIO, all in Docker
- **Cloud (Vercel)**: See [Vercel + Supabase guide](docs/DEPLOYMENT_CLOUD.md). Vercel for app, Supabase for storage, Inngest for queue

---

## Tech Stack

| Layer                | Technology                                                                                                                        | Role                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Framework**        | [Next.js 16](https://nextjs.org/) (App Router)                                                                                    | Server-side rendering, API routes, file-based routing |
| **Language**         | [TypeScript](https://www.typescriptlang.org/)                                                                                     | Type safety across all packages                       |
| **UI**               | [React 19](https://react.dev/)                                                                                                    | Component framework                                   |
| **Styling**          | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)                                                    | Utility-first CSS with accessible component library   |
| **State**            | [Zustand](https://zustand-demo.pmnd.rs/)                                                                                          | 4 client-side stores (project, engine, timeline, UI)  |
| **Auth**             | [Auth.js](https://authjs.dev/) (NextAuth v5)                                                                                      | Email/password + magic links, JWT sessions            |
| **Database**         | [PostgreSQL](https://www.postgresql.org/) + [Prisma ORM](https://www.prisma.io/)                                                  | Relational storage with type-safe queries             |
| **Storage**          | [MinIO](https://min.io/) / [Supabase Storage](https://supabase.com/storage)                                                       | Video and rendered file storage (adapter pattern)     |
| **Queue**            | [BullMQ](https://docs.bullmq.io/) + [Redis](https://redis.io/) / [Inngest](https://www.inngest.com/)                              | Background render job processing (adapter pattern)    |
| **Client Rendering** | [FFmpeg.wasm](https://ffmpegwasm.netlify.app/)                                                                                    | In-browser video processing via WebAssembly           |
| **Server Rendering** | [Remotion](https://www.remotion.dev/) + [Remotion Lambda](https://www.remotion.dev/lambda)                                        | React-based video rendering, local or AWS Lambda      |
| **Transcription**    | [whisper.cpp](https://github.com/ggerganov/whisper.cpp) / [Transformers.js](https://huggingface.co/docs/transformers.js/)         | Word-level timestamps for karaoke captions            |
| **AI Orchestration** | [Claude](https://www.anthropic.com/) (Opus/Sonnet/Haiku)                                                                          | Shot planning, prompt expansion, quality review       |
| **TTS**              | [Edge TTS](https://github.com/niconiahi/edge-tts) / [ElevenLabs](https://elevenlabs.io/) / [OpenAI](https://platform.openai.com/) | Text-to-speech voiceover generation                   |
| **Monorepo**         | [Turborepo](https://turbo.build/) + [Bun](https://bun.sh/) workspaces                                                             | Build orchestration and dependency management         |
| **Testing**          | [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/)                                                             | 1200+ unit tests + E2E tests                          |

---

## Architecture

### Directory Structure

```
reelstack/
├── apps/web/                  # Next.js application
│   ├── src/
│   │   ├── app/               # Pages & API routes (internal + v1)
│   │   ├── components/        # React components (editor, timeline, video, UI)
│   │   ├── lib/               # Auth, API helpers, bridges, hooks
│   │   └── store/             # Zustand state management (4 stores)
│   ├── worker/                # BullMQ render worker (standalone process)
│   └── e2e/                   # Playwright E2E tests
├── packages/
│   ├── agent/                 # LLM planning, tool registry, CLI, orchestration
│   ├── types/                 # Shared TypeScript interfaces
│   ├── core/                  # Engines, action system, serializer, templates
│   ├── remotion/              # Remotion compositions + video components
│   ├── tts/                   # Text-to-speech (Edge TTS, ElevenLabs, OpenAI)
│   ├── transcription/         # whisper.cpp wrapper + word grouping
│   ├── ffmpeg/                # SRT parser, ASS generator, time utils
│   ├── database/              # Prisma schema + query helpers
│   ├── queue/                 # Queue adapters (Inngest, BullMQ)
│   ├── storage/               # Storage adapters (Supabase, MinIO, R2)
│   └── modules/               # Module system (private extensions)
├── docker/                    # Dockerfiles + nginx config
├── scripts/                   # Setup scripts
└── docs/                      # Documentation
```

### Key Packages

| Package                      | Purpose                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`packages/agent`**         | LLM-powered planning (AI Director), 40+ tool registry, CLI pipeline, prompt system (editable markdown), orchestration, supervisor. The brain of the reel pipeline.                                                                    |
| **`packages/remotion`**      | Remotion compositions (Reel 9:16, YouTubeLongForm 16:9), 11 effect components (ZoomEffect, AnimatedCounter, HighlightBox, ChapterCard, etc.), schemas, and rendering helpers. See [COMPOSITION.md](packages/remotion/COMPOSITION.md). |
| **`packages/tts`**           | Text-to-speech providers: Edge TTS (free), ElevenLabs, OpenAI. Unified interface for synthesis.                                                                                                                                       |
| **`packages/transcription`** | whisper.cpp integration, audio normalization, BPE token merging, word-to-cue grouping. Produces karaoke-ready cues.                                                                                                                   |
| **`packages/core`**          | Pure-function engines (SubtitleEngine, TemplateEngine, RenderEngine, ActionSystem, ProjectSerializer).                                                                                                                                |
| **`packages/ffmpeg`**        | SRT parser, ASS generator (including karaoke timing tags), time-format utilities.                                                                                                                                                     |
| **`packages/database`**      | Prisma schema (User, Video, RenderJob, ReelJob, Template, ApiKey, TokenTransaction, etc.) + query helpers.                                                                                                                            |
| **`packages/queue`**         | Adapter: auto-detects Inngest (cloud) or BullMQ (VPS).                                                                                                                                                                                |
| **`packages/storage`**       | Adapter: auto-detects Supabase Storage (cloud), MinIO (VPS), or Cloudflare R2.                                                                                                                                                        |
| **`packages/types`**         | Shared TypeScript interfaces and API scope constants.                                                                                                                                                                                 |

For full architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For the reel generation pipeline, see [docs/REEL_PIPELINE.md](docs/REEL_PIPELINE.md).

---

## Usage

### Local Mode (No Account Required)

1. Open the app at `http://localhost:3000`
2. Drop a video file (**MP4**, **WebM**, **MOV**, **MKV**, up to 500 MB)
3. Add subtitles with the **+ Add Subtitle** button or import an **SRT** file
4. Edit text, timing, and style in the right panel
5. Use the timeline to drag and resize subtitle blocks
6. Click **Render** then **Browser** to burn subtitles client-side
7. Download the rendered video

### Dashboard Mode (With Account)

1. Sign up or sign in at `/login`
2. Upload videos from the dashboard. They are stored in cloud/MinIO storage
3. Edit subtitles. Changes auto-save every 2 seconds
4. Render using **Server** mode for faster processing of long videos
5. Download rendered videos from the dashboard

### Keyboard Shortcuts

| Key                    | Action                          |
| ---------------------- | ------------------------------- |
| `Space`                | Play / Pause                    |
| `Left Arrow`           | Seek back 0.1s (`Shift`: 1s)    |
| `Right Arrow`          | Seek forward 0.1s (`Shift`: 1s) |
| `Delete` / `Backspace` | Remove selected subtitle        |

### SRT Workflow

1. Click **Import SRT** in the toolbar to load existing subtitles
2. Edit timing and text visually
3. Click **Export SRT** to save the result

### API Usage Examples

The public API uses API key authentication. Generate a key from the dashboard or via the API.

```bash
# Create a render job
curl -X POST https://your-instance.com/api/v1/render \
  -H "Authorization: Bearer rs_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{ "videoId": "uuid", "style": { "fontFamily": "Arial", "fontSize": 48 }, "cues": [...] }'

# Check render status
curl https://your-instance.com/api/v1/render/job-uuid \
  -H "Authorization: Bearer rs_live_your_api_key"

# Download rendered video
curl -L https://your-instance.com/api/v1/render/job-uuid/download \
  -H "Authorization: Bearer rs_live_your_api_key" -o output.mp4
```

For the full list of 21 API endpoints, see the [API Routes section in ARCHITECTURE.md](docs/ARCHITECTURE.md#public-api-v1).

---

## Development Commands

```bash
bun install                # Install all dependencies
bun run dev                # Start dev server (http://localhost:3000)
bun run build              # Production build
bun run test               # Run all tests (1200+ across agent, remotion, and web)
bun run lint               # Lint all packages
bun run format             # Format with Prettier
bun run format:check       # Check formatting without writing
```

---

## Environment Variables

| Variable                      | Required | Description                                                  |
| ----------------------------- | -------- | ------------------------------------------------------------ |
| `AUTH_SECRET`                 | Yes      | Random secret for JWT signing (`openssl rand -base64 32`)    |
| `DATABASE_URL`                | Yes      | PostgreSQL connection string                                 |
| `SMTP_HOST`                   | No       | SMTP server for magic link emails                            |
| `SMTP_PORT`                   | No       | SMTP port (default: 587)                                     |
| `SMTP_USER`                   | No       | SMTP username                                                |
| `SMTP_PASS`                   | No       | SMTP password                                                |
| `EMAIL_FROM`                  | No       | From address for emails                                      |
| `REDIS_URL`                   | No       | Redis for BullMQ (VPS mode)                                  |
| `MINIO_ENDPOINT`              | No       | MinIO endpoint (VPS mode)                                    |
| `MINIO_ACCESS_KEY`            | No       | MinIO access key                                             |
| `MINIO_SECRET_KEY`            | No       | MinIO secret key                                             |
| `MINIO_BUCKET`                | No       | MinIO bucket name                                            |
| `NEXT_PUBLIC_FFMPEG_CORE_URL` | No       | Custom CDN base URL for FFmpeg WASM core (defaults to unpkg) |
| `NEXT_PUBLIC_SUPABASE_URL`    | No       | Supabase URL (cloud mode, storage only)                      |
| `SUPABASE_SERVICE_ROLE_KEY`   | No       | Supabase service key (cloud mode)                            |

---

## Roadmap

See **[docs/ROADMAP.md](docs/ROADMAP.md)** for the full roadmap with phase details.

### Completed

- [x] Visual timeline editor with drag and resize
- [x] 8 built-in subtitle templates, 6 caption animation styles
- [x] Client-side + server-side rendering (FFmpeg.wasm / BullMQ)
- [x] Auto-transcription with in-browser Whisper
- [x] Public REST API v1 (21 endpoints)
- [x] Remotion-based reel rendering (React video compositions)
- [x] TTS voiceover (Edge TTS / ElevenLabs / OpenAI) + Whisper word alignment
- [x] Remotion Lambda renderer (AWS serverless)
- [x] AI Director (Claude) with 40+ tools across 10+ providers
- [x] CLI pipeline (tts, plan, assets, assemble, render)
- [x] HeyGen Avatar integration (III/IV/V)
- [x] Transparent avatar overlay (greenscreen + native background removal)
- [x] Reel creation API + Postiz multi-platform publishing
- [x] Sellf payment webhook (tier upgrades + token packs)
- [x] Docker deployment with optional reel-worker (Chromium + pre-bundled Remotion)
- [x] 1200+ tests across agent, remotion, and web packages

### Planned

- [ ] Web UI reel editor (wizard, preview, publish flow)
- [ ] Multi-language subtitle tracks
- [ ] Batch reel rendering via API
- [ ] Custom font uploads
- [ ] GPU-accelerated server rendering

---

## Premium Modules

ReelStack is fully open source (AGPL-3.0). Premium montage templates and effects are available as optional closed-source modules for commercial use.

---

## Contributing

Contributions are welcome and appreciated. There are many ways to help:

- **Report bugs.** Open an [issue](https://github.com/jurczykpawel/reelstack/issues) with steps to reproduce
- **Suggest features.** Start a [discussion](https://github.com/jurczykpawel/reelstack/discussions) or open an issue tagged `enhancement`
- **Submit pull requests.** Bug fixes, new features, documentation improvements
- **Improve tests.** The project has 1200+ tests but more coverage is always welcome
- **Write documentation.** Tutorials, guides, or translations

Please read **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** for development setup, code style guidelines, commit conventions, and the PR process.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for details.

### Security and Privacy

ReelStack can process user-uploaded video files and stores user accounts identified by email. Login is passwordless (magic link only). If you self-host this application:

- Review the [SECURITY.md](SECURITY.md) file for the security policy and vulnerability reporting process
- All video files are stored in your configured storage backend (MinIO, R2, or Supabase). No data is sent to third parties
- Client-side rendering processes video entirely in the browser. The file never leaves the user's device
- API keys are stored as SHA-256 hashes, never in plaintext
- All database queries are scoped to the authenticated user (application-level row security)

---

## Support

- **Bug reports and feature requests.** [GitHub Issues](https://github.com/jurczykpawel/reelstack/issues)
- **Questions and discussions.** [GitHub Discussions](https://github.com/jurczykpawel/reelstack/discussions)
- **Security vulnerabilities.** Email **security@reelstack.io** (see [SECURITY.md](SECURITY.md))

---

## Acknowledgments

ReelStack is built on top of these excellent open-source projects:

| Project                                                                        | Role                                  |
| ------------------------------------------------------------------------------ | ------------------------------------- |
| [Next.js](https://nextjs.org/)                                                 | Full-stack React framework            |
| [Remotion](https://www.remotion.dev/)                                          | React-based video rendering           |
| [FFmpeg](https://ffmpeg.org/) / [FFmpeg.wasm](https://ffmpegwasm.netlify.app/) | Video processing (server and browser) |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp)                        | Word-level speech transcription       |
| [Zustand](https://zustand-demo.pmnd.rs/)                                       | Lightweight state management          |
| [Auth.js](https://authjs.dev/)                                                 | Authentication framework              |
| [Prisma](https://www.prisma.io/)                                               | Database ORM                          |
| [BullMQ](https://docs.bullmq.io/)                                              | Redis-backed job queue                |
| [Tailwind CSS](https://tailwindcss.com/)                                       | Utility-first CSS framework           |
| [shadcn/ui](https://ui.shadcn.com/)                                            | Accessible UI components              |
| [Turborepo](https://turbo.build/)                                              | Monorepo build system                 |
| [Vitest](https://vitest.dev/)                                                  | Unit testing framework                |
| [Playwright](https://playwright.dev/)                                          | End-to-end testing                    |

![](https://stats.techskills.academy/pixels/github?url=/readme/reelstack)
