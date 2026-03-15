import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';
import { IDEOGRAM_GUIDELINES, RECRAFT_GUIDELINES } from './prompt-guidelines';

const log = createLogger('replicate-tool');

const REPLICATE_BASE = 'https://api.replicate.com/v1';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

interface ReplicateModelConfig {
  id: string;
  name: string;
  owner: string;
  model: string;
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  parseOutput(result: unknown): string | undefined;
}

class ReplicateTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;

  private readonly owner: string;
  private readonly model: string;
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
  private readonly parseOutput: (result: unknown) => string | undefined;

  constructor(config: ReplicateModelConfig) {
    this.id = config.id;
    this.name = config.name;
    this.owner = config.owner;
    this.model = config.model;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.buildInput = config.buildInput;
    this.parseOutput = config.parseOutput;
  }

  private get apiKey(): string | undefined {
    return process.env.REPLICATE_API_TOKEN;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'REPLICATE_API_TOKEN not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'REPLICATE_API_TOKEN not set' };
    }

    try {
      const res = await fetch(`${REPLICATE_BASE}/models/${this.owner}/${this.model}/predictions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          Prefer: 'respond-async',
        },
        body: JSON.stringify({ input: this.buildInput(request) }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 200) }, 'replicate generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Replicate API error (${res.status})` };
      }

      const data = (await res.json()) as { id?: string; status?: string };

      if (!data.id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No prediction id returned' };
      }

      log.info({ toolId: this.id, predictionId: data.id }, 'replicate generation started');

      return { jobId: data.id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'replicate generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Replicate request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'REPLICATE_API_TOKEN not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${REPLICATE_BASE}/predictions/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status }, 'replicate poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        id?: string;
        status?: string;
        output?: string | string[] | null;
        error?: string | null;
      };

      if (data.status === 'failed' || data.status === 'canceled') {
        return { jobId, toolId: this.id, status: 'failed', error: data.error ?? 'Replicate generation failed' };
      }

      if (data.status === 'succeeded') {
        const url = this.parseOutput(data.output);
        if (!url) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No URL in Replicate result' };
        }
        return { jobId, toolId: this.id, status: 'completed', url };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'replicate poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

function parseReplicateOutput(result: unknown): string | undefined {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) return result[0] as string | undefined;
  return undefined;
}

// ── Exported instances ────────────────────────────────────────

export const replicateWanTool: ProductionTool = new ReplicateTool({
  id: 'wan-replicate',
  name: 'WAN 2.1 via Replicate',
  owner: 'wan-video',
  model: 'wan-2.1-t2v-480p',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 5,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    num_frames: Math.round((req.durationSeconds ?? 5) * 16),
    fps: 16,
    fast_mode: true,
  }),
  parseOutput: parseReplicateOutput,
});

export const replicateFluxTool: ProductionTool = new ReplicateTool({
  id: 'flux-replicate',
  name: 'FLUX Schnell via Replicate',
  owner: 'black-forest-labs',
  model: 'flux-schnell',
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
    num_outputs: 1,
    output_format: 'webp',
    output_quality: 90,
  }),
  parseOutput: parseReplicateOutput,
});

export const replicateSdxlTool: ProductionTool = new ReplicateTool({
  id: 'sdxl-replicate',
  name: 'SDXL via Replicate',
  owner: 'stability-ai',
  model: 'sdxl',
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 20_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    negative_prompt: 'blurry, low quality, distorted',
    width: req.aspectRatio === '16:9' ? 1280 : req.aspectRatio === '1:1' ? 1024 : 576,
    height: req.aspectRatio === '16:9' ? 720 : req.aspectRatio === '1:1' ? 1024 : 1024,
    num_outputs: 1,
  }),
  parseOutput: parseReplicateOutput,
});

export const replicateIdeogramTool: ProductionTool = new ReplicateTool({
  id: 'ideogram-replicate',
  name: 'Ideogram v3 via Replicate',
  owner: 'ideogram-ai',
  model: 'ideogram-v3-balanced',
  promptGuidelines: IDEOGRAM_GUIDELINES,
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
    aspect_ratio: req.aspectRatio ?? '9:16',
    rendering_speed: 'BALANCED',
  }),
  parseOutput: parseReplicateOutput,
});

export const replicateRecraftTool: ProductionTool = new ReplicateTool({
  id: 'recraft-replicate',
  name: 'Recraft v3 via Replicate',
  owner: 'recraft-ai',
  model: 'recraft-v3',
  promptGuidelines: RECRAFT_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 15_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    size: req.aspectRatio === '16:9' ? '1820x1024' : req.aspectRatio === '1:1' ? '1024x1024' : '1024x1820',
    style: 'realistic_image',
  }),
  parseOutput: parseReplicateOutput,
});

export const replicateFluxProTool: ProductionTool = new ReplicateTool({
  id: 'flux-pro-replicate',
  name: 'FLUX Pro via Replicate',
  owner: 'black-forest-labs',
  model: 'flux-pro',
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
    aspect_ratio: req.aspectRatio ?? '9:16',
    output_format: 'webp',
    output_quality: 90,
    safety_tolerance: 5,
  }),
  parseOutput: parseReplicateOutput,
});
