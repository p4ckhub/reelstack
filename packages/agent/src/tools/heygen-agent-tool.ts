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
import { HEYGEN_AGENT_GUIDELINES } from './prompt-guidelines';

const log = createLogger('heygen-agent-tool');

const HEYGEN_API = 'https://api.heygen.com';

/**
 * HeyGen Video Agent tool — prompt-driven cinematic video generation.
 *
 * Uses /v1/video_agent/generate (NOT /v2/video/generate like HeyGenTool).
 * Seedance 2.0 is automatically applied — no separate toggle.
 *
 * Key differences from HeyGenTool (Studio Video):
 * - Prompt-based: describe what you want, AI decides shots/cuts/B-roll
 * - Cinematic output with Seedance 2.0 under the hood
 * - Less control (no manual scene composition) but higher quality motion
 * - Cost: $0.0333/sec (~$2/min) vs Studio $0.15/sec
 *
 * Use HeyGenTool when you need precise control over scenes.
 * Use HeyGenAgentTool when you want cinematic quality from a prompt.
 */
export class HeyGenAgentTool implements ProductionTool {
  readonly id = 'heygen-agent';
  readonly name = 'HeyGen Video Agent';
  readonly promptGuidelines = HEYGEN_AGENT_GUIDELINES;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'avatar-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 180,
      estimatedLatencyMs: 180_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.HEYGEN_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'HEYGEN_API_KEY not set' };

    try {
      const res = await fetch(`${HEYGEN_API}/v2/user/remaining_quota`, {
        headers: { 'x-api-key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      if (!res.ok) {
        return { available: false, reason: `HeyGen API returned ${res.status}` };
      }

      const data = (await res.json()) as { data?: { remaining_quota?: number } };
      const quota = data.data?.remaining_quota;

      if (quota !== undefined && quota <= 0) {
        return { available: false, reason: 'HeyGen quota exhausted' };
      }

      return { available: true };
    } catch (err) {
      return { available: false, reason: `HeyGen unreachable: ${err}` };
    }
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'HEYGEN_API_KEY not set',
      };
    }

    if (!request.prompt) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'Prompt is required for Video Agent generation',
      };
    }

    const avatarId = request.avatarId ?? process.env.HEYGEN_AVATAR_ID;
    const orientation =
      request.aspectRatio === '16:9' || request.aspectRatio === '1:1' ? 'landscape' : 'portrait';

    const body: Record<string, unknown> = {
      prompt: request.prompt,
      config: {
        ...(avatarId && { avatar_id: avatarId }),
        ...(request.durationSeconds && { duration_sec: Math.max(5, request.durationSeconds) }),
        orientation,
      },
    };

    try {
      const res = await fetch(`${HEYGEN_API}/v1/video_agent/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { status: res.status, errorPreview: errBody.substring(0, 300) },
          'HeyGen Video Agent generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `HeyGen Video Agent error (${res.status}): ${errBody.substring(0, 200)}`,
        };
      }

      const data = (await res.json()) as { data?: { video_id?: string }; error?: string };

      if (!data.data?.video_id) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: data.error ?? 'No video_id returned',
        };
      }

      log.info(
        { videoId: data.data.video_id, orientation, avatarId },
        'HeyGen Video Agent generation started'
      );

      return { jobId: data.data.video_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `HeyGen Video Agent request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'HEYGEN_API_KEY not set' };
    }

    if (!jobId || jobId.length > 256 || !/^[a-zA-Z0-9\-_]+$/.test(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const res = await fetch(
        `${HEYGEN_API}/v1/video_agent/video_status.get?video_id=${encodeURIComponent(jobId)}`,
        {
          headers: { 'x-api-key': this.apiKey },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        }
      );

      if (!res.ok) {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as {
        data?: {
          status?: string;
          video_url?: string;
          duration?: number;
          error?: string;
        };
      };

      const status = data.data?.status;

      if (status === 'completed') {
        addCost({
          step: `asset:${this.id}`,
          provider: 'heygen',
          type: 'video',
          costUSD: calculateToolCost(this.id, data.data?.duration ?? 5),
          inputUnits: 1,
        });
        return {
          jobId,
          toolId: this.id,
          status: 'completed',
          url: data.data!.video_url,
          durationSeconds: data.data!.duration,
        };
      }

      if (status === 'failed') {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: data.data?.error ?? 'HeyGen Video Agent generation failed',
        };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ jobId, err }, 'HeyGen Video Agent poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}
