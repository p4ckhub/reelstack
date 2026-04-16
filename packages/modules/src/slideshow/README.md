# slideshow

Script or topic narrated over an AI-generated slideshow with karaoke
captions and cross-fades between slides.

- **Slug / `mode`:** `slideshow`
- **Required input:** `topic` _or_ `slides[]` (manual override)
- **Optional:** `numberOfSlides` (default 5), `brandPreset`, `tts`,
  `language`, `musicUrl`, `musicVolume`
- **Credit cost:** 10
- **Tier gate:** none

## Request

```bash
curl -X POST https://reelstack.sellf.app/api/v1/reel/generate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "slideshow",
    "topic": "5 reasons to self-host your automation stack",
    "numberOfSlides": 5,
    "tts": { "provider": "edge-tts", "voice": "en-US-GuyNeural" }
  }'
```

For manual control, skip `topic` and pass `slides: [{ title, body, imagePrompt? }]`.

## Pipeline

1. LLM generates the script + slide structure from `topic`.
2. Image gen produces one illustration per slide (NanoBanana / Gemini / FAL).
3. TTS voiceover + Whisper timing alignment.
4. Remotion assembles slides with cross-fades, captions, optional BGM.

## Shared polish layers

- [`scrollStopper`](../../../../docs/features/scroll-stopper.md) — great fit for the first slide
- [`endCard`](../../../../docs/features/end-card.md) — CTA after the last slide
- [`brandPreset.captionPreset`](../../../../docs/features/caption-presets.md)
