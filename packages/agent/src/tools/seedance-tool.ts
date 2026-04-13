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
import { isPublicUrl } from '../utils/url-validation';
import { SEEDANCE_GUIDELINES } from './prompt-guidelines';

const log = createLogger('seedance-tool');

const SEEDANCE_API = 'https://api.seedance.ai';

/**
 * Seedance (ByteDance) video generation tool.
 * Generates AI video clips from text prompts.
 *
 * Requires: SEEDANCE_API_KEY
 * Optional: SEEDANCE_MODEL (default: seedance-1.0)
 *
 * Note: Seedance API may be accessed through third-party providers.
 * Set SEEDANCE_API_BASE to override the base URL if using a proxy.
 */
export class SeedanceTool implements ProductionTool {
  readonly id = 'seedance';
  readonly name = 'Seedance Video';
  readonly promptGuidelines = SEEDANCE_GUIDELINES;
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
    return process.env.SEEDANCE_API_KEY;
  }

  private get apiBase(): string {
    const base = process.env.SEEDANCE_API_BASE ?? SEEDANCE_API;
    if (!isPublicUrl(base)) {
      log.warn({ base }, 'Blocked non-public SEEDANCE_API_BASE');
      return SEEDANCE_API;
    }
    return base;
  }

  private get model(): string {
    return process.env.SEEDANCE_MODEL ?? 'seedance-1.0';
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'SEEDANCE_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'SEEDANCE_API_KEY not set',
      };
    }

    const prompt = request.prompt ?? 'abstract cinematic background';
    const duration = Math.min(request.durationSeconds ?? 5, 10);
    const aspectRatio =
      request.aspectRatio === '16:9' ? '16:9' : request.aspectRatio === '1:1' ? '1:1' : '9:16';

    try {
      const res = await fetch(`${this.apiBase}/v1/videos/text2video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          duration,
          aspect_ratio: aspectRatio,
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { status: res.status, errorPreview: errBody.substring(0, 200) },
          'Seedance generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `Seedance API error (${res.status})`,
        };
      }

      const data = (await res.json()) as { data?: { task_id?: string }; message?: string };

      if (!data.data?.task_id) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: data.message ?? 'No task_id returned',
        };
      }

      log.info({ taskId: data.data.task_id }, 'Seedance video generation started');

      return {
        jobId: data.data.task_id,
        toolId: this.id,
        status: 'processing',
      };
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `Seedance request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'SEEDANCE_API_KEY not set' };
    }

    if (!jobId || jobId.length > 256 || !/^[a-zA-Z0-9\-_]+$/.test(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${this.apiBase}/v1/videos/text2video/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      if (!res.ok) {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        data?: {
          task_status: string;
          task_result?: { videos?: Array<{ url: string; duration?: number }> };
          error_msg?: string;
        };
      };

      const task = data.data;
      if (!task) return { jobId, toolId: this.id, status: 'processing' };

      if (task.task_status === 'succeed' || task.task_status === 'completed') {
        const videoUrl = task.task_result?.videos?.[0]?.url;
        if (videoUrl) {
          addCost({
            step: `asset:${this.id}`,
            provider: 'seedance',
            model: 'seedance',
            type: 'video',
            costUSD: calculateToolCost(this.id, 5),
            inputUnits: 1,
          });
          return {
            jobId,
            toolId: this.id,
            status: 'completed',
            url: videoUrl,
            durationSeconds: task.task_result?.videos?.[0]?.duration,
          };
        }
        return { jobId, toolId: this.id, status: 'failed', error: 'No video URL in result' };
      }

      if (task.task_status === 'failed') {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: task.error_msg ?? 'Seedance generation failed',
        };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'Seedance poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}
