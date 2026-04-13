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
import { HAILUO_GUIDELINES } from './prompt-guidelines';

const log = createLogger('minimax-tool');

const MINIMAX_BASE = 'https://api.minimax.io/v1';
const JOB_ID_RE = /^[a-zA-Z0-9\-_.~]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

/**
 * MiniMax direct API — Hailuo video generation.
 * https://platform.minimax.io/
 *
 * Requires: MINIMAX_API_KEY
 * Optional: MINIMAX_MODEL (default: video-01-live)
 *
 * Flow: create task → poll query → retrieve download URL from file_id
 */
export class MinimaxVideoTool implements ProductionTool {
  readonly id = 'minimax';
  readonly name = 'MiniMax Hailuo (direct)';
  readonly promptGuidelines = HAILUO_GUIDELINES;
  readonly capabilities: readonly ToolCapability[] = [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 6,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.MINIMAX_API_KEY;
  }

  private get model(): string {
    return process.env.MINIMAX_MODEL ?? 'video-01-live';
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'MINIMAX_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'MINIMAX_API_KEY not set',
      };
    }

    const prompt = request.prompt ?? 'abstract cinematic background';
    const aspectRatio = request.aspectRatio ?? '9:16';

    // MiniMax supports resolution via aspect ratio mapping
    const resolution = aspectRatio === '16:9' ? '1080P' : '720P';

    try {
      const res = await fetch(`${MINIMAX_BASE}/video_generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          duration: 6,
          resolution,
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { status: res.status, errorPreview: errBody.substring(0, 200) },
          'MiniMax generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `MiniMax API error (${res.status})`,
        };
      }

      const data = (await res.json()) as {
        task_id?: string;
        base_resp?: { status_code: number; status_msg: string };
      };

      if (data.base_resp?.status_code !== 0) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: data.base_resp?.status_msg ?? 'MiniMax error',
        };
      }

      if (!data.task_id) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No task_id returned',
        };
      }

      log.info({ taskId: data.task_id }, 'MiniMax video generation started');
      return { jobId: data.task_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ err }, 'MiniMax generate error');
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `MiniMax request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'MINIMAX_API_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(
        `${MINIMAX_BASE}/query/video_generation?task_id=${encodeURIComponent(jobId)}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        }
      );

      if (!res.ok) {
        log.warn({ jobId, status: res.status }, 'MiniMax poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        status?: string;
        file_id?: string;
        base_resp?: { status_code: number; status_msg: string };
      };

      if (data.status === 'Fail') {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: data.base_resp?.status_msg ?? 'MiniMax generation failed',
        };
      }

      if (data.status !== 'Success') {
        // Queueing | Processing
        return { jobId, toolId: this.id, status: 'processing' };
      }

      if (!data.file_id) {
        return { jobId, toolId: this.id, status: 'failed', error: 'No file_id in MiniMax result' };
      }

      // Retrieve download URL
      const fileRes = await fetch(
        `${MINIMAX_BASE}/files/retrieve?file_id=${encodeURIComponent(data.file_id)}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        }
      );

      if (!fileRes.ok) {
        log.warn(
          { jobId, fileId: data.file_id, status: fileRes.status },
          'MiniMax file retrieve failed'
        );
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: `MiniMax file retrieve error (${fileRes.status})`,
        };
      }

      const fileData = (await fileRes.json()) as { file?: { download_url?: string } };
      const url = fileData.file?.download_url;

      if (!url) {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: 'No download_url in MiniMax file response',
        };
      }

      addCost({
        step: `asset:${this.id}`,
        provider: 'minimax',
        type: 'video',
        costUSD: calculateToolCost(this.id, 6),
        inputUnits: 1,
      });
      return { jobId, toolId: this.id, status: 'completed', url, durationSeconds: 6 };
    } catch (err) {
      log.warn({ jobId, err }, 'MiniMax poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}
