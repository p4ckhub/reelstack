# captions

Baked-in karaoke captions on an existing video. Skips TTS and composition
generation — downloads the file, runs Whisper on its audio, re-encodes
with word-level captions burned in.

- **Slug / `mode`:** `captions`
- **Required input:** `videoUrl` (public HTTPS)
- **Optional:** `script` (overrides auto-transcription), `cues` (pre-made
  timings), `brandPreset.captionPreset`, `tts.language` (Whisper lang hint)
- **Credit cost:** 8 (cheapest module — transcription only, no gen)
- **Tier gate:** none

## Request

```bash
curl -X POST https://reelstack.sellf.app/api/v1/reel/generate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "captions",
    "videoUrl": "https://cdn.example.com/my-raw.mp4",
    "brandPreset": {
      "captionPreset": "pop-word",
      "highlightColor": "#F59E0B"
    }
  }'
```

## Pipeline

1. Fetch `videoUrl` (SSRF-validated, public URLs only).
2. Extract audio → Whisper word-level transcription.
3. Remotion renders captions on top of the original video.
4. Upload MP4 to storage, return signed URL.

## Notes

- Provide `cues` if you already have timings (skip Whisper).
- For non-English audio, set `tts.language` so Whisper picks the right model.

## Shared polish layers

- [`brandPreset.captionPreset`](../../../../docs/features/caption-presets.md) — hormozi / pop-word / pill / glow / …
- [`scrollStopper`](../../../../docs/features/scroll-stopper.md) — not usually used here; captions are a pure overlay
- [`endCard`](../../../../docs/features/end-card.md) — works; tails the source video
