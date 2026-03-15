# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-14

### Added

- Reel pipeline: text → TTS voiceover → Whisper word-level timestamps → Remotion render → MP4
- 11 composable reel effects: text cards, B-roll cutaways, punch-in zoom, highlight boxes, animated counters, lower thirds, CTAs, PiP
- Karaoke captions with pixel-accurate word-by-word highlighting
- 16:9 YouTube video output alongside 9:16 reels
- AI Director: Claude-powered production planner for automatic shot selection
- TTS adapters: ElevenLabs (voice clone), Edge TTS (free fallback)
- Remotion Lambda serverless rendering (AWS)
- Cloudflare R2 storage adapter
- `packages/image-gen` — social media image generator (Playwright + HTML/CSS templates, 14 layouts, brand system)
- `apps/image-gen-server` — standalone Docker image for `image-gen` (one-command self-hosting)
- REST API v1: `POST /api/v1/reel/generate`, `POST /api/v1/image/generate`
- Credit system with per-operation pricing
- Webhook callbacks with HMAC signing
- Prometheus metrics endpoint

## [0.1.0] - 2026-02-21

### Added

- Subtitle editor with visual timeline (drag, resize, snap-to-grid)
- 8 built-in caption style templates (Classic, Cinematic, Bold Box, Modern, Minimal Top, Neon, Yellow Box, Typewriter)
- 6 caption animation styles (word-highlight, word-by-word, karaoke, bounce, typewriter, none)
- Auto-transcription via whisper.cpp (server-side, word-level timestamps)
- Browser-side rendering with FFmpeg.wasm (no upload required)
- Server-side rendering with native FFmpeg and BullMQ job queue
- Public REST API v1 with API key authentication
- SRT import and export
- Dual deployment modes: VPS (Docker with PostgreSQL, Redis, MinIO) and Cloud (Vercel + Supabase + Inngest)
