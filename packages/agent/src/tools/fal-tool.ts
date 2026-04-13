import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type {
  ToolCapability,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
} from '../types';
import { createLogger } from '@reelstack/logger';
import { addCost } from '../context';
import { calculateToolCost } from '../config/pricing';
import {
  NANOBANANA_GUIDELINES,
  IDEOGRAM_GUIDELINES,
  RECRAFT_GUIDELINES,
  FLUX_GUIDELINES,
  SEEDREAM_GUIDELINES,
  PIKA_GUIDELINES,
  LTX_GUIDELINES,
  LUMA_GUIDELINES,
} from './prompt-guidelines';

const log = createLogger('fal-tool');

const FAL_QUEUE_BASE = 'https://queue.fal.run';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

// ── FalTool class (unchanged) ─────────────────────────────────

interface FalModelConfig {
  id: string;
  name: string;
  modelId: string;
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  parseOutput(result: unknown): { url?: string; durationSeconds?: number };
}

class FalTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;

  private readonly modelId: string;
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
  private readonly parseOutput: (result: unknown) => { url?: string; durationSeconds?: number };

  constructor(config: FalModelConfig) {
    this.id = config.id;
    this.name = config.name;
    this.modelId = config.modelId;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.buildInput = config.buildInput;
    this.parseOutput = config.parseOutput;
  }

  private get apiKey(): string | undefined {
    return process.env.FAL_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'FAL_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'FAL_KEY not set' };
    }

    try {
      const res = await fetch(`${FAL_QUEUE_BASE}/${this.modelId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildInput(request)),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 200) },
          'fal generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `fal API error (${res.status})`,
        };
      }

      const data = (await res.json()) as { request_id?: string };

      if (!data.request_id) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No request_id returned',
        };
      }

      log.info({ toolId: this.id, requestId: data.request_id }, 'fal generation started');

      return { jobId: data.request_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'fal generate error');
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `fal request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'FAL_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const statusRes = await fetch(
        `${FAL_QUEUE_BASE}/${this.modelId}/requests/${encodeURIComponent(jobId)}/status`,
        {
          headers: { Authorization: `Key ${this.apiKey}` },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        }
      );

      if (!statusRes.ok) {
        log.warn({ toolId: this.id, jobId, status: statusRes.status }, 'fal status check failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const statusData = (await statusRes.json()) as { status?: string; error?: { msg?: string } };

      if (statusData.status === 'FAILED') {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: statusData.error?.msg ?? 'fal generation failed',
        };
      }

      if (statusData.status !== 'COMPLETED') {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      // Fetch result
      const resultRes = await fetch(
        `${FAL_QUEUE_BASE}/${this.modelId}/requests/${encodeURIComponent(jobId)}`,
        {
          headers: { Authorization: `Key ${this.apiKey}` },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        }
      );

      if (!resultRes.ok) {
        log.warn({ toolId: this.id, jobId, status: resultRes.status }, 'fal result fetch failed');
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: `fal result error (${resultRes.status})`,
        };
      }

      const result = await resultRes.json();
      const parsed = this.parseOutput(result);

      if (!parsed.url) {
        return { jobId, toolId: this.id, status: 'failed', error: 'No URL in fal result' };
      }

      addCost({
        step: `asset:${this.id}`,
        provider: 'fal',
        model: this.id,
        type: 'video',
        costUSD: calculateToolCost(this.id, parsed.durationSeconds),
        inputUnits: 1,
      });
      return {
        jobId,
        toolId: this.id,
        status: 'completed',
        url: parsed.url,
        durationSeconds: parsed.durationSeconds,
      };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'fal poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Output parsers ────────────────────────────────────────────

const videoOutput = (result: unknown) => {
  const r = result as { video?: { url?: string; duration?: number } };
  return { url: r.video?.url, durationSeconds: r.video?.duration };
};

const imageOutput = (result: unknown) => {
  const r = result as { images?: Array<{ url?: string }> };
  return { url: r.images?.[0]?.url };
};

// ── Input builders ────────────────────────────────────────────

const clampDuration = (dur: number | undefined, min: number, max: number) =>
  dur != null ? Math.min(Math.max(min, dur), max) : min;

const falImageSize = (aspectRatio: string | undefined) =>
  aspectRatio === '16:9' ? 'landscape_16_9' : aspectRatio === '1:1' ? 'square' : 'portrait_16_9';

/** Standard video: prompt + duration (clamped) + aspect_ratio */
const videoInput =
  (maxDur = 10, extra?: Record<string, unknown>) =>
  (req: AssetGenerationRequest) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: clampDuration(req.durationSeconds, 5, maxDur),
    aspect_ratio: req.aspectRatio ?? '9:16',
    ...extra,
  });

/** Image-to-video: adds image_url (falls back to referenceImageUrl for character consistency) */
const img2videoInput =
  (maxDur = 10) =>
  (req: AssetGenerationRequest) => ({
    prompt: req.prompt ?? 'the character is talking',
    image_url: req.imageUrl ?? req.referenceImageUrl,
    duration: clampDuration(req.durationSeconds, 5, maxDur),
    aspect_ratio: req.aspectRatio ?? '9:16',
  });

/** Image with image_size (mapped from aspect ratio) */
const imageInputSized = (extra?: Record<string, unknown>) => (req: AssetGenerationRequest) => ({
  prompt: req.prompt ?? 'abstract background',
  image_size: falImageSize(req.aspectRatio),
  ...extra,
});

/** Image with aspect_ratio (direct) */
const imageInputAR = (extra?: Record<string, unknown>) => (req: AssetGenerationRequest) => ({
  prompt: req.prompt ?? 'abstract background',
  aspect_ratio: req.aspectRatio ?? '9:16',
  ...extra,
});

// ── Model catalog ─────────────────────────────────────────────
//
// Adding a new fal.ai model = one entry here. Zero other changes needed.
// The `id` must be unique and is used in fallback orders (asset-generator.ts).

interface FalModelEntry {
  id: string;
  name: string;
  modelId: string;
  kind: 'video' | 'image';
  costTier: 'cheap' | 'moderate' | 'expensive';
  latencyMs: number;
  maxDurationSeconds?: number;
  promptGuidelines?: string;
  buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
}

const FAL_MODEL_CATALOG: FalModelEntry[] = [
  // ── Video: Kling V3 ──
  {
    id: 'kling-fal',
    name: 'Kling 3.0 Pro via fal.ai',
    modelId: 'fal-ai/kling-video/v3/pro/text-to-video',
    kind: 'video',
    costTier: 'moderate',
    latencyMs: 180_000,
    maxDurationSeconds: 10,
    buildInput: videoInput(10),
  },
  {
    id: 'kling-std-fal',
    name: 'Kling 3.0 Standard via fal.ai',
    modelId: 'fal-ai/kling-video/v3/standard/text-to-video',
    kind: 'video',
    costTier: 'cheap',
    latencyMs: 120_000,
    maxDurationSeconds: 10,
    buildInput: videoInput(10),
  },
  {
    id: 'kling-img2video-fal',
    name: 'Kling 3.0 Pro Image-to-Video via fal.ai',
    modelId: 'fal-ai/kling-video/v3/pro/image-to-video',
    kind: 'video',
    costTier: 'moderate',
    latencyMs: 180_000,
    maxDurationSeconds: 10,
    buildInput: img2videoInput(10),
  },
  {
    id: 'kling-std-img2video-fal',
    name: 'Kling 3.0 Standard Image-to-Video via fal.ai',
    modelId: 'fal-ai/kling-video/v3/standard/image-to-video',
    kind: 'video',
    costTier: 'cheap',
    latencyMs: 120_000,
    maxDurationSeconds: 10,
    buildInput: img2videoInput(10),
  },

  // ── Video: Kling O3 (Omni — best for character consistency) ──
  {
    id: 'kling-o3-std-fal',
    name: 'Kling O3 Standard via fal.ai',
    modelId: 'fal-ai/kling-video/o3/standard/image-to-video',
    kind: 'video',
    costTier: 'moderate',
    latencyMs: 150_000,
    maxDurationSeconds: 10,
    buildInput: (req) => ({
      prompt: req.prompt ?? 'the character is talking naturally',
      image_url: req.imageUrl ?? req.referenceImageUrl,
      duration: clampDuration(req.durationSeconds, 5, 10),
      aspect_ratio: req.aspectRatio ?? '9:16',
    }),
  },

  // ── Video: Seedance ──
  {
    id: 'seedance-fal',
    name: 'Seedance via fal.ai',
    modelId: 'fal-ai/seedance-1-pro',
    kind: 'video',
    costTier: 'moderate',
    latencyMs: 120_000,
    maxDurationSeconds: 10,
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      duration_seconds: req.durationSeconds ?? 5,
      aspect_ratio: req.aspectRatio ?? '9:16',
    }),
  },

  // ── Video: Hailuo (MiniMax) ──
  {
    id: 'hailuo-fal',
    name: 'MiniMax Hailuo via fal.ai',
    modelId: 'fal-ai/minimax/video-01-live',
    kind: 'video',
    costTier: 'moderate',
    latencyMs: 120_000,
    maxDurationSeconds: 6,
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
    }),
  },

  // ── Video: WAN ──
  {
    id: 'wan-fal',
    name: 'WAN 2.1 via fal.ai',
    modelId: 'fal-ai/wan-t2v-1.3b',
    kind: 'video',
    costTier: 'cheap',
    latencyMs: 90_000,
    maxDurationSeconds: 5,
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      num_frames: Math.round((req.durationSeconds ?? 5) * 16),
      resolution: '480p',
    }),
  },

  // ── Video: Pika ──
  {
    id: 'pika22-fal',
    name: 'Pika 2.2 via fal.ai',
    modelId: 'fal-ai/pika/v2.2/text-to-video',
    kind: 'video',
    costTier: 'moderate',
    latencyMs: 120_000,
    maxDurationSeconds: 10,
    promptGuidelines: PIKA_GUIDELINES,
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      duration: req.durationSeconds != null ? (req.durationSeconds <= 5 ? 5 : 10) : 5,
      aspect_ratio: req.aspectRatio ?? '9:16',
      resolution: '720p',
    }),
  },

  // ── Video: LTX ──
  {
    id: 'ltx23-fal',
    name: 'LTX-2.3 via fal.ai',
    modelId: 'fal-ai/ltx-2.3/text-to-video',
    kind: 'video',
    costTier: 'cheap',
    latencyMs: 60_000,
    maxDurationSeconds: 10,
    promptGuidelines: LTX_GUIDELINES,
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      negative_prompt: 'blurry, low quality, distorted, flickering, worst quality',
      duration: req.durationSeconds ?? 5,
      aspect_ratio: req.aspectRatio ?? '9:16',
    }),
  },

  // ── Video: Luma Dream Machine ──
  {
    id: 'luma-fal',
    name: 'Luma Dream Machine via fal.ai',
    modelId: 'fal-ai/luma-dream-machine',
    kind: 'video',
    costTier: 'moderate',
    latencyMs: 150_000,
    maxDurationSeconds: 10,
    promptGuidelines: LUMA_GUIDELINES,
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      duration: req.durationSeconds != null ? (req.durationSeconds <= 5 ? '5s' : '10s') : '5s',
      aspect_ratio: req.aspectRatio ?? '9:16',
    }),
  },

  // ── Image: FLUX ──
  {
    id: 'flux-fal',
    name: 'FLUX Schnell via fal.ai',
    modelId: 'fal-ai/flux/schnell',
    kind: 'image',
    costTier: 'cheap',
    latencyMs: 8_000,
    buildInput: imageInputSized({ num_inference_steps: 4 }),
  },
  {
    id: 'flux-pro-fal',
    name: 'FLUX Pro via fal.ai',
    modelId: 'fal-ai/flux-pro',
    kind: 'image',
    costTier: 'moderate',
    latencyMs: 20_000,
    promptGuidelines: FLUX_GUIDELINES,
    buildInput: imageInputSized({ num_inference_steps: 28, safety_tolerance: '5' }),
  },
  {
    id: 'flux-dev-fal',
    name: 'FLUX Dev via fal.ai',
    modelId: 'fal-ai/flux/dev',
    kind: 'image',
    costTier: 'moderate',
    latencyMs: 20_000,
    promptGuidelines: FLUX_GUIDELINES,
    buildInput: imageInputSized({ num_inference_steps: 28, guidance_scale: 3.5 }),
  },

  // ── Image: Imagen 4 ──
  {
    id: 'imagen4-fal',
    name: 'Google Imagen 4 via fal.ai',
    modelId: 'fal-ai/imagen4/preview',
    kind: 'image',
    costTier: 'moderate',
    latencyMs: 15_000,
    buildInput: imageInputAR({ safety_filter_level: 'block_only_high' }),
  },

  // ── Image: NanoBanana ──
  {
    id: 'nanobanana2-fal',
    name: 'NanoBanana 2 via fal.ai',
    modelId: 'fal-ai/nano-banana-2',
    kind: 'image',
    costTier: 'cheap',
    latencyMs: 6_000,
    promptGuidelines: NANOBANANA_GUIDELINES,
    buildInput: imageInputSized(),
  },
  {
    id: 'nanobanana-pro-fal',
    name: 'NanoBanana Pro via fal.ai',
    modelId: 'fal-ai/nano-banana-pro',
    kind: 'image',
    costTier: 'moderate',
    latencyMs: 20_000,
    promptGuidelines: NANOBANANA_GUIDELINES,
    buildInput: imageInputSized(),
  },

  // ── Image: Ideogram ──
  {
    id: 'ideogram-fal',
    name: 'Ideogram v3 via fal.ai',
    modelId: 'fal-ai/ideogram/v3',
    kind: 'image',
    costTier: 'moderate',
    latencyMs: 12_000,
    promptGuidelines: IDEOGRAM_GUIDELINES,
    buildInput: imageInputAR({ rendering_speed: 'TURBO' }),
  },

  // ── Image: Recraft ──
  {
    id: 'recraft-fal',
    name: 'Recraft v3 via fal.ai',
    modelId: 'fal-ai/recraft-v3',
    kind: 'image',
    costTier: 'moderate',
    latencyMs: 15_000,
    promptGuidelines: RECRAFT_GUIDELINES,
    buildInput: imageInputSized({ style: 'realistic_image' }),
  },

  // ── Image: Stable Diffusion 3.5 ──
  {
    id: 'sd35-fal',
    name: 'Stable Diffusion 3.5 via fal.ai',
    modelId: 'fal-ai/stable-diffusion-v3-5-large',
    kind: 'image',
    costTier: 'cheap',
    latencyMs: 25_000,
    buildInput: imageInputSized({
      negative_prompt: 'blurry, low quality, distorted, text, watermark',
      num_inference_steps: 28,
      cfg_scale: 4.5,
    }),
  },

  // ── Image: Seedream 4.5 ──
  {
    id: 'seedream45-fal',
    name: 'Seedream 4.5 via fal.ai',
    modelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    kind: 'image',
    costTier: 'cheap',
    latencyMs: 5_000,
    promptGuidelines: SEEDREAM_GUIDELINES,
    buildInput: imageInputAR(),
  },
];

// ── Factory: catalog → ProductionTool[] ───────────────────────

function createToolFromEntry(entry: FalModelEntry): ProductionTool {
  const cap: ToolCapability = {
    assetType: entry.kind === 'video' ? 'ai-video' : 'ai-image',
    supportsPrompt: true,
    supportsScript: false,
    estimatedLatencyMs: entry.latencyMs,
    isAsync: true,
    costTier: entry.costTier,
    ...(entry.maxDurationSeconds != null ? { maxDurationSeconds: entry.maxDurationSeconds } : {}),
  };

  return new FalTool({
    id: entry.id,
    name: entry.name,
    modelId: entry.modelId,
    capabilities: [cap],
    promptGuidelines: entry.promptGuidelines,
    buildInput: entry.buildInput,
    parseOutput: entry.kind === 'video' ? videoOutput : imageOutput,
  });
}

/**
 * All fal.ai tools, auto-generated from FAL_MODEL_CATALOG.
 * Used by discovery.ts: `if (FAL_KEY) tools.push(...falTools)`
 */
export const falTools: ProductionTool[] = FAL_MODEL_CATALOG.map(createToolFromEntry);

/**
 * Look up a specific fal tool by ID.
 * Useful for tests or explicit references.
 */
export function getFalTool(id: string): ProductionTool | undefined {
  return falTools.find((t) => t.id === id);
}
