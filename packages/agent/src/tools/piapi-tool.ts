/**
 * PIAPI provider tools — config-driven via ProviderTool base class.
 *
 * All PIAPI models (Kling, Seedance, Hailuo, Flux, Hunyuan) are defined
 * as ModelConfig entries and instantiated via createProviderTools().
 */
import type { ProductionTool } from '../registry/tool-interface';
import type { ModelConfig, ProviderConfig } from './provider-tool';
import { createProviderTools } from './provider-tool';
import { SEEDANCE_GUIDELINES, HUNYUAN_GUIDELINES } from './prompt-guidelines';

// ── Provider config ──────────────────────────────────────────

const PIAPI_BASE = 'https://api.piapi.ai/api/v1';

const PIAPI_PROVIDER: ProviderConfig = {
  provider: 'piapi',
  envKey: 'PIAPI_KEY',

  buildAuthHeaders: (apiKey) => ({ 'X-API-Key': apiKey }),

  generateUrl: () => `${PIAPI_BASE}/task`,

  pollUrl: (_model, jobId) => `${PIAPI_BASE}/task/${encodeURIComponent(jobId)}`,

  extractJobId: (body) => {
    const data = body as { data?: { task_id?: string } };
    return data.data?.task_id;
  },

  extractResultUrl: () => undefined, // All models use per-model parseOutput

  extractError: (body) => {
    const data = body as { data?: { error?: { message?: string } } };
    return data.data?.error?.message;
  },

  mapStatus: (providerStatus) => {
    if (providerStatus === 'completed') return 'completed';
    if (providerStatus === 'failed') return 'failed';
    return null;
  },

  wrapBody: (input, model) => ({
    model: model.model,
    task_type: model.meta?.task_type ?? 'txt2video',
    input,
  }),
};

// ── Helper: extract video URL from output.video (string or {url}) ──

function extractVideoUrl(body: Record<string, unknown>): string | undefined {
  const data = body as {
    data?: { output?: { video?: string | { url?: string }; video_url?: string } };
  };
  const v = data.data?.output?.video;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v.url;
  return data.data?.output?.video_url;
}

// ── Model configs ────────────────────────────────────────────

const PIAPI_MODELS: ModelConfig[] = [
  {
    id: 'kling-piapi',
    name: 'Kling via piapi.ai',
    model: 'kling',
    assetType: 'ai-video',
    meta: { task_type: 'video_generation' },
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
    parseOutput: (body) => {
      const data = body as {
        data?: {
          output?: {
            works?: Array<{ resource?: { resource?: string } }>;
            video_url?: string;
          };
        };
      };
      return data.data?.output?.works?.[0]?.resource?.resource ?? data.data?.output?.video_url;
    },
  },
  {
    id: 'kling-img2video-piapi',
    name: 'Kling Image-to-Video via piapi.ai',
    model: 'kling',
    assetType: 'ai-video',
    meta: { task_type: 'video_generation' },
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
    parseOutput: (body) => {
      const data = body as {
        data?: {
          output?: {
            works?: Array<{ resource?: { resource?: string } }>;
            video_url?: string;
          };
        };
      };
      return data.data?.output?.works?.[0]?.resource?.resource ?? data.data?.output?.video_url;
    },
  },
  {
    id: 'seedance-piapi',
    name: 'Seedance 2.0 (fast) via piapi.ai',
    model: 'seedance',
    assetType: 'ai-video',
    meta: { task_type: 'seedance-2-fast-preview' },
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
  },
  {
    id: 'seedance2-piapi',
    name: 'Seedance 2.0 via piapi.ai',
    model: 'seedance',
    assetType: 'ai-video',
    meta: { task_type: 'seedance-2-preview' },
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
  },
  {
    id: 'hunyuan-piapi',
    name: 'Hunyuan Video via piapi.ai',
    model: 'Qubico/hunyuan',
    assetType: 'ai-video',
    meta: { task_type: 'txt2video' },
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
    parseOutput: (body) => {
      const data = body as { data?: { output?: { video_url?: string } } };
      return data.data?.output?.video_url;
    },
  },
  {
    id: 'hailuo-piapi',
    name: 'MiniMax Hailuo via piapi.ai',
    model: 'hailuo',
    assetType: 'ai-video',
    meta: { task_type: 'txt2video' },
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
  },
  {
    id: 'flux-piapi',
    name: 'FLUX Schnell via piapi.ai',
    model: 'Qubico/flux1-schnell',
    assetType: 'ai-image',
    meta: { task_type: 'txt2img' },
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
    parseOutput: (body) => {
      const data = body as { data?: { output?: { image_url?: string; image_urls?: string[] } } };
      return data.data?.output?.image_url ?? data.data?.output?.image_urls?.[0];
    },
  },
];

// ── Create all tools ─────────────────────────────────────────

const allTools = createProviderTools(PIAPI_PROVIDER, PIAPI_MODELS);

// ── Named exports (backward compatibility with tests/imports) ──

function findTool(id: string): ProductionTool {
  const tool = allTools.find((t) => t.id === id);
  if (!tool) throw new Error(`PIAPI tool ${id} not found`);
  return tool;
}

export const piapiKlingTool = findTool('kling-piapi');
export const piapiKlingImg2VideoTool = findTool('kling-img2video-piapi');
export const piapiSeedanceTool = findTool('seedance-piapi');
export const piapiSeedance2Tool = findTool('seedance2-piapi');
export const piapiHunyuanTool = findTool('hunyuan-piapi');
export const piapiHailuoTool = findTool('hailuo-piapi');
export const piapiFluxTool = findTool('flux-piapi');

/** All piapi tools. Import this instead of individual exports in discovery.ts. */
export const allPiapiTools: readonly ProductionTool[] = allTools;

// Midjourney: discontinued on piapi.ai as of 2026.
// Ideogram v3: not available on piapi.ai — use replicate or direct API.
