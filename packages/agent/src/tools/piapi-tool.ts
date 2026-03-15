import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type {
  ToolCapability,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
} from '../types';
import { createLogger } from '@reelstack/logger';
import { SEEDANCE_GUIDELINES, HUNYUAN_GUIDELINES } from './prompt-guidelines';

const log = createLogger('piapi-tool');

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:]+$/;

function validateJobId(jobId: string): boolean {
  return jobId.length > 0 && jobId.length <= 256 && JOB_ID_RE.test(jobId);
}

interface PiapiModelConfig {
  id: string;
  name: string;
  model: string;
  task_type:
    | 'txt2video'
    | 'txt2img'
    | 'imagine'
    | 'video_generation'
    | 'seedance-2-preview'
    | 'seedance-2-fast-preview';
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  parseOutput(data: PiapiTaskData): string | undefined;
}

interface PiapiTaskData {
  status?: string;
  output?: {
    // Image models
    image_url?: string;
    image_urls?: string[];
    // Video models (simple)
    video_url?: string;
    // Seedance 2 output format
    video?: string | { url?: string };
    // Kling output format
    works?: Array<{ resource?: { resource?: string } }>;
  };
  error?: { message?: string };
}

class PiapiTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;

  private readonly model: string;
  private readonly task_type: string;
  private readonly buildInput: (req: AssetGenerationRequest) => Record<string, unknown>;
  private readonly parseOutput: (data: PiapiTaskData) => string | undefined;

  constructor(config: PiapiModelConfig) {
    this.id = config.id;
    this.name = config.name;
    this.model = config.model;
    this.task_type = config.task_type;
    this.capabilities = config.capabilities;
    this.promptGuidelines = config.promptGuidelines;
    this.buildInput = config.buildInput;
    this.parseOutput = config.parseOutput;
  }

  private get apiKey(): string | undefined {
    return process.env.PIAPI_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'PIAPI_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'PIAPI_KEY not set' };
    }

    try {
      const inputPayload = this.buildInput(request);
      const requestBody = {
        model: this.model,
        task_type: this.task_type,
        input: inputPayload,
      };

      const startTime = performance.now();

      log.info(
        {
          toolId: this.id,
          model: this.model,
          taskType: this.task_type,
          prompt: (inputPayload.prompt as string)?.substring(0, 200),
          endpoint: `${PIAPI_BASE}/task`,
        },
        'piapi generate request'
      );

      const res = await fetch(`${PIAPI_BASE}/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
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
          'piapi generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `piapi API error (${res.status})`,
        };
      }

      const data = (await res.json()) as { code?: number; data?: { task_id?: string } };

      if (!data.data?.task_id) {
        log.warn(
          { toolId: this.id, durationMs, responseCode: data.code },
          'piapi returned no task_id'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No task_id returned',
        };
      }

      log.info(
        {
          toolId: this.id,
          taskId: data.data.task_id,
          durationMs,
          model: this.model,
          prompt: (inputPayload.prompt as string)?.substring(0, 200),
        },
        'piapi generation started'
      );

      return { jobId: data.data.task_id, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'piapi generate error');
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `piapi request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: 'PIAPI_KEY not set' };
    }

    if (!validateJobId(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const startTime = performance.now();

      const res = await fetch(`${PIAPI_BASE}/task/${encodeURIComponent(jobId)}`, {
        headers: { 'X-API-Key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status, durationMs }, 'piapi poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const body = (await res.json()) as { data?: PiapiTaskData };
      const taskData = body.data;

      if (!taskData) return { jobId, toolId: this.id, status: 'processing' };

      log.info(
        {
          toolId: this.id,
          jobId,
          taskStatus: taskData.status,
          durationMs,
          hasOutput: !!taskData.output,
          hasError: !!taskData.error,
        },
        'piapi poll response'
      );

      if (taskData.status === 'failed') {
        log.warn(
          {
            toolId: this.id,
            jobId,
            error: taskData.error?.message,
            rawOutput: JSON.stringify(taskData.output ?? null).substring(0, 300),
            rawError: JSON.stringify(taskData.error ?? null).substring(0, 300),
          },
          'piapi poll returned failed status'
        );
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: taskData.error?.message ?? 'piapi generation failed',
        };
      }

      if (taskData.status === 'completed') {
        const url = this.parseOutput(taskData);
        if (!url) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No URL in piapi result' };
        }
        log.info(
          { toolId: this.id, jobId, url: url.substring(0, 100) },
          'piapi generation completed'
        );
        return { jobId, toolId: this.id, status: 'completed', url };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'piapi poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

/** Extract video URL from output.video which can be a string (Seedance 2) or object with url (Hailuo) */
function extractVideoUrl(data: PiapiTaskData): string | undefined {
  const v = data.output?.video;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v.url;
  return data.output?.video_url;
}

// ── Exported instances ────────────────────────────────────────

export const piapiKlingTool: ProductionTool = new PiapiTool({
  id: 'kling-piapi',
  name: 'Kling via piapi.ai',
  model: 'kling',
  task_type: 'video_generation',
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
    negative_prompt: 'blurry, low quality',
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
    mode: 'std',
  }),
  // Kling returns works[].resource.resource
  parseOutput: (data) => data.output?.works?.[0]?.resource?.resource ?? data.output?.video_url,
});

export const piapiSeedanceTool: ProductionTool = new PiapiTool({
  id: 'seedance-piapi',
  name: 'Seedance 2.0 (fast) via piapi.ai',
  model: 'seedance',
  task_type: 'seedance-2-fast-preview',
  promptGuidelines: SEEDANCE_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 15,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: extractVideoUrl,
});

export const piapiHailuoTool: ProductionTool = new PiapiTool({
  id: 'hailuo-piapi',
  name: 'MiniMax Hailuo via piapi.ai',
  model: 'hailuo',
  task_type: 'txt2video',
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 6,
      estimatedLatencyMs: 90_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    model_name: 't2v-01',
    prompt: req.prompt ?? 'abstract cinematic background',
  }),
  parseOutput: extractVideoUrl,
});

export const piapiFluxTool: ProductionTool = new PiapiTool({
  id: 'flux-piapi',
  name: 'FLUX Schnell via piapi.ai',
  model: 'Qubico/flux1-schnell',
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
    width: req.aspectRatio === '16:9' ? 1280 : req.aspectRatio === '1:1' ? 1024 : 720,
    height: req.aspectRatio === '16:9' ? 720 : req.aspectRatio === '1:1' ? 1024 : 1280,
  }),
  parseOutput: (data) => data.output?.image_url ?? data.output?.image_urls?.[0],
});

export const piapiSeedance2Tool: ProductionTool = new PiapiTool({
  id: 'seedance2-piapi',
  name: 'Seedance 2.0 via piapi.ai',
  model: 'seedance',
  task_type: 'seedance-2-preview',
  promptGuidelines: SEEDANCE_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 15,
      estimatedLatencyMs: 150_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    duration: req.durationSeconds ?? 5,
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: extractVideoUrl,
});

export const piapiHunyuanTool: ProductionTool = new PiapiTool({
  id: 'hunyuan-piapi',
  name: 'Hunyuan Video via piapi.ai',
  model: 'Qubico/hunyuan',
  task_type: 'txt2video',
  promptGuidelines: HUNYUAN_GUIDELINES,
  capabilities: [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: false,
      maxDurationSeconds: 5,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'moderate',
    },
  ],
  buildInput: (req) => ({
    prompt: req.prompt ?? 'abstract cinematic background',
    aspect_ratio: req.aspectRatio ?? '9:16',
  }),
  parseOutput: (data) => data.output?.video_url,
});

export const piapiKlingImg2VideoTool: ProductionTool = new PiapiTool({
  id: 'kling-img2video-piapi',
  name: 'Kling Image-to-Video via piapi.ai',
  model: 'kling',
  task_type: 'video_generation',
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
    prompt: req.prompt ?? 'the character is talking',
    image_url: req.imageUrl,
    duration: req.durationSeconds ?? 10,
    aspect_ratio: req.aspectRatio ?? '9:16',
    mode: 'std',
  }),
  parseOutput: (data) => data.output?.works?.[0]?.resource?.resource ?? data.output?.video_url,
});

// Midjourney: discontinued on piapi.ai as of 2026.
// Ideogram v3: not available on piapi.ai — use replicate or direct API.
