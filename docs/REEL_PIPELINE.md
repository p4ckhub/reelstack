# Reel Pipeline

End-to-end flow from script text to rendered MP4 video.

## Pipeline Overview

```
Script Text
    │
    ▼
┌─────────┐   Edge TTS / ElevenLabs / OpenAI
│   TTS   │──────────────────────────────────▶ Audio (MP3)
└─────────┘                                       │
                                                  ▼
                                          ┌──────────────┐   16kHz mono WAV
                                          │  Normalize   │──────────────────▶ WAV
                                          └──────────────┘                     │
                                                                               ▼
                                                                     ┌──────────────┐
                                                                     │ whisper.cpp  │
                                                                     │ (word-level) │
                                                                     └──────────────┘
                                                                               │
                                                                               ▼
                                                                    Word timestamps
                                                                               │
                                                                               ▼
                                                                  ┌──────────────────┐
                                                                  │ groupWordsIntoCues│
                                                                  └──────────────────┘
                                                                               │
                                                                               ▼
                                                                    Karaoke cues
                                                                    (with per-word timing)
                                                                               │
                     ┌─────────────────────────────────────────────────────────┘
                     ▼
            ┌─────────────────┐
            │  Build ReelProps│  Add: B-roll, text cards, transitions,
            │                 │  lower thirds, CTAs, zoom, counters, etc.
            └─────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ Remotion Render │  @remotion/renderer
            └─────────────────┘
                     │
                     ▼
                  MP4 file
```

## Step 1: Text-to-Speech

Supported providers (server-side env-aware resolver picks the best one
available; override via `tts.provider` per request):

| Provider     | Quality   | Cost       | Auto-detected when env contains          |
| ------------ | --------- | ---------- | ---------------------------------------- |
| Gemini Flash | Excellent | Paid (low) | `GEMINI_API_KEY` or `GOOGLE_TTS_API_KEY` |
| ElevenLabs   | Excellent | Paid       | `ELEVENLABS_API_KEY`                     |
| OpenAI       | Excellent | Paid       | `OPENAI_API_KEY`                         |
| Edge TTS     | Good      | Free       | (always available, fallback)             |

Resolver priority: gemini-tts > elevenlabs > openai > edge-tts.

Override via `tts.provider` in the request, or `TTS_PROVIDER` env var.
See `packages/agent/src/config/tts-defaults.ts` for the full logic.

```typescript
import { createTTSProvider } from '@reelstack/tts';
import { resolveTTSDefaults } from '@reelstack/agent';

// resolveTTSDefaults reads env, picks provider+voice+language
const cfg = resolveTTSDefaults({ language: 'en-US' });
// cfg = { provider: 'gemini-tts', voice: 'Charon', language: 'en-US' } (when GEMINI_API_KEY set)

const tts = createTTSProvider({ provider: cfg.provider, defaultLanguage: cfg.language });
const result = await tts.synthesize(scriptText, {
  voice: cfg.voice,
  language: cfg.language,
  rate: 1.05,
});
// result.audioBuffer: Buffer (MP3)
// result.format: 'mp3'
```

## Step 2: Audio Normalization

whisper.cpp requires 16kHz mono WAV. The `normalizeAudioForWhisper` function handles conversion:

```typescript
import { normalizeAudioForWhisper } from '@reelstack/transcription';

const wavBuffer = normalizeAudioForWhisper(
  ttsResult.audioBuffer,
  ttsResult.format // 'mp3' | 'wav'
);
```

Uses FFmpeg: `-ar 16000 -ac 1 -f wav`

## Step 3: Whisper Transcription

Word-level timestamps via whisper.cpp with `ggml-large-v3-turbo` model:

```typescript
import { transcribeAudio } from '@reelstack/transcription';

const transcription = await transcribeAudio(wavBuffer, {
  language: 'en',
  text: scriptText, // hint for better accuracy
  durationSeconds: duration,
});
// transcription.words: Array<{ text: string, startTime: number, endTime: number }>
```

### Token Merging

whisper.cpp outputs BPE sub-word tokens, not complete words. The transcriber merges them:

- Leading space = new word boundary
- `" C" + "ze" + "ść"` → `"Cześć"`
- Punctuation appends to previous word

## Step 4: Group Words into Cues

Groups individual word timestamps into caption cues suitable for display:

```typescript
import { groupWordsIntoCues } from '@reelstack/transcription';

const cues = groupWordsIntoCues(
  transcription.words,
  {
    maxWordsPerCue: 5,
    maxDurationPerCue: 2.5,
    breakOnPunctuation: true,
  },
  'karaoke'
); // animation style
```

Each cue contains:

```typescript
{
  id: string;
  text: string; // "Deploy faster"
  startTime: number; // 0.5
  endTime: number; // 2.5
  animationStyle: 'karaoke';
  words: [
    { text: 'Deploy', startTime: 0.5, endTime: 1.5 },
    { text: 'faster', startTime: 1.5, endTime: 2.5 },
  ];
}
```

## Step 5: Build ReelProps

Assemble all data into a `ReelProps` object:

```typescript
const props: ReelProps = {
  layout: 'fullscreen',
  voiceoverUrl: '/path/to/audio.mp3',
  cues: cues,
  captionStyle: {
    fontFamily: 'Outfit, sans-serif',
    fontSize: 48,
    fontColor: '#F5F5F0',
    highlightColor: '#F59E0B',
    backgroundColor: '#0E0E12',
    backgroundOpacity: 0.85,
    position: 80,
    // ...
  },
  bRollSegments: [
    /* text cards, color B-roll, etc. */
  ],
  lowerThirds: [
    /* name tags */
  ],
  ctaSegments: [
    /* call-to-action buttons */
  ],
  counters: [
    /* animated numbers */
  ],
  zoomSegments: [
    /* punch-in zoom effects */
  ],
  highlights: [
    /* highlight boxes */
  ],
  showProgressBar: true,
  backgroundColor: '#0E0E12',
};
```

## Step 6: Render

```typescript
import { createRenderer } from '@reelstack/remotion/render';

const renderer = createRenderer();
const result = await renderer.render(props, {
  outputPath: '/tmp/output.mp4',
  compositionId: 'Reel', // or 'YouTubeLongForm'
});
// result.durationMs, result.sizeBytes
```

## API Usage

### Create Reel via API

```bash
curl -X POST https://your-domain.com/api/v1/reel/create \
  -H "Authorization: Bearer sk_live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Deploy faster with self-hosted automation...",
    "layout": "fullscreen",
    "style": "dynamic",
    "tts": {
      "language": "en-US"
    },
    "brandPreset": {
      "highlightColor": "#F59E0B",
      "backgroundColor": "#0E0E12"
    }
  }'
```

Response:

```json
{
  "data": {
    "jobId": "abc-123",
    "status": "queued",
    "creditSource": "daily_limit",
    "pollUrl": "/api/v1/reel/render/abc-123"
  }
}
```

### Poll Status

```bash
curl https://your-domain.com/api/v1/reel/render/abc-123 \
  -H "Authorization: Bearer sk_live_your_api_key"
```

Response:

```json
{
  "data": {
    "id": "abc-123",
    "status": "COMPLETED",
    "progress": 100,
    "outputUrl": "/api/v1/reel/render/abc-123/download"
  }
}
```

### Download

```bash
curl -O https://your-domain.com/api/v1/reel/render/abc-123/download \
  -H "Authorization: Bearer sk_live_your_api_key"
```

## CLI Usage

For local development and testing, use the demo scripts:

```bash
cd packages/remotion

# Simple reel with text cards and transitions
npx tsx scripts/demo-reel-textcards.ts

# Reel with all layers (lower thirds, CTAs, counters)
npx tsx scripts/demo-reel-layers.ts

# Full showcase with all effects
npx tsx scripts/demo-reel-showcase.ts

# Full pipeline: TTS → whisper → karaoke → render
npx tsx scripts/demo-reel-with-voice.ts
```

## Packages

| Package                    | Role                                |
| -------------------------- | ----------------------------------- |
| `@reelstack/tts`           | Text-to-speech providers            |
| `@reelstack/transcription` | whisper.cpp wrapper + word grouping |
| `@reelstack/remotion`      | Remotion compositions + components  |
| `@reelstack/core`          | Shared templates + utilities        |
| `@reelstack/queue`         | Job queue (BullMQ/Redis)            |
| `@reelstack/database`      | Prisma schema + helpers             |
| `@reelstack/types`         | Shared TypeScript types             |
