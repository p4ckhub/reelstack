import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';
import { KLING_GUIDELINES, VEO3_GUIDELINES, SORA_GUIDELINES } from './prompt-guidelines';

const log = createLogger('aimlapi-tool');

const AIMLAPI_BASE = 'https://api.aimlapi.com';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

// ── Kling video tool ──────────────────────────────────────────

/**
 * Kling via AIML API (video generation with polling).
 *
 * Requires: AIMLAPI_KEY
 */
export class AimlapiKlingTool implements ProductionTool {
  readonly id = 'kling-aimlapi';
  readonly name = 'Kling via AIML API';
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 180_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.AIMLAPI_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'AIMLAPI_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'AIMLAPI_KEY not set' };
    }

    const duration = String(Math.min(Math.max(5, request.durationSeconds ?? 5), 10));
    const ratio = request.aspectRatio ?? '9:16';

    try {
      const res = await fetch(`${AIMLAPI_BASE}/v2/generate/video/kling/generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'kling-video-v1.6-pro',
          prompt: request.prompt ?? 'abstract cinematic background',
          duration,
          ratio,
          mode: 'std',
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ status: res.status, errorPreview: errBody.substring(0, 200) }, 'aimlapi kling generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `AIMLAPI error (${res.status})` };
      }

      const data = (await res.json()) as { id?: string };

      if (!data.id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No generation id returned' };
      }

      log.info({ generationId: data.id }, 'aimlapi kling generation started');

      return { jobId: data.id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ err }, 'aimlapi kling generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `AIMLAPI request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'AIMLAPI_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const url = new URL(`${AIMLAPI_BASE}/v2/generate/video/kling/generation`);
      url.searchParams.set('generation_id', jobId);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ jobId, status: res.status }, 'aimlapi kling poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        status?: string;
        video?: { url?: string };
      };

      if (data.status === 'failed') {
        return { jobId, toolId: this.id, status: 'failed', error: 'AIMLAPI Kling generation failed' };
      }

      if (data.status === 'completed') {
        const videoUrl = data.video?.url;
        if (!videoUrl) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No video URL in AIMLAPI result' };
        }
        return { jobId, toolId: this.id, status: 'completed', url: videoUrl };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'aimlapi kling poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── FLUX image tool (synchronous) ────────────────────────────

/**
 * FLUX Schnell via AIML API (synchronous image generation).
 *
 * Requires: AIMLAPI_KEY
 */
export class AimlapiFluxTool implements ProductionTool {
  readonly id = 'flux-aimlapi';
  readonly name = 'FLUX via AIML API';
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 10_000,
      isAsync: false,
      costTier: 'cheap',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.AIMLAPI_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'AIMLAPI_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'AIMLAPI_KEY not set' };
    }

    const imageSize = request.aspectRatio === '16:9'
      ? 'landscape_16_9'
      : request.aspectRatio === '1:1'
        ? 'square'
        : 'portrait_16_9';

    try {
      const res = await fetch(`${AIMLAPI_BASE}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'flux/schnell',
          prompt: request.prompt ?? 'abstract background',
          image_size: imageSize,
          num_inference_steps: 4,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ status: res.status, errorPreview: errBody.substring(0, 200) }, 'aimlapi flux generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `AIMLAPI error (${res.status})` };
      }

      const data = (await res.json()) as { data?: Array<{ url?: string }> };
      const url = data.data?.[0]?.url;

      if (!url) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No image URL in AIMLAPI response' };
      }

      log.info('aimlapi flux image generated');

      return { jobId: randomUUID(), toolId: this.id, status: 'completed', url };
    } catch (err) {
      log.warn({ err }, 'aimlapi flux generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `AIMLAPI request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }
}

export const aimlapiKlingTool: ProductionTool = new AimlapiKlingTool();
export const aimlapiFluxTool: ProductionTool = new AimlapiFluxTool();

// ── Generic async video tool ──────────────────────────────────

interface AimlapiVideoConfig {
  id: string;
  name: string;
  modelId: string;
  provider: string; // used in endpoint: /v2/generate/video/{provider}/generation
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildBody(req: AssetGenerationRequest): Record<string, unknown>;
}

class AimlapiVideoTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;
  private readonly provider: string;
  private readonly buildBody: (req: AssetGenerationRequest) => Record<string, unknown>;

  constructor(config: AimlapiVideoConfig) {
    this.id = config.id;
    this.name = config.name;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.provider = config.provider;
    this.buildBody = config.buildBody;
  }

  private get apiKey(): string | undefined { return process.env.AIMLAPI_KEY; }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'AIMLAPI_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'AIMLAPI_KEY not set' };
    }
    try {
      const res = await fetch(`${AIMLAPI_BASE}/v2/generate/video/${this.provider}/generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(this.buildBody(request)),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 200) }, 'aimlapi video generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `AIMLAPI error (${res.status})` };
      }
      const data = (await res.json()) as { id?: string };
      if (!data.id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No generation id returned' };
      }
      log.info({ toolId: this.id, generationId: data.id }, 'aimlapi video generation started');
      return { jobId: data.id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'aimlapi video generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `AIMLAPI request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) return { jobId, toolId: this.id, status: 'failed', error: 'AIMLAPI_KEY not set' };
    if (!validateJobId(jobId)) return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    try {
      const url = new URL(`${AIMLAPI_BASE}/v2/generate/video/${this.provider}/generation`);
      url.searchParams.set('generation_id', jobId);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status }, 'aimlapi video poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }
      const data = (await res.json()) as { status?: string; video?: { url?: string } };
      if (data.status === 'failed') return { jobId, toolId: this.id, status: 'failed', error: 'AIMLAPI generation failed' };
      if (data.status === 'completed') {
        const videoUrl = data.video?.url;
        if (!videoUrl) return { jobId, toolId: this.id, status: 'failed', error: 'No video URL in result' };
        return { jobId, toolId: this.id, status: 'completed', url: videoUrl };
      }
      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'aimlapi video poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

export const aimlapiKlingV3Tool: ProductionTool = new AimlapiVideoTool({
  id: 'kling-v3-aimlapi',
  name: 'Kling v3 Pro via AIML API',
  modelId: 'klingai/video-v3-pro-text-to-video',
  provider: 'kling',
  promptGuidelines: KLING_GUIDELINES,
  capabilities: [
    { assetType: 'ai-video', supportsPrompt: true, supportsScript: false, maxDurationSeconds: 10, estimatedLatencyMs: 180_000, isAsync: true, costTier: 'moderate' },
  ],
  buildBody: (req) => ({
    model: 'klingai/video-v3-pro-text-to-video',
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: String(Math.min(req.durationSeconds ?? 5, 10)),
    ratio: req.aspectRatio ?? '9:16',
    mode: 'pro',
  }),
});

export const aimlapiVeo3Tool: ProductionTool = new AimlapiVideoTool({
  id: 'veo3-aimlapi',
  name: 'Veo 3 via AIML API',
  modelId: 'google/veo3',
  provider: 'google',
  promptGuidelines: VEO3_GUIDELINES,
  capabilities: [
    { assetType: 'ai-video', supportsPrompt: true, supportsScript: false, maxDurationSeconds: 8, estimatedLatencyMs: 300_000, isAsync: true, costTier: 'expensive' },
  ],
  buildBody: (req) => ({
    model: 'google/veo3',
    prompt: req.prompt ?? 'abstract cinematic background',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
});

export const aimlapiSora2Tool: ProductionTool = new AimlapiVideoTool({
  id: 'sora2-aimlapi',
  name: 'Sora 2 via AIML API',
  modelId: 'sora-2-t2v',
  provider: 'openai',
  promptGuidelines: SORA_GUIDELINES,
  capabilities: [
    { assetType: 'ai-video', supportsPrompt: true, supportsScript: false, maxDurationSeconds: 10, estimatedLatencyMs: 300_000, isAsync: true, costTier: 'expensive' },
  ],
  buildBody: (req) => ({
    model: 'sora-2-t2v',
    prompt: req.prompt ?? 'abstract cinematic background',
    aspect_ratio: req.aspectRatio ?? '9:16',
    duration: req.durationSeconds ?? 5,
  }),
});

export const aimlapiPixverseTool: ProductionTool = new AimlapiVideoTool({
  id: 'pixverse-aimlapi',
  name: 'Pixverse v5.5 via AIML API',
  modelId: 'pixverse/v5-5-text-to-video',
  provider: 'pixverse',
  capabilities: [
    { assetType: 'ai-video', supportsPrompt: true, supportsScript: false, maxDurationSeconds: 8, estimatedLatencyMs: 120_000, isAsync: true, costTier: 'moderate' },
  ],
  buildBody: (req) => ({
    model: 'pixverse/v5-5-text-to-video',
    prompt: req.prompt ?? 'abstract cinematic background',
    aspect_ratio: req.aspectRatio ?? '9:16',
    duration: req.durationSeconds ?? 5,
  }),
});
