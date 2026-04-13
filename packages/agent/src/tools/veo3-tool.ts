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
import { VEO3_GUIDELINES } from './prompt-guidelines';

const log = createLogger('veo3-tool');

/**
 * Google Veo 3 video generation tool via Vertex AI.
 * Generates short video clips from text prompts.
 *
 * Requires:
 * - VEO3_API_KEY or GOOGLE_APPLICATION_CREDENTIALS
 * - VEO3_PROJECT_ID (Google Cloud project)
 * - VEO3_LOCATION (default: us-central1)
 */
export class Veo3Tool implements ProductionTool {
  readonly id = 'veo3';
  readonly name = 'Google Veo 3';
  readonly promptGuidelines = VEO3_GUIDELINES;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 8,
      estimatedLatencyMs: 180_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.VEO3_API_KEY;
  }

  private get projectId(): string | undefined {
    return process.env.VEO3_PROJECT_ID;
  }

  private get location(): string {
    return process.env.VEO3_LOCATION ?? 'us-central1';
  }

  private get model(): string {
    return process.env.VEO3_MODEL ?? 'veo-3.0-generate-001';
  }

  private get baseUrl(): string {
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}`;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'VEO3_API_KEY not set' };
    if (!this.projectId) return { available: false, reason: 'VEO3_PROJECT_ID not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey || !this.projectId) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'Veo3 not configured',
      };
    }

    const prompt = request.prompt ?? 'abstract cinematic background';
    const aspectRatio = request.aspectRatio === '16:9' ? '16:9' : '9:16';
    const duration = Math.min(request.durationSeconds ?? 8, 8);

    try {
      const res = await fetch(`${this.baseUrl}:predictLongRunning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio,
            durationSeconds: duration,
            sampleCount: 1,
            personGeneration: 'allow_adult',
            enhancePrompt: true,
            generateAudio: false,
          },
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { status: res.status, errorPreview: errBody.substring(0, 200) },
          'Veo3 generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `Veo3 API error (${res.status})`,
        };
      }

      const data = (await res.json()) as { name?: string };

      if (!data.name) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No operation name returned',
        };
      }

      log.info({ operationName: data.name }, 'Veo3 video generation started');

      return {
        jobId: data.name,
        toolId: this.id,
        status: 'processing',
      };
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `Veo3 request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'VEO3_API_KEY not set' };
    }

    // Validate jobId format (Vertex AI operation name: alphanumeric, hyphens, slashes, no path traversal)
    if (!jobId || jobId.length > 512 || !/^[a-zA-Z0-9\-_/]+$/.test(jobId) || jobId.includes('..')) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const url = `https://${this.location}-aiplatform.googleapis.com/v1/${jobId}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      if (!res.ok) {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as VeoOperationResponse;

      if (data.done) {
        // Extract video URL from the response
        const video = data.response?.generateVideoResponse?.generatedSamples?.[0];
        if (video?.video?.uri) {
          addCost({
            step: `asset:${this.id}`,
            provider: 'veo3',
            model: 'veo-3',
            type: 'video',
            costUSD: calculateToolCost(this.id, 8),
            inputUnits: 1,
          });
          return {
            jobId,
            toolId: this.id,
            status: 'completed',
            url: video.video.uri,
          };
        }

        if (data.error) {
          return {
            jobId,
            toolId: this.id,
            status: 'failed',
            error: `Veo3 error: ${data.error.message ?? data.error.code}`,
          };
        }

        return { jobId, toolId: this.id, status: 'failed', error: 'No video in response' };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'Veo3 poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

interface VeoOperationResponse {
  done?: boolean;
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string };
      }>;
    };
  };
  error?: { code?: number; message?: string };
}
