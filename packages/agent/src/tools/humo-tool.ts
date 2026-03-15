import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('humo-tool');

/**
 * HuMo 1.7B via self-hosted RunPod serverless endpoint.
 *
 * Generates a lip-synced talking avatar video from a portrait image + audio.
 * The RunPod handler (projects/humo-runpod/) runs HuMo 1.7B and uploads
 * the result to R2.
 *
 * env vars:
 *   RUNPOD_API_KEY          RunPod API key
 *   HUMO_RUNPOD_ENDPOINT_ID RunPod serverless endpoint ID (e.g. abc123xyz)
 *   HUMO_DEFAULT_IMAGE_URL  Fallback portrait image when avatarId not provided
 */

const RUNPOD_BASE = 'https://api.runpod.ai/v2';

// Regex for RunPod endpoint IDs and job IDs - alphanumeric + hyphens
const SAFE_ID_RE = /^[a-zA-Z0-9\-]+$/;

function safeId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && SAFE_ID_RE.test(id);
}

interface RunPodJobResponse {
  id?: string;
  status?: string;
  error?: string;
}

interface RunPodStatusResponse {
  id?: string;
  status?: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;
  output?: {
    video_url?: string;
    duration_seconds?: number;
    error?: string;
  };
  error?: string;
}

export class HumoTool implements ProductionTool {
  readonly id = 'humo';
  readonly name = 'HuMo 1.7B (self-hosted RunPod)';

  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'avatar-video',
      supportsPrompt: true,
      supportsScript: true,
      maxDurationSeconds: 4,
      estimatedLatencyMs: 480_000, // ~8 min
      isAsync: true,
      costTier: 'cheap',
    },
  ];

  readonly promptGuidelines = `
HuMo 1.7B is a ByteDance talking-avatar model.
- Input: portrait image + audio (generated from script internally)
- Output: ~4 second lip-synced video at 480p
- Best for: single speaker, close-up or half-body portrait
- Prompt: describe scene mood, lighting, background — NOT the person's appearance
- Keep prompt under 100 words
- Example: "natural studio lighting, soft bokeh background, professional and engaging"
`.trim();

  private get apiKey(): string | undefined {
    return process.env.RUNPOD_API_KEY;
  }

  private get endpointId(): string | undefined {
    return process.env.HUMO_RUNPOD_ENDPOINT_ID;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'RUNPOD_API_KEY not set' };
    if (!this.endpointId) return { available: false, reason: 'HUMO_RUNPOD_ENDPOINT_ID not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey || !this.endpointId) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'RUNPOD_API_KEY or HUMO_RUNPOD_ENDPOINT_ID not set' };
    }

    // avatarId doubles as image URL for this tool
    const imageUrl = request.avatarId ?? process.env.HUMO_DEFAULT_IMAGE_URL;
    if (!imageUrl) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No image URL: set avatarId in request or HUMO_DEFAULT_IMAGE_URL env var' };
    }

    if (!request.script && !request.prompt) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'script or prompt is required' };
    }

    const body = {
      input: {
        image_url: imageUrl,
        script: request.script ?? request.prompt,
        prompt: request.prompt ?? 'natural lighting, engaging presentation',
        resolution: '480',
      },
    };

    try {
      const res = await fetch(`${RUNPOD_BASE}/${this.endpointId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        log.warn({ status: res.status, errPreview: errText.substring(0, 200) }, 'humo runpod submit failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `RunPod API error (${res.status})` };
      }

      const data = (await res.json()) as RunPodJobResponse;

      if (!data.id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No job ID returned from RunPod' };
      }

      log.info({ runpodJobId: data.id }, 'HuMo job submitted to RunPod');
      return { jobId: data.id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ err }, 'humo generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `RunPod request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey || !this.endpointId) {
      return { jobId, toolId: this.id, status: 'failed', error: 'RUNPOD_API_KEY or HUMO_RUNPOD_ENDPOINT_ID not set' };
    }

    if (!safeId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${RUNPOD_BASE}/${this.endpointId}/status/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ jobId, status: res.status }, 'humo poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as RunPodStatusResponse;

      if (data.status === 'FAILED' || data.status === 'CANCELLED') {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: data.output?.error ?? data.error ?? 'HuMo job failed on RunPod',
        };
      }

      if (data.status === 'COMPLETED') {
        const videoUrl = data.output?.video_url;
        if (!videoUrl) {
          return { jobId, toolId: this.id, status: 'failed', error: 'COMPLETED but no video_url in output' };
        }
        return {
          jobId,
          toolId: this.id,
          status: 'completed',
          url: videoUrl,
          durationSeconds: data.output?.duration_seconds,
        };
      }

      // IN_QUEUE | IN_PROGRESS
      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'humo poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

export const humoTool: ProductionTool = new HumoTool();
