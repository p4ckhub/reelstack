/**
 * AIML API tools — config-driven via ProviderTool base class.
 *
 * Two API patterns:
 *   1) Video (async): POST /v2/generate/video/{provider}/generation, poll with ?generation_id=
 *   2) Image (sync):  POST /v1/images/generations, result in response
 */
import type { ProviderConfig, ModelConfig } from './provider-tool';
import { createProviderTools } from './provider-tool';
import { KLING_GUIDELINES, VEO3_GUIDELINES, SORA_GUIDELINES } from './prompt-guidelines';
import type { ProductionTool } from '../registry/tool-interface';

const AIMLAPI_BASE = 'https://api.aimlapi.com';

// ── Provider config: video (async polling) ──────────────────

const aimlapiVideoProvider: ProviderConfig = {
  provider: 'aimlapi',
  envKey: 'AIMLAPI_KEY',
  buildAuthHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  generateUrl: (model) =>
    `${AIMLAPI_BASE}/v2/generate/video/${model.meta!.providerSlug}/generation`,
  pollUrl: (model, jobId) => {
    const url = new URL(`${AIMLAPI_BASE}/v2/generate/video/${model.meta!.providerSlug}/generation`);
    url.searchParams.set('generation_id', jobId);
    return url.toString();
  },
  extractJobId: (body) => (body as { id?: string }).id,
  extractResultUrl: (body) => {
    const data = body as { video?: { url?: string } };
    return data.video?.url;
  },
  extractError: (body) => {
    const err = (body as { error?: string }).error;
    return err ?? undefined;
  },
  mapStatus: (status) => {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    return null;
  },
};

// ── Provider config: image (synchronous) ────────────────────

const aimlapiImageProvider: ProviderConfig = {
  provider: 'aimlapi',
  envKey: 'AIMLAPI_KEY',
  buildAuthHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  generateUrl: () => `${AIMLAPI_BASE}/v1/images/generations`,
  // Image tools are synchronous — pollUrl/extractJobId/mapStatus unused but required by interface
  pollUrl: () => '',
  extractJobId: () => undefined,
  extractResultUrl: () => undefined,
  extractError: () => undefined,
  mapStatus: () => null,
};

// ── Model configs ───────────────────────────────────────────

const aimlapiModels: ModelConfig[] = [
  // Kling v1.6 Pro
  {
    id: 'kling-aimlapi',
    name: 'Kling via AIML API',
    model: 'kling-aimlapi',
    assetType: 'ai-video',
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
    meta: { providerSlug: 'kling' },
    buildInput: (req) => ({
      model: 'kling-video-v1.6-pro',
      prompt: req.prompt ?? 'abstract cinematic background',
      duration: String(Math.min(Math.max(5, req.durationSeconds ?? 5), 10)),
      ratio: req.aspectRatio ?? '9:16',
      mode: 'std',
    }),
  },

  // Kling v3 Pro
  {
    id: 'kling-v3-aimlapi',
    name: 'Kling v3 Pro via AIML API',
    model: 'kling-v3-aimlapi',
    assetType: 'ai-video',
    promptGuidelines: KLING_GUIDELINES,
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
    meta: { providerSlug: 'kling' },
    buildInput: (req) => ({
      model: 'klingai/video-v3-pro-text-to-video',
      prompt: req.prompt ?? 'abstract cinematic background',
      duration: String(Math.min(req.durationSeconds ?? 5, 10)),
      ratio: req.aspectRatio ?? '9:16',
      mode: 'pro',
    }),
  },

  // Veo 3
  {
    id: 'veo3-aimlapi',
    name: 'Veo 3 via AIML API',
    model: 'veo3-aimlapi',
    assetType: 'ai-video',
    promptGuidelines: VEO3_GUIDELINES,
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
    meta: { providerSlug: 'google' },
    buildInput: (req) => ({
      model: 'google/veo3',
      prompt: req.prompt ?? 'abstract cinematic background',
      aspect_ratio: req.aspectRatio ?? '9:16',
    }),
  },

  // Sora 2
  {
    id: 'sora2-aimlapi',
    name: 'Sora 2 via AIML API',
    model: 'sora2-aimlapi',
    assetType: 'ai-video',
    promptGuidelines: SORA_GUIDELINES,
    capabilities: [
      {
        assetType: 'ai-video',
        supportsPrompt: true,
        supportsScript: false,
        maxDurationSeconds: 10,
        estimatedLatencyMs: 300_000,
        isAsync: true,
        costTier: 'expensive',
      },
    ],
    meta: { providerSlug: 'openai' },
    buildInput: (req) => ({
      model: 'sora-2-t2v',
      prompt: req.prompt ?? 'abstract cinematic background',
      aspect_ratio: req.aspectRatio ?? '9:16',
      duration: req.durationSeconds ?? 5,
    }),
  },

  // Pixverse v5.5
  {
    id: 'pixverse-aimlapi',
    name: 'Pixverse v5.5 via AIML API',
    model: 'pixverse-aimlapi',
    assetType: 'ai-video',
    capabilities: [
      {
        assetType: 'ai-video',
        supportsPrompt: true,
        supportsScript: false,
        maxDurationSeconds: 8,
        estimatedLatencyMs: 120_000,
        isAsync: true,
        costTier: 'moderate',
      },
    ],
    meta: { providerSlug: 'pixverse' },
    buildInput: (req) => ({
      model: 'pixverse/v5-5-text-to-video',
      prompt: req.prompt ?? 'abstract cinematic background',
      aspect_ratio: req.aspectRatio ?? '9:16',
      duration: req.durationSeconds ?? 5,
    }),
  },
];

// Flux Schnell (synchronous image)
const fluxModel: ModelConfig = {
  id: 'flux-aimlapi',
  name: 'FLUX via AIML API',
  model: 'flux',
  assetType: 'ai-image',
  synchronous: true,
  capabilities: [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 10_000,
      isAsync: false,
      costTier: 'cheap',
    },
  ],
  buildInput: (req) => {
    const imageSize =
      req.aspectRatio === '16:9'
        ? 'landscape_16_9'
        : req.aspectRatio === '1:1'
          ? 'square'
          : 'portrait_16_9';
    return {
      model: 'flux/schnell',
      prompt: req.prompt ?? 'abstract background',
      image_size: imageSize,
      num_inference_steps: 4,
    };
  },
  parseOutput: (body) => {
    const data = body as { data?: Array<{ url?: string }> };
    return data.data?.[0]?.url;
  },
};

// ── Create tool instances ───────────────────────────────────

const videoTools = createProviderTools(aimlapiVideoProvider, aimlapiModels);
const imageTools = createProviderTools(aimlapiImageProvider, [fluxModel]);

// Named exports for backward compatibility with tests and discovery
const toolMap = new Map<string, ProductionTool>();
for (const t of [...videoTools, ...imageTools]) toolMap.set(t.id, t);

export const aimlapiKlingTool: ProductionTool = toolMap.get('kling-aimlapi')!;
export const aimlapiFluxTool: ProductionTool = toolMap.get('flux-aimlapi')!;
export const aimlapiKlingV3Tool: ProductionTool = toolMap.get('kling-v3-aimlapi')!;
export const aimlapiVeo3Tool: ProductionTool = toolMap.get('veo3-aimlapi')!;
export const aimlapiSora2Tool: ProductionTool = toolMap.get('sora2-aimlapi')!;
export const aimlapiPixverseTool: ProductionTool = toolMap.get('pixverse-aimlapi')!;

/** All AIML API tools. Import this instead of individual exports in discovery.ts. */
export const allAimlapiTools: readonly ProductionTool[] = [
  aimlapiKlingTool,
  aimlapiFluxTool,
  aimlapiKlingV3Tool,
  aimlapiVeo3Tool,
  aimlapiSora2Tool,
  aimlapiPixverseTool,
];
