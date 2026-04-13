/**
 * HeyGen avatar video generation — all API versions in one file.
 *
 * Three variants, one shared health check + polling base:
 * - Studio (v2 API): script-based, nested video_inputs, Avatar III/IV
 * - Agent (v1 API): prompt-based, cinematic Seedance 2.0, cheaper
 * - Avatar V (v3 API): script-based, flat body, latest engine, motion_prompt
 *
 * HeyGen naming: "Avatar III/IV/V" = engine generation, "v1/v2/v3" = API version.
 */
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
import { HEYGEN_GUIDELINES, HEYGEN_AGENT_GUIDELINES } from './prompt-guidelines';

const log = createLogger('heygen-tool');

const HEYGEN_API = 'https://api.heygen.com';

// ── Shared base ─────────────────────────────────────────────

interface HeyGenToolConfig {
  id: string;
  name: string;
  capabilities: ToolCapability[];
  promptGuidelines: string;
  /** Build request body for generate(). */
  buildBody(request: AssetGenerationRequest): Record<string, unknown>;
  /** Generate endpoint path (e.g. "/v2/video/generate"). */
  generatePath: string;
  /** Poll endpoint template. {{id}} is replaced with jobId. */
  pollPath: string;
  /** Extract job ID from generate response. */
  extractJobId(data: Record<string, unknown>): string | undefined;
  /** Extract error message from poll response. */
  extractPollError(data: Record<string, unknown>): string | undefined;
}

class HeyGenBaseTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines: string;

  private readonly config: HeyGenToolConfig;

  constructor(config: HeyGenToolConfig) {
    this.id = config.id;
    this.name = config.name;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.config = config;
  }

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

      if (!res.ok) return { available: false, reason: `HeyGen API returned ${res.status}` };

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

    let body: Record<string, unknown>;
    try {
      body = this.config.buildBody(request);
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Invalid request',
      };
    }

    try {
      log.info({ toolId: this.id, endpoint: this.config.generatePath }, 'HeyGen generate request');

      const res = await fetch(`${HEYGEN_API}${this.config.generatePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { toolId: this.id, status: res.status, errorPreview: errBody.substring(0, 300) },
          'HeyGen generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `HeyGen ${this.id} error (${res.status}): ${errBody.substring(0, 200)}`,
        };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const jobId = this.config.extractJobId(data);

      if (!jobId) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: (data as { error?: string }).error ?? 'No job ID returned',
        };
      }

      log.info({ toolId: this.id, jobId }, 'HeyGen generation started');
      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `HeyGen ${this.id} request failed: ${err instanceof Error ? err.message : 'unknown'}`,
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
      const pollUrl = `${HEYGEN_API}${this.config.pollPath.replace('{{id}}', encodeURIComponent(jobId))}`;

      const res = await fetch(pollUrl, {
        headers: { 'x-api-key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      if (!res.ok) return { jobId, toolId: this.id, status: 'processing' };

      const data = (await res.json()) as {
        data?: {
          status?: string;
          video_url?: string;
          duration?: number;
          error?: string;
          failure_message?: string;
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
          url: data.data?.video_url,
          durationSeconds: data.data?.duration,
        };
      }

      if (status === 'failed') {
        const errMsg =
          this.config.extractPollError(data as Record<string, unknown>) ??
          'HeyGen generation failed';
        return { jobId, toolId: this.id, status: 'failed', error: errMsg };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'HeyGen poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Studio (v2 API) — Avatar III/IV ─────────────────────────

export class HeyGenTool extends HeyGenBaseTool {
  constructor() {
    super({
      id: 'heygen',
      name: 'HeyGen Avatar (Studio)',
      promptGuidelines: HEYGEN_GUIDELINES,
      capabilities: [
        {
          assetType: 'avatar-video',
          supportsPrompt: false,
          supportsScript: true,
          maxDurationSeconds: 300,
          estimatedLatencyMs: 120_000,
          isAsync: true,
          costTier: 'expensive',
        },
      ],
      generatePath: '/v2/video/generate',
      pollPath: '/v2/videos/{{id}}',
      extractJobId: (data) => (data as { data?: { video_id?: string } }).data?.video_id,
      extractPollError: (data) => (data as { data?: { error?: string } }).data?.error,
      buildBody: (request) => {
        if (!request.script) throw new Error('Script is required for HeyGen Studio');

        const avatarId =
          request.avatarId ?? process.env.HEYGEN_AVATAR_ID ?? 'Abigail_expressive_2024112501';
        const voiceId =
          request.voice ?? process.env.HEYGEN_VOICE_ID ?? '0cbf3f0556f74c84abdf598a297ae810';

        const dimension =
          request.aspectRatio === '16:9'
            ? { width: 1920, height: 1080 }
            : request.aspectRatio === '1:1'
              ? { width: 1080, height: 1080 }
              : { width: 1080, height: 1920 };

        const character: Record<string, unknown> = {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal',
          ...request.heygen_character,
        };

        const voice: Record<string, unknown> = {
          type: 'text',
          voice_id: voiceId,
          input_text: request.script,
          ...request.heygen_voice,
        };

        const background = request.heygen_background ?? { type: 'color', value: '#000000' };

        return {
          video_inputs: [{ character, voice, background }],
          dimension,
          test: process.env.HEYGEN_TEST_MODE === 'true',
          ...(request.heygen_remove_background ? { remove_background: true } : {}),
        };
      },
    });
  }
}

// ── Video Agent (v1 API) — prompt-based, Seedance 2.0 ──────

export class HeyGenAgentTool extends HeyGenBaseTool {
  constructor() {
    super({
      id: 'heygen-agent',
      name: 'HeyGen Video Agent',
      promptGuidelines: HEYGEN_AGENT_GUIDELINES,
      capabilities: [
        {
          assetType: 'avatar-video',
          supportsPrompt: true,
          supportsScript: false,
          maxDurationSeconds: 180,
          estimatedLatencyMs: 180_000,
          isAsync: true,
          costTier: 'moderate',
        },
      ],
      generatePath: '/v1/video_agent/generate',
      pollPath: '/v1/video_agent/video_status.get?video_id={{id}}',
      extractJobId: (data) => (data as { data?: { video_id?: string } }).data?.video_id,
      extractPollError: (data) => (data as { data?: { error?: string } }).data?.error,
      buildBody: (request) => {
        if (!request.prompt) throw new Error('Prompt is required for HeyGen Video Agent');

        const avatarId = request.avatarId ?? process.env.HEYGEN_AVATAR_ID;
        const orientation =
          request.aspectRatio === '16:9' || request.aspectRatio === '1:1'
            ? 'landscape'
            : 'portrait';

        return {
          prompt: request.prompt,
          config: {
            ...(avatarId && { avatar_id: avatarId }),
            ...(request.durationSeconds && { duration_sec: Math.max(5, request.durationSeconds) }),
            orientation,
          },
        };
      },
    });
  }
}

// ── Avatar V (v3 API) — latest engine, motion_prompt ────────

export class HeyGenV3Tool extends HeyGenBaseTool {
  constructor() {
    super({
      id: 'heygen-v3',
      name: 'HeyGen Avatar V',
      promptGuidelines: HEYGEN_GUIDELINES,
      capabilities: [
        {
          assetType: 'avatar-video',
          supportsPrompt: false,
          supportsScript: true,
          maxDurationSeconds: 300,
          estimatedLatencyMs: 120_000,
          isAsync: true,
          costTier: 'expensive',
        },
      ],
      generatePath: '/v3/videos',
      pollPath: '/v3/videos/{{id}}',
      extractJobId: (data) => (data as { data?: { id?: string } }).data?.id,
      extractPollError: (data) =>
        (data as { data?: { failure_message?: string } }).data?.failure_message,
      buildBody: (request) => {
        if (!request.script) throw new Error('Script is required for HeyGen Avatar V');

        const avatarId =
          request.avatarId ?? process.env.HEYGEN_AVATAR_V_ID ?? process.env.HEYGEN_AVATAR_ID;
        if (!avatarId)
          throw new Error('No avatar_id. Set HEYGEN_AVATAR_V_ID or pass --avatar <id>.');

        const voiceId = request.voice ?? process.env.HEYGEN_VOICE_ID;

        const body: Record<string, unknown> = {
          type: 'avatar',
          avatar_id: avatarId,
          script: request.script,
          aspect_ratio:
            request.aspectRatio === '16:9'
              ? '16:9'
              : request.aspectRatio === '1:1'
                ? '1:1'
                : '9:16',
          resolution: '1080p',
          ...request.heygen_character,
        };

        if (voiceId) body.voice_id = voiceId;
        if (request.heygen_background) body.background = request.heygen_background;
        if (request.heygen_remove_background) body.remove_background = true;

        return body;
      },
    });
  }
}
