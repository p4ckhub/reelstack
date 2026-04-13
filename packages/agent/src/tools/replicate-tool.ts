/**
 * Replicate provider tools — config-driven via ProviderTool base class.
 *
 * Each model is a ModelConfig entry; the provider config handles auth,
 * endpoints, and response parsing shared across all Replicate models.
 */
import type { ProviderConfig, ModelConfig } from './provider-tool';
import { createProviderTools } from './provider-tool';
import type { ProductionTool } from '../registry/tool-interface';
import { IDEOGRAM_GUIDELINES, RECRAFT_GUIDELINES } from './prompt-guidelines';

// ── Shared output parser ─────────────────────────────────────

function parseReplicateOutput(body: Record<string, unknown>): string | undefined {
  const output = body.output;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return output[0] as string | undefined;
  return undefined;
}

// ── Provider config (shared across all Replicate models) ─────

const REPLICATE_BASE = 'https://api.replicate.com/v1';

const REPLICATE_PROVIDER: ProviderConfig = {
  provider: 'replicate',
  envKey: 'REPLICATE_API_TOKEN',

  buildAuthHeaders: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
  }),

  extraGenerateHeaders: {
    Prefer: 'respond-async',
  },

  generateUrl: (model) => {
    const [owner, modelName] = model.model.split('/');
    return `${REPLICATE_BASE}/models/${owner}/${modelName}/predictions`;
  },

  pollUrl: (_model, jobId) => `${REPLICATE_BASE}/predictions/${jobId}`,

  wrapBody: (input) => ({ input }),

  extractJobId: (body) => body.id as string | undefined,

  extractResultUrl: (body) => parseReplicateOutput(body),

  extractError: (body) => {
    const error = body.error as string | null | undefined;
    return error ?? undefined;
  },

  mapStatus: (providerStatus) => {
    if (providerStatus === 'succeeded') return 'completed';
    if (providerStatus === 'failed' || providerStatus === 'canceled') return 'failed';
    return null;
  },
};

// ── Model configs ────────────────────────────────────────────

const REPLICATE_MODELS: ModelConfig[] = [
  {
    id: 'wan-replicate',
    name: 'WAN 2.1 via Replicate',
    model: 'wan-video/wan-2.1-t2v-480p',
    assetType: 'ai-video',
    capabilities: [
      {
        assetType: 'ai-video',
        supportsPrompt: true,
        supportsScript: false,
        maxDurationSeconds: 5,
        estimatedLatencyMs: 120_000,
        isAsync: true,
        costTier: 'cheap',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract cinematic background',
      num_frames: Math.round((req.durationSeconds ?? 5) * 16),
      fps: 16,
      fast_mode: true,
    }),
    parseOutput: parseReplicateOutput,
  },
  {
    id: 'flux-replicate',
    name: 'FLUX Schnell via Replicate',
    model: 'black-forest-labs/flux-schnell',
    assetType: 'ai-image',
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
      num_outputs: 1,
      output_format: 'webp',
      output_quality: 90,
    }),
    parseOutput: parseReplicateOutput,
  },
  {
    id: 'sdxl-replicate',
    name: 'SDXL via Replicate',
    model: 'stability-ai/sdxl',
    assetType: 'ai-image',
    capabilities: [
      {
        assetType: 'ai-image',
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: 20_000,
        isAsync: true,
        costTier: 'cheap',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract background',
      negative_prompt: 'blurry, low quality, distorted',
      width: req.aspectRatio === '16:9' ? 1280 : req.aspectRatio === '1:1' ? 1024 : 576,
      height: req.aspectRatio === '16:9' ? 720 : req.aspectRatio === '1:1' ? 1024 : 1024,
      num_outputs: 1,
    }),
    parseOutput: parseReplicateOutput,
  },
  {
    id: 'ideogram-replicate',
    name: 'Ideogram v3 via Replicate',
    model: 'ideogram-ai/ideogram-v3-balanced',
    assetType: 'ai-image',
    promptGuidelines: IDEOGRAM_GUIDELINES,
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
      aspect_ratio: req.aspectRatio ?? '9:16',
      rendering_speed: 'BALANCED',
    }),
    parseOutput: parseReplicateOutput,
  },
  {
    id: 'recraft-replicate',
    name: 'Recraft v3 via Replicate',
    model: 'recraft-ai/recraft-v3',
    assetType: 'ai-image',
    promptGuidelines: RECRAFT_GUIDELINES,
    capabilities: [
      {
        assetType: 'ai-image',
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: 15_000,
        isAsync: true,
        costTier: 'moderate',
      },
    ],
    buildInput: (req) => ({
      prompt: req.prompt ?? 'abstract background',
      size:
        req.aspectRatio === '16:9'
          ? '1820x1024'
          : req.aspectRatio === '1:1'
            ? '1024x1024'
            : '1024x1820',
      style: 'realistic_image',
    }),
    parseOutput: parseReplicateOutput,
  },
  {
    id: 'flux-pro-replicate',
    name: 'FLUX Pro via Replicate',
    model: 'black-forest-labs/flux-pro',
    assetType: 'ai-image',
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
      aspect_ratio: req.aspectRatio ?? '9:16',
      output_format: 'webp',
      output_quality: 90,
      safety_tolerance: 5,
    }),
    parseOutput: parseReplicateOutput,
  },
];

// ── Exported tool instances ──────────────────────────────────

const tools = createProviderTools(REPLICATE_PROVIDER, REPLICATE_MODELS);

// Named exports for backward compatibility with existing imports
export const replicateWanTool: ProductionTool = tools[0]!;
export const replicateFluxTool: ProductionTool = tools[1]!;
export const replicateSdxlTool: ProductionTool = tools[2]!;
export const replicateIdeogramTool: ProductionTool = tools[3]!;
export const replicateRecraftTool: ProductionTool = tools[4]!;
export const replicateFluxProTool: ProductionTool = tools[5]!;

/** All Replicate tools. Import this instead of individual exports in discovery.ts. */
export const allReplicateTools: readonly ProductionTool[] = tools;
