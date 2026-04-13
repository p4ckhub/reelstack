# @reelstack/agent

AI production agent for ReelStack. Turns a script into a fully produced video by:

1. Discovering available tools (Pexels, HeyGen, Veo3, Kling, Seedance, NanoBanana)
2. Planning production with Claude (shot list, effects, layout)
3. Generating assets in parallel with TTS voiceover
4. Assembling and rendering via Remotion

## Public API

```ts
import { produce, produceComposition } from '@reelstack/agent';
```

### `produce(request: ProductionRequest): Promise<ProductionResult>`

Full AI pipeline. Claude plans everything from scratch.

```ts
const result = await produce({
  script: 'Cześć! Dziś pokażę jak zautomatyzować...',
  style: 'dynamic', // 'dynamic' | 'calm' | 'cinematic' | 'educational'
  layout: 'fullscreen', // optional, Claude decides if omitted
  primaryVideoUrl: 'https://...', // optional: skip avatar gen, use this as primary

  tts: {
    provider: 'edge-tts', // 'edge-tts' (free) | 'elevenlabs' | 'openai'
    voice: 'pl-PL-MarekNeural',
    language: 'pl-PL',
  },

  brandPreset: {
    highlightColor: '#FFD700',
    backgroundColor: '#0a0a0a',
    defaultTransition: 'crossfade',
    captionTemplate: { fontFamily: 'Inter', fontSize: 48, fontColor: '#FFFFFF' },
  },

  avatar: {
    avatarId: 'avatar_xyz', // HeyGen avatar ID (optional)
    voice: 'voice_abc',
  },

  outputPath: '/tmp/my-reel.mp4', // optional, defaults to os.tmpdir()
  onProgress: (step) => console.log(step),
});

console.log(result.outputPath); // path to rendered MP4
console.log(result.durationSeconds); // video duration
console.log(result.plan); // ProductionPlan (shots, effects, layout)
console.log(result.steps); // timing breakdown per pipeline step
console.log(result.generatedAssets); // list of generated/fetched assets
```

### `produceComposition(request: ComposeRequest): Promise<ProductionResult>`

Compose mode: user provides all materials, Claude arranges them. No asset generation.

```ts
const result = await produceComposition({
  script: 'Dziś pokażę dashboard...',
  assets: [
    {
      id: 'talking-head',
      url: 'https://storage.example.com/recording.mp4',
      type: 'video',
      description: 'Talking head, mówię do kamery',
      durationSeconds: 45,
      isPrimary: true, // use as primary source
    },
    {
      id: 'dashboard-screenshot',
      url: 'https://storage.example.com/dashboard.png',
      type: 'image',
      description: 'Screenshot dashboardu z wykresami analytics',
    },
  ],

  style: 'educational',
  directorNotes: 'Pokaż dashboard gdy mówię o analytics, wróć do talking head na konkluzję',

  // Option A: generate TTS from script
  tts: { provider: 'edge-tts', language: 'pl-PL' },

  // Option B: existing voiceover (skip TTS)
  existingVoiceoverPath: '/tmp/voiceover.mp3',

  // Option C: existing voiceover + pre-computed cues (skip TTS + Whisper)
  existingVoiceoverPath: '/tmp/voiceover.mp3',
  existingCues: [
    { id: 'c1', text: 'Dziś pokażę', startTime: 0, endTime: 1.2 },
    // ...
  ],

  outputPath: '/tmp/composed.mp4',
  onProgress: (step) => console.log(step),
});
```

## Pipeline Flow

### `produce()` - Full AI Pipeline

```
1. DISCOVER TOOLS (~2s)
   discoverTools() checks env vars -> ToolRegistry.discover() runs healthChecks
   -> ToolManifest (what's available + capabilities + prompt guidelines)

2. PLAN PRODUCTION (~5-10s, Claude API)
   buildPlannerPrompt(manifest) -> Claude -> ProductionPlan (JSON)
   Plan contains: primarySource, shots[], effects[], layout

3. GENERATE ASSETS + TTS (parallel, 1-10 min)
   ├── generateAssets(plan, registry) - fetches/generates each shot's visual
   │   Async tools (Veo3, Seedance, Kling) use pollUntilDone() with exp backoff
   └── runTTSPipeline() - TTS -> normalize -> Whisper -> groupWordsIntoCues

4. ADJUST TIMELINE (instant)
   adjustTimeline(plan, audioDuration) - stretches/compresses shot timestamps

5. ASSEMBLE (instant)
   assembleComposition(plan, assets, cues) -> ReelProps (Remotion props)

6. RENDER (1-3 min, Remotion)
   createRenderer().render(props) -> MP4
```

### `produceComposition()` - Compose Pipeline

```
1. TTS / TRANSCRIBE / USE EXISTING
2. PLAN COMPOSITION (Claude, ~3-5s)
3. ADJUST TIMELINE
4. RESOLVE ASSET IDs -> URLs
5. ASSEMBLE + RENDER
```

## Adding a New Tool

Implement the `ProductionTool` interface:

```ts
// packages/agent/src/tools/mytool-tool.ts
import type { ProductionTool } from '../registry/tool-interface';
import type {
  ToolCapability,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
} from '../types';

export class MyTool implements ProductionTool {
  readonly id = 'mytool';
  readonly name = 'My Tool';

  // REQUIRED: Tell the LLM planner how to write prompts for this tool.
  // Be specific and concrete — vague guidelines produce vague prompts.
  readonly promptGuidelines = `MyTool prompt guidelines:
- Structure: [subject] + [action] + [environment] + [style]
- Good at: ...
- Bad at: ...
- Forbidden words: ...`;

  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-video', // or 'ai-image', 'avatar-video', 'stock-video', etc.
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 120_000,
      isAsync: true, // true = requires poll()
      costTier: 'moderate', // 'free' | 'cheap' | 'moderate' | 'expensive'
    },
  ];

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!process.env.MYTOOL_API_KEY) return { available: false, reason: 'MYTOOL_API_KEY not set' };
    // optionally ping the API
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    // Submit generation job
    // Return { jobId, toolId: this.id, status: 'processing' }
    // or { jobId, toolId: this.id, status: 'failed', error: '...' }
  }

  // Only needed if isAsync: true
  async poll(jobId: string): Promise<AssetGenerationStatus> {
    // Return completed with url, or processing, or failed
  }
}
```

Then register in `packages/agent/src/registry/discovery.ts`:

```ts
if (process.env.MYTOOL_API_KEY) {
  tools.push(new MyTool());
}
```

That's it. The tool will be auto-discovered, included in the LLM manifest, and its `promptGuidelines` will appear in the planner prompt.

## Tool Reference

| Tool ID       | Class          | Asset type     | Async | Env var                                  |
| ------------- | -------------- | -------------- | ----- | ---------------------------------------- |
| `pexels`      | PexelsTool     | stock-video    | no    | `PEXELS_API_KEY`                         |
| `user-upload` | UserUploadTool | user-recording | no    | (always)                                 |
| `heygen`      | HeyGenTool     | avatar-video   | yes   | `HEYGEN_API_KEY`                         |
| `veo3`        | Veo3Tool       | ai-video       | yes   | `VEO3_API_KEY` + `VEO3_PROJECT_ID`       |
| `kling`       | KlingTool      | ai-video       | yes   | `KLING_API_KEY`                          |
| `seedance`    | SeedanceTool   | ai-video       | yes   | `SEEDANCE_API_KEY`                       |
| `nanobanana`  | NanoBananaTool | ai-image       | no    | `NANOBANANA_API_KEY` or `GEMINI_API_KEY` |

## Prompt Writing Guidelines

Each tool has `promptGuidelines` that are injected into the LLM planner prompt **only if the tool is available**. This keeps the prompt lean — if Veo3 isn't configured, its guidelines don't appear.

Guidelines are written based on each tool's API documentation and prompting research. See the vault notes for source material:

- `vault/brands/_shared/reference/video-prompting-seedance.md` - Seedance 2.0 framework
- `vault/brands/_shared/reference/json-prompting-image-generation.md` - NanoBanana JSON schema
- `vault/brands/_shared/automation/b-roll-video-generation.md` - Veo 3.1 patterns

## Available Effects (for the LLM planner)

Defined in `packages/agent/src/planner/prompt-builder.ts` as `EFFECT_CATALOG`:

| Effect type            | Description                       |
| ---------------------- | --------------------------------- |
| `emoji-popup`          | Animated emoji overlay            |
| `text-emphasis`        | Bold text flash                   |
| `screen-shake`         | Camera shake/jitter               |
| `color-flash`          | Fullscreen color flash            |
| `glitch-transition`    | RGB split + scanlines             |
| `subscribe-banner`     | Subscribe CTA banner              |
| `circular-counter`     | Animated progress counter         |
| `png-overlay`          | Static image overlay              |
| `gif-overlay`          | Animated GIF overlay              |
| `blur-background`      | Blur background with overlay      |
| `parallax-screenshot`  | 3D perspective tilt/scroll        |
| `split-screen-divider` | Split screen with glowing divider |

## Key Files

| File                                          | What it does                                                       |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `src/index.ts`                                | Public API exports                                                 |
| `src/types.ts`                                | All interfaces (ProductionRequest, ProductionPlan, ShotPlan, etc.) |
| `src/registry/tool-interface.ts`              | ProductionTool interface                                           |
| `src/registry/tool-registry.ts`               | Registry: register, discover, getToolManifest                      |
| `src/registry/discovery.ts`                   | Auto-discover tools from env vars                                  |
| `src/planner/production-planner.ts`           | Claude API call, structured JSON output                            |
| `src/planner/prompt-builder.ts`               | Builds dynamic system prompt with tool manifest + effects          |
| `src/orchestrator/production-orchestrator.ts` | Main pipeline: produce() + produceComposition()                    |
| `src/orchestrator/asset-generator.ts`         | Parallel asset generation with polling                             |
| `src/orchestrator/composition-assembler.ts`   | ProductionPlan + assets -> ReelProps                               |
| `src/orchestrator/timeline-adjuster.ts`       | Stretch/compress shot timestamps to match TTS duration             |
| `src/polling.ts`                              | Generic async polling with exponential backoff                     |
| `src/errors.ts`                               | AgentError, PlanningError, GenerationError                         |
