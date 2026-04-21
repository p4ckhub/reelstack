/**
 * OpenAI image-generation tools — one shared implementation, two
 * registered instances (gpt-image-1 and gpt-image-2). Both talk to
 * https://api.openai.com/v1/images/generations with different `model`
 * strings; everything else is identical.
 *
 * gpt-image-1 — shipped April 2025, replaced DALL-E 3. Solid
 *   instruction-following, reliable in-frame text, medium latency.
 *
 * gpt-image-2 — shipped April 2026. ~2× faster, dramatically better
 *   multilingual text rendering (magazine layouts, infographics, slides),
 *   supports up to 4096×4096. General API rollout scheduled early May
 *   2026; some Plus/Team/Enterprise keys have early access. Callers
 *   whose key lacks access will see a 404 "model_not_found" — we keep
 *   gpt-image-1 registered alongside as the drop-in fallback.
 *
 * Env overrides: OPENAI_IMAGE_QUALITY (low|medium|high, default medium),
 * OPENAI_IMAGE_SIZE (exact "WxH", overrides aspect-ratio auto-pick).
 */

import { randomUUID } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob } from '../types';
import { createLogger } from '@reelstack/logger';
import { addCost } from '../context';
import { calculateToolCost } from '../config/pricing';
import { loadGuideline } from '../prompts/loader';

const log = createLogger('openai-image-tool');
const OPENAI_API = 'https://api.openai.com/v1';

interface OpenAIImageResponse {
  readonly data?: readonly {
    readonly b64_json?: string;
    readonly url?: string;
    readonly revised_prompt?: string;
  }[];
  readonly error?: { readonly message?: string };
}

export interface OpenAIImageToolConfig {
  /** Registry ID (e.g. "openai-gpt-image", "openai-gpt-image-2"). */
  readonly toolId: string;
  /** Display name surfaced in the UI dropdown. */
  readonly displayName: string;
  /** Exact model string sent in the API payload. */
  readonly modelString: string;
  /** Rough latency estimate for the planner. */
  readonly estimatedLatencyMs: number;
  /** How our pricing table calls this tool. */
  readonly costTier: ToolCapability['costTier'];
}

export class OpenAIImageTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly promptGuidelines = loadGuideline('gpt-image');
  readonly capabilities: ToolCapability[];

  private readonly modelString: string;

  constructor(config: OpenAIImageToolConfig) {
    this.id = config.toolId;
    this.name = config.displayName;
    this.modelString = config.modelString;
    this.capabilities = [
      {
        assetType: 'ai-image',
        supportsPrompt: true,
        supportsScript: false,
        estimatedLatencyMs: config.estimatedLatencyMs,
        isAsync: false,
        costTier: config.costTier,
      },
    ];
  }

  private get apiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) return { available: false, reason: 'OPENAI_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'API key not set' };
    }

    const prompt = request.prompt ?? request.searchQuery;
    if (!prompt) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'No prompt provided',
      };
    }

    const model = this.modelString;
    const size = process.env.OPENAI_IMAGE_SIZE ?? resolveSize(request.aspectRatio);
    const quality = (process.env.OPENAI_IMAGE_QUALITY ?? 'medium') as 'low' | 'medium' | 'high';

    try {
      const startTime = performance.now();

      log.info(
        {
          toolId: this.id,
          model,
          size,
          quality,
          prompt: prompt.substring(0, 200),
          endpoint: `${OPENAI_API}/images/generations`,
        },
        'OpenAI image generate request'
      );

      const res = await fetch(`${OPENAI_API}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size,
          quality,
        }),
        signal: AbortSignal.timeout(90_000),
        redirect: 'error',
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { toolId: this.id, status: res.status, durationMs, errorBody: errBody.substring(0, 500) },
          'OpenAI image generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `OpenAI image API error (${res.status})`,
        };
      }

      const data = (await res.json()) as OpenAIImageResponse;
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: data.error?.message ?? 'No image in response',
        };
      }

      const MAX_BASE64_LENGTH = 68 * 1024 * 1024;
      if (b64.length > MAX_BASE64_LENGTH) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'Image data too large',
        };
      }

      const filename = `openai-image-${randomUUID()}.png`;
      const tmpPath = path.join(os.tmpdir(), filename);
      const resolved = path.resolve(tmpPath);
      if (!resolved.startsWith(path.resolve(os.tmpdir()))) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'Path security violation',
        };
      }
      fs.writeFileSync(resolved, Buffer.from(b64, 'base64'));

      log.info(
        {
          toolId: this.id,
          path: tmpPath,
          durationMs,
          model,
          size,
          quality,
          prompt: prompt.substring(0, 200),
          sizeKB: Math.round(Buffer.from(b64, 'base64').length / 1024),
        },
        'OpenAI image generated'
      );

      addCost({
        step: `asset:${this.id}`,
        provider: 'openai',
        model,
        type: 'image',
        costUSD: calculateToolCost(this.id),
        inputUnits: 1,
      });

      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'completed',
        url: tmpPath,
      };
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `OpenAI image request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }
}

function resolveSize(aspectRatio: string | undefined): string {
  if (aspectRatio === '16:9') return '1536x1024';
  if (aspectRatio === '1:1') return '1024x1024';
  // Default (9:16 / portrait / unspecified) → closest portrait preset.
  // gpt-image-2 accepts higher resolutions too (up to 4096×4096) but we
  // keep the shared default conservative; override per-env with
  // OPENAI_IMAGE_SIZE=2048x3072 when using gpt-image-2 at higher quality.
  return '1024x1536';
}

/** Canonical preset factories so discovery.ts stays one line per model. */
export const OPENAI_IMAGE_PRESETS = {
  gptImage1: {
    toolId: 'openai-gpt-image',
    displayName: 'OpenAI (gpt-image-1)',
    modelString: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
    estimatedLatencyMs: 20_000,
    costTier: 'moderate' as const,
  },
  gptImage2: {
    toolId: 'openai-gpt-image-2',
    displayName: 'OpenAI (gpt-image-2)',
    modelString: 'gpt-image-2',
    // ~2× faster than gpt-image-1 per OpenAI's announcement.
    estimatedLatencyMs: 10_000,
    costTier: 'moderate' as const,
  },
} as const;
