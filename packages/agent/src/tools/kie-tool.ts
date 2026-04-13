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
import { SEEDANCE_GUIDELINES, NANOBANANA_GUIDELINES, VEO3_GUIDELINES } from './prompt-guidelines';

const log = createLogger('kie-tool');

const KIE_BASE = 'https://api.kie.ai/api/v1';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

interface KieRecordData {
  taskId?: string;
  model?: string;
  state?: string; // 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
  resultJson?: string; // JSON string: {"resultUrls": ["https://..."]}
  failCode?: string | null;
  failMsg?: string | null;
  costTime?: number;
  progress?: number;
}

interface KieModelConfig {
  id: string;
  name: string;
  model: string;
  task_type: 'txt2video' | 'txt2img';
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  /** Self-declared pricing (used by calculateToolCost instead of static table) */
  pricing?: { perRequest?: number; perSecond?: number };
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  /** Custom endpoint path (default: /api/v1/jobs/createTask) */
  endpoint?: string;
  /** If true, buildInput returns the full body (not wrapped in {model, task_type, input}) */
  rawBody?: boolean;
}

function parseResultUrl(data: KieRecordData): string | undefined {
  if (!data.resultJson) return undefined;
  try {
    const parsed = JSON.parse(data.resultJson) as { resultUrls?: string[] };
    return parsed.resultUrls?.[0];
  } catch {
    return undefined;
  }
}

class KieTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;
  readonly pricing?: { perRequest?: number; perSecond?: number };

  private readonly model: string;
  private readonly task_type: 'txt2video' | 'txt2img';
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
  private readonly endpoint: string;
  private readonly rawBody: boolean;

  constructor(config: KieModelConfig) {
    this.id = config.id;
    this.name = config.name;
    this.model = config.model;
    this.task_type = config.task_type;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.pricing = config.pricing;
    this.buildInput = config.buildInput;
    this.endpoint = config.endpoint ?? '/api/v1/jobs/createTask';
    this.rawBody = config.rawBody ?? false;
  }

  private get apiKey(): string | undefined {
    return process.env.KIE_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'KIE_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'KIE_API_KEY not set',
      };
    }

    try {
      const inputPayload = this.buildInput(request);
      const requestBody = this.rawBody
        ? inputPayload
        : { model: this.model, task_type: this.task_type, input: inputPayload };

      const startTime = performance.now();
      const url = `https://api.kie.ai${this.endpoint}`;

      log.info(
        {
          toolId: this.id,
          model: this.model,
          taskType: this.task_type,
          prompt: (inputPayload.prompt as string)?.substring(0, 200),
          endpoint: url,
        },
        'kie generate request'
      );

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          {
            toolId: this.id,
            status: res.status,
            durationMs,
            errorBody: errBody.substring(0, 500),
          },
          'kie generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `kie.ai API error (${res.status})`,
        };
      }

      const data = (await res.json()) as {
        code?: number;
        data?: { taskId?: string };
        message?: string;
      };

      if (!data.data?.taskId) {
        log.warn(
          {
            toolId: this.id,
            durationMs,
            responseCode: data.code,
            message: data.message,
            dataKeys: data.data ? Object.keys(data.data) : 'null',
          },
          'kie returned no taskId'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: data.message ?? 'No taskId returned',
        };
      }

      log.info(
        {
          toolId: this.id,
          taskId: data.data.taskId,
          durationMs,
          model: this.model,
          prompt: (inputPayload.prompt as string)?.substring(0, 200),
        },
        'kie generation started'
      );

      return { jobId: data.data.taskId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'kie generate error');
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `kie.ai request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'KIE_API_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const startTime = performance.now();

      const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(jobId)}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status, durationMs }, 'kie poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const body = (await res.json()) as { code?: number; data?: KieRecordData };
      const taskData = body.data;

      if (!taskData) return { jobId, toolId: this.id, status: 'processing' };

      log.info(
        {
          toolId: this.id,
          jobId,
          state: taskData.state,
          progress: taskData.progress,
          costTime: taskData.costTime,
          durationMs,
          failCode: taskData.failCode,
          failMsg: taskData.failMsg,
        },
        'kie poll response'
      );

      if (taskData.state === 'fail') {
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: taskData.failMsg ?? 'kie.ai generation failed',
        };
      }

      if (taskData.state === 'success') {
        const url = parseResultUrl(taskData);
        if (!url) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No URL in kie.ai result' };
        }
        // costTime is API processing time (ms), NOT video duration.
        // Use requested duration from buildInput or default 5s for pricing.
        const estimatedDuration = 5;
        addCost({
          step: `asset:${this.id}`,
          provider: 'kie',
          model: this.model,
          type: this.task_type === 'txt2img' ? 'image' : 'video',
          costUSD: calculateToolCost(this.id, estimatedDuration),
          inputUnits: 1,
          durationMs: taskData.costTime,
        });
        log.info(
          { toolId: this.id, jobId, url: url.substring(0, 100), processingMs: taskData.costTime },
          'kie generation completed'
        );
        return { jobId, toolId: this.id, status: 'completed', url };
      }

      // waiting, queuing, generating
      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'kie poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Exported instances ────────────────────────────────────────

export const kieKlingTool: ProductionTool = new KieTool({
  id: 'kling-kie',
  name: 'Kling 3.0 via kie.ai',
  model: 'kling-3.0/video',
  task_type: 'txt2video',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 10,
      estimatedLatencyMs: 180_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: String(Math.min(Math.max(req.durationSeconds ?? 5, 3), 15)),
    aspect_ratio: req.aspectRatio ?? '9:16',
    mode: 'std',
    multi_shots: false,
    sound: false,
  }),
});

export const kieSeedanceTool: ProductionTool = new KieTool({
  id: 'seedance-kie',
  name: 'Seedance 1.5 Pro via kie.ai',
  model: 'bytedance/seedance-1.5-pro',
  task_type: 'txt2video',
  promptGuidelines: SEEDANCE_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 12,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => {
    // Seedance 1.5 Pro accepts duration as string: "4", "8", "12"
    const dur = req.durationSeconds ?? 5;
    const validDurations = [4, 8, 12];
    const closest = validDurations.reduce((prev, curr) =>
      Math.abs(curr - dur) < Math.abs(prev - dur) ? curr : prev
    );
    return {
      prompt: req.prompt ?? 'abstract cinematic background',
      duration: String(closest),
      aspect_ratio: req.aspectRatio ?? '9:16',
      resolution: '720p',
    };
  },
});

export const kieWanTool: ProductionTool = new KieTool({
  id: 'wan-kie',
  name: 'WAN 2.6 via kie.ai',
  model: 'wan/2-6-text-to-video',
  task_type: 'txt2video',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 5,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
});

export const kieFluxTool: ProductionTool = new KieTool({
  id: 'flux-kie',
  name: 'FLUX Schnell via kie.ai',
  model: 'flux-schnell',
  task_type: 'txt2img',
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 10_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
});

export const kieSeedanceImg2VideoTool: ProductionTool = new KieTool({
  id: 'seedance-img2video-kie',
  name: 'Seedance 1.5 Pro Image-to-Video via kie.ai',
  model: 'bytedance/seedance-1.5-pro',
  task_type: 'txt2video',
  promptGuidelines: SEEDANCE_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 12,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => {
    const dur = req.durationSeconds ?? 8;
    const validDurations = [4, 8, 12];
    const closest = validDurations.reduce((prev, curr) =>
      Math.abs(curr - dur) < Math.abs(prev - dur) ? curr : prev
    );
    return {
      prompt: req.prompt ?? 'animated character talking',
      ...(req.imageUrl ? { image_url: req.imageUrl } : {}),
      duration: String(closest),
      aspect_ratio: req.aspectRatio ?? '9:16',
      resolution: '720p',
    };
  },
});

export const kieSeedance2Tool: ProductionTool = new KieTool({
  id: 'seedance2-kie',
  name: 'Seedance 2.0 via kie.ai',
  model: 'bytedance/seedance-2',
  task_type: 'txt2video',
  promptGuidelines: SEEDANCE_GUIDELINES,
  pricing: { perSecond: 0.205 },
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 15,
      estimatedLatencyMs: 600_000,
      isAsync: true,
      costTier: 'expensive',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: Math.min(Math.max(req.durationSeconds ?? 5, 3), 15),
    aspect_ratio: req.aspectRatio ?? '9:16',
    resolution: '720p',
    ...(req.imageUrl ? { first_frame_url: req.imageUrl } : {}),
    ...(req.referenceImageUrl ? { reference_image_urls: [req.referenceImageUrl] } : {}),
    ...(req.audioUrl ? { reference_audio_urls: [req.audioUrl] } : {}),
  }),
});

export const kieSeedance2FastTool: ProductionTool = new KieTool({
  id: 'seedance2-fast-kie',
  name: 'Seedance 2.0 Fast via kie.ai',
  model: 'bytedance/seedance-2-fast',
  task_type: 'txt2video',
  promptGuidelines: SEEDANCE_GUIDELINES,
  pricing: { perSecond: 0.165 },
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 15,
      estimatedLatencyMs: 300_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: Math.min(Math.max(req.durationSeconds ?? 5, 3), 15),
    aspect_ratio: req.aspectRatio ?? '9:16',
    resolution: '720p',
    ...(req.imageUrl ? { first_frame_url: req.imageUrl } : {}),
    ...(req.audioUrl ? { reference_audio_urls: [req.audioUrl] } : {}),
  }),
});

export const kieNanaBanana2Tool: ProductionTool = new KieTool({
  id: 'nanobanana2-kie',
  name: 'NanoBanana 2 via kie.ai',
  model: 'nano-banana-2',
  task_type: 'txt2img',
  promptGuidelines: NANOBANANA_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 30_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract background',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
});

// ── Veo 3.1 via KIE (dedicated /veo/generate endpoint) ─────

function buildVeoInput(req: AssetGenerationRequest, model: string): Record<string, unknown> {
  return {
    prompt: req.prompt ?? 'abstract cinematic background',
    model,
    aspect_ratio: req.aspectRatio ?? '9:16',
    generationType: req.imageUrl ? 'FIRST_AND_LAST_FRAMES_2_VIDEO' : 'TEXT_2_VIDEO',
    ...(req.imageUrl ? { imageUrls: [req.imageUrl] } : {}),
  };
}

export const kieVeo31LiteTool: ProductionTool = new KieTool({
  id: 'veo31-lite-kie',
  name: 'Veo 3.1 Lite via kie.ai',
  model: 'veo3_lite',
  task_type: 'txt2video',
  endpoint: '/api/v1/veo/generate',
  rawBody: true,
  promptGuidelines: VEO3_GUIDELINES,
  pricing: { perRequest: 0.15 },
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 8,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => buildVeoInput(req, 'veo3_lite'),
});

export const kieVeo31FastTool: ProductionTool = new KieTool({
  id: 'veo31-fast-kie',
  name: 'Veo 3.1 Fast via kie.ai',
  model: 'veo3_fast',
  task_type: 'txt2video',
  endpoint: '/api/v1/veo/generate',
  rawBody: true,
  promptGuidelines: VEO3_GUIDELINES,
  pricing: { perRequest: 0.5 },
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 8,
      estimatedLatencyMs: 180_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => buildVeoInput(req, 'veo3_fast'),
});

export const kieVeo31QualityTool: ProductionTool = new KieTool({
  id: 'veo31-quality-kie',
  name: 'Veo 3.1 Quality via kie.ai',
  model: 'veo3',
  task_type: 'txt2video',
  endpoint: '/api/v1/veo/generate',
  rawBody: true,
  promptGuidelines: VEO3_GUIDELINES,
  pricing: { perRequest: 1.0 },
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 8,
      estimatedLatencyMs: 300_000,
      isAsync: true,
      costTier: 'expensive',
    },
  ],
  buildInput: (req) => buildVeoInput(req, 'veo3'),
});

// ── All KIE tools (for discovery) ───────────────────────────

/** All KIE tools. Import this instead of individual exports in discovery.ts. */
export const allKieTools: readonly ProductionTool[] = [
  kieKlingTool,
  kieSeedance2Tool,
  kieSeedance2FastTool,
  kieSeedanceTool,
  kieSeedanceImg2VideoTool,
  kieWanTool,
  kieFluxTool,
  kieNanaBanana2Tool,
  kieVeo31LiteTool,
  kieVeo31FastTool,
  kieVeo31QualityTool,
];
