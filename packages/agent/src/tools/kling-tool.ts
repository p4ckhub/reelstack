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
import { KLING_GUIDELINES } from './prompt-guidelines';

const log = createLogger('kling-tool');

const KLING_API = 'https://api.klingai.com';

/**
 * Kling AI video generation tool.
 * Generates short AI video clips from text prompts.
 *
 * Requires: KLING_API_KEY
 * Optional: KLING_MODEL (default: kling-v2.1-master)
 */
export class KlingTool implements ProductionTool {
  readonly id = 'kling';
  readonly name = 'Kling AI Video';
  readonly promptGuidelines = KLING_GUIDELINES;
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
    return process.env.KLING_API_KEY;
  }

  private get model(): string {
    return process.env.KLING_MODEL ?? 'kling-v2.1-master';
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'KLING_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'KLING_API_KEY not set',
      };
    }

    const prompt = request.prompt ?? 'abstract cinematic background';
    const duration = Math.min(request.durationSeconds ?? 5, 10);
    const aspectRatio =
      request.aspectRatio === '16:9' ? '16:9' : request.aspectRatio === '1:1' ? '1:1' : '9:16';

    try {
      const res = await fetch(`${KLING_API}/v1/videos/text2video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model_name: this.model,
          prompt,
          duration: String(duration),
          aspect_ratio: aspectRatio,
          mode: 'std',
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { status: res.status, errorPreview: errBody.substring(0, 200) },
          'Kling generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `Kling API error (${res.status})`,
        };
      }

      const data = (await res.json()) as {
        data?: { task_id?: string };
        code?: number;
        message?: string;
      };

      if (!data.data?.task_id) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: data.message ?? 'No task_id returned',
        };
      }

      log.info({ taskId: data.data.task_id }, 'Kling video generation started');

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
        error: `Kling request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'KLING_API_KEY not set' };
    }

    if (!jobId || jobId.length > 256 || !/^[a-zA-Z0-9\-_]+$/.test(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${KLING_API}/v1/videos/text2video/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      if (!res.ok) {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as KlingTaskResponse;
      const task = data.data;

      if (!task) return { jobId, toolId: this.id, status: 'processing' };

      if (task.task_status === 'succeed') {
        const videoUrl = task.task_result?.videos?.[0]?.url;
        if (videoUrl) {
          addCost({
            step: `asset:${this.id}`,
            provider: 'kling',
            model: 'kling-3.0',
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
          error: task.task_status_msg ?? 'Kling generation failed',
        };
      }

      // submitted / processing
      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'Kling poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

interface KlingTaskResponse {
  data?: {
    task_id: string;
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{
        url: string;
        duration?: number;
      }>;
    };
  };
}
