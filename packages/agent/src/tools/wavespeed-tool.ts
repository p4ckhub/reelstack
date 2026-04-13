/**
 * WaveSpeed provider tools — config-driven via ProviderTool base class.
 *
 * Each model is a ModelConfig entry; the provider config handles auth,
 * endpoints, and response parsing shared across all WaveSpeed models.
 */
import type { ProviderConfig, ModelConfig } from './provider-tool';
import { createProviderTools } from './provider-tool';
import type { ProductionTool } from '../registry/tool-interface';
import { NANOBANANA_GUIDELINES, WAN_GUIDELINES, QWEN_IMAGE_GUIDELINES } from './prompt-guidelines';

// ── Provider config (shared across all WaveSpeed models) ─────

const WAVESPEED_BASE = 'https://api.wavespeed.ai/api/v3';

const WAVESPEED_PROVIDER: ProviderConfig = {
  provider: 'wavespeed',
  envKey: 'WAVESPEED_API_KEY',

  buildAuthHeaders: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
  }),

  generateUrl: (model) => `${WAVESPEED_BASE}/${model.meta!.modelSlug}`,

  pollUrl: (_model, jobId) => `${WAVESPEED_BASE}/results/${jobId}`,

  extractJobId: (body) => {
    const data = body.data as { id?: string } | undefined;
    return data?.id;
  },

  extractResultUrl: (body) => {
    const data = body.data as { outputs?: string[] } | undefined;
    return data?.outputs?.[0];
  },

  extractError: (body) => {
    const data = body.data as { error?: string } | undefined;
    return data?.error ?? 'wavespeed generation failed';
  },

  mapStatus: (providerStatus) => {
    if (providerStatus === 'completed') return 'completed';
    if (providerStatus === 'failed') return 'failed';
    return null;
  },
};

// ── Model configs ────────────────────────────────────────────

const WAVESPEED_MODELS: ModelConfig[] = [
  {
    id: 'seedance-wavespeed',
    name: 'Seedance via WaveSpeed',
    model: 'bytedance/seedance-1-lite-t2v-480p',
    assetType: 'ai-video',
    meta: { modelSlug: 'bytedance/seedance-1-lite-t2v-480p' },
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
      num_frames: Math.round((req.durationSeconds ?? 5) * 16),
    }),
  },
  {
    id: 'wan-wavespeed',
    name: 'WAN 2.1 via WaveSpeed',
    model: 'wavespeed-ai/wan-2.1-t2v-480p',
    assetType: 'ai-video',
    meta: { modelSlug: 'wavespeed-ai/wan-2.1-t2v-480p' },
    capabilities: [
      {
        assetType: 'ai-video',
        supportsPrompt: true,
        supportsScript: false,
        maxDurationSeconds: 5,
        estimatedLatencyMs: 80_000,
        isAsync: true,
        costTier: 'cheap',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      num_frames: Math.round((req.durationSeconds ?? 5) * 16),
      size: '480x832',
    }),
  },
  {
    id: 'wan26-wavespeed',
    name: 'WAN 2.6 via WaveSpeed',
    model: 'alibaba/wan-2.6-t2v-720p',
    assetType: 'ai-video',
    meta: { modelSlug: 'alibaba/wan-2.6-t2v-720p' },
    promptGuidelines: WAN_GUIDELINES,
    capabilities: [
      {
        assetType: 'ai-video',
        supportsPrompt: true,
        supportsScript: false,
        maxDurationSeconds: 8,
        estimatedLatencyMs: 90_000,
        isAsync: true,
        costTier: 'cheap',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      num_frames: Math.round((req.durationSeconds ?? 5) * 24),
      size: req.aspectRatio === '16:9' ? '1280x720' : '720x1280',
    }),
  },
  {
    id: 'flux-wavespeed',
    name: 'FLUX Schnell via WaveSpeed',
    model: 'black-forest-labs/flux.1-schnell',
    assetType: 'ai-image',
    meta: { modelSlug: 'black-forest-labs/flux.1-schnell' },
    capabilities: [
      {
        assetType: 'ai-image',
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: 5_000,
        isAsync: true,
        costTier: 'cheap',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract background',
      image_size:
        req.aspectRatio === '16:9'
          ? 'landscape_16_9'
          : req.aspectRatio === '1:1'
            ? 'square'
            : 'portrait_16_9',
      num_inference_steps: 4,
      num_images: 1,
    }),
  },
  {
    id: 'nanobanana-pro-wavespeed',
    name: 'NanoBanana Pro via WaveSpeed',
    model: 'google/nano-banana-pro/text-to-image',
    assetType: 'ai-image',
    meta: { modelSlug: 'google/nano-banana-pro/text-to-image' },
    promptGuidelines: NANOBANANA_GUIDELINES,
    capabilities: [
      {
        assetType: 'ai-image',
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: 20_000,
        isAsync: true,
        costTier: 'moderate',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract background',
      resolution: '1k',
      aspect_ratio: req.aspectRatio ?? '9:16',
      output_format: 'png',
    }),
  },
  {
    id: 'qwen-image-wavespeed',
    name: 'Qwen Image 2.0 via WaveSpeed',
    model: 'alibaba/qwen-image-2.0/text-to-image',
    assetType: 'ai-image',
    meta: { modelSlug: 'alibaba/qwen-image-2.0/text-to-image' },
    promptGuidelines: QWEN_IMAGE_GUIDELINES,
    capabilities: [
      {
        assetType: 'ai-image',
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: 8_000,
        isAsync: true,
        costTier: 'cheap',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract background',
      aspect_ratio: req.aspectRatio ?? '9:16',
    }),
  },
];

// ── Exported tool instances ──────────────────────────────────

const tools = createProviderTools(WAVESPEED_PROVIDER, WAVESPEED_MODELS);

// Named exports for backward compatibility with existing imports
export const wavespeedSeedanceTool: ProductionTool = tools.find(
  (t) => t.id === 'seedance-wavespeed'
)!;
export const wavespeedWanTool: ProductionTool = tools.find((t) => t.id === 'wan-wavespeed')!;
export const wavespeedWan26Tool: ProductionTool = tools.find((t) => t.id === 'wan26-wavespeed')!;
export const wavespeedFluxTool: ProductionTool = tools.find((t) => t.id === 'flux-wavespeed')!;
export const wavespeedNanaBananaProTool: ProductionTool = tools.find(
  (t) => t.id === 'nanobanana-pro-wavespeed'
)!;
export const wavespeedQwenImageTool: ProductionTool = tools.find(
  (t) => t.id === 'qwen-image-wavespeed'
)!;

/** All WaveSpeed tools. Import this instead of individual exports in discovery.ts. */
export const allWavespeedTools: readonly ProductionTool[] = tools;
