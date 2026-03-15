import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';
import { NANOBANANA_GUIDELINES, WAN_GUIDELINES, QWEN_IMAGE_GUIDELINES } from './prompt-guidelines';

const log = createLogger('wavespeed-tool');

const WAVESPEED_BASE = 'https://api.wavespeed.ai/api/v3';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

interface WavespeedModelConfig {
  id: string;
  name: string;
  modelSlug: string;
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
}

class WavespeedTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;

  private readonly modelSlug: string;
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;

  constructor(config: WavespeedModelConfig) {
    this.id = config.id;
    this.name = config.name;
    this.modelSlug = config.modelSlug;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.buildInput = config.buildInput;
  }

  private get apiKey(): string | undefined {
    return process.env.WAVESPEED_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'WAVESPEED_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'WAVESPEED_API_KEY not set' };
    }

    try {
      const res = await fetch(`${WAVESPEED_BASE}/${this.modelSlug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildInput(request)),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 200) }, 'wavespeed generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `WaveSpeed API error (${res.status})` };
      }

      const data = (await res.json()) as { data?: { id?: string } };

      if (!data.data?.id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No task id returned' };
      }

      log.info({ toolId: this.id, taskId: data.data.id }, 'wavespeed generation started');

      return { jobId: data.data.id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'wavespeed generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `WaveSpeed request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'WAVESPEED_API_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${WAVESPEED_BASE}/results/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status }, 'wavespeed poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const body = (await res.json()) as {
        data?: {
          status?: string;
          outputs?: string[];
          error?: string;
        };
      };

      const taskData = body.data;
      if (!taskData) return { jobId, toolId: this.id, status: 'processing' };

      if (taskData.status === 'failed') {
        return { jobId, toolId: this.id, status: 'failed', error: taskData.error ?? 'WaveSpeed generation failed' };
      }

      if (taskData.status === 'completed') {
        const url = taskData.outputs?.[0];
        if (!url) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No output URL in WaveSpeed result' };
        }
        return { jobId, toolId: this.id, status: 'completed', url };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'wavespeed poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Exported instances ────────────────────────────────────────

export const wavespeedSeedanceTool: ProductionTool = new WavespeedTool({
  id: 'seedance-wavespeed',
  name: 'Seedance via WaveSpeed',
  modelSlug: 'bytedance/seedance-1-lite-t2v-480p',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 5,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    num_frames: Math.round((req.durationSeconds ?? 5) * 16),
  }),
});

export const wavespeedWanTool: ProductionTool = new WavespeedTool({
  id: 'wan-wavespeed',
  name: 'WAN 2.1 via WaveSpeed',
  modelSlug: 'wavespeed-ai/wan-2.1-t2v-480p',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 5,
      estimatedLatencyMs: 80_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    num_frames: Math.round((req.durationSeconds ?? 5) * 16),
    size: '480x832',
  }),
});

export const wavespeedFluxTool: ProductionTool = new WavespeedTool({
  id: 'flux-wavespeed',
  name: 'FLUX Schnell via WaveSpeed',
  modelSlug: 'black-forest-labs/flux.1-schnell',
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 5_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    image_size: req.aspectRatio === '16:9' ? 'landscape_16_9' : req.aspectRatio === '1:1' ? 'square' : 'portrait_16_9',
    num_inference_steps: 4,
    num_images: 1,
  }),
});

export const wavespeedNanaBananaProTool: ProductionTool = new WavespeedTool({
  id: 'nanobanana-pro-wavespeed',
  name: 'NanoBanana Pro via WaveSpeed',
  modelSlug: 'google/nano-banana-pro/text-to-image',
  promptGuidelines: NANOBANANA_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 20_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    resolution: '1k',
    aspect_ratio: req.aspectRatio ?? '9:16',
    output_format: 'png',
  }),
});

export const wavespeedWan26Tool: ProductionTool = new WavespeedTool({
  id: 'wan26-wavespeed',
  name: 'WAN 2.6 via WaveSpeed',
  modelSlug: 'alibaba/wan-2.6-t2v-720p',
  promptGuidelines: WAN_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 8,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    num_frames: Math.round((req.durationSeconds ?? 5) * 24),
    size: req.aspectRatio === '16:9' ? '1280x720' : '720x1280',
  }),
});

export const wavespeedQwenImageTool: ProductionTool = new WavespeedTool({
  id: 'qwen-image-wavespeed',
  name: 'Qwen Image 2.0 via WaveSpeed',
  modelSlug: 'alibaba/qwen-image-2.0/text-to-image',
  promptGuidelines: QWEN_IMAGE_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 8_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
});
