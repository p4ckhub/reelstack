import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';
import { createLogger } from '@reelstack/logger';
import { RUNWAY_GUIDELINES } from './prompt-guidelines';

const log = createLogger('runway-tool');

const RUNWAY_BASE = 'https://api.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

/**
 * Runway Gen-4 text-to-video tool.
 *
 * Requires: RUNWAY_API_KEY
 */
export class RunwayTool implements ProductionTool {
  readonly id = 'runway';
  readonly name = 'Runway Gen-4';
  readonly promptGuidelines = RUNWAY_GUIDELINES;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'expensive',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.RUNWAY_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'RUNWAY_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'RUNWAY_API_KEY not set' };
    }

    const ratio = request.aspectRatio === '16:9'
      ? '1280:768'
      : request.aspectRatio === '1:1'
        ? '1024:1024'
        : '768:1280';

    const rawDuration = Math.round((request.durationSeconds ?? 5) / 5) * 5;
    const duration = Math.min(Math.max(5, rawDuration), 10) as 5 | 10;

    try {
      const res = await fetch(`${RUNWAY_BASE}/text_to_video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-Runway-Version': RUNWAY_VERSION,
        },
        body: JSON.stringify({
          promptText: request.prompt ?? 'abstract cinematic background',
          duration,
          ratio,
          model: 'gen4_turbo',
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn({ status: res.status, errorPreview: errBody.substring(0, 200) }, 'runway generate failed');
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Runway API error (${res.status})` };
      }

      const data = (await res.json()) as { id?: string };

      if (!data.id) {
        return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No task id returned' };
      }

      log.info({ taskId: data.id }, 'runway video generation started');

      return { jobId: data.id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ err }, 'runway generate error');
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: `Runway request failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'RUNWAY_API_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(`${RUNWAY_BASE}/tasks/${encodeURIComponent(jobId)}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Runway-Version': RUNWAY_VERSION,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        log.warn({ jobId, status: res.status }, 'runway poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        id?: string;
        status?: string;
        output?: string[] | null;
        failure?: string;
      };

      if (data.status === 'FAILED' || data.status === 'CANCELLED') {
        return { jobId, toolId: this.id, status: 'failed', error: data.failure ?? 'Runway generation failed' };
      }

      if (data.status === 'SUCCEEDED') {
        const url = data.output?.[0];
        if (!url) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No video URL in Runway result' };
        }
        return { jobId, toolId: this.id, status: 'completed', url };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'runway poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

export const runwayTool: ProductionTool = new RunwayTool();
