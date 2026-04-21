/**
 * OpenAI gpt-image-1 tool — the current-gen OpenAI image model that
 * replaced DALL-E 3 in the /v1/images/generations endpoint.
 *
 * Why ship it alongside NanoBanana: gpt-image-1 has measurably stronger
 * instruction-following (GPT-4-based), reliable in-frame text rendering,
 * and a different aesthetic register from Gemini. Good fallback when the
 * user's brief is dense or when NanoBanana rate-limits.
 *
 * Model override: OPENAI_IMAGE_MODEL env var. Defaults to gpt-image-1;
 * set to gpt-image-2 / dall-e-3 when OpenAI ships newer versions without
 * re-deploying.
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

/** 1024x1536 is the closest portrait size OpenAI offers to our 9:16 target.
 *  Remotion handles the final crop / letterbox at composition time. */
type OpenAISize = '1024x1024' | '1024x1536' | '1536x1024';

interface OpenAIImageResponse {
  readonly data?: readonly {
    readonly b64_json?: string;
    readonly url?: string;
    readonly revised_prompt?: string;
  }[];
  readonly error?: { readonly message?: string };
}

export class OpenAIImageTool implements ProductionTool {
  readonly id = 'openai-gpt-image';
  readonly name = 'OpenAI (gpt-image-1)';
  readonly promptGuidelines = loadGuideline('gpt-image');
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 20_000,
      isAsync: false,
      costTier: 'moderate',
    },
  ];

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

    const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
    const size = resolveSize(request.aspectRatio);
    const quality = (process.env.OPENAI_IMAGE_QUALITY ?? 'medium') as 'low' | 'medium' | 'high';

    try {
      const startTime = performance.now();

      log.info(
        {
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
          { status: res.status, durationMs, errorBody: errBody.substring(0, 500) },
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

      // Guard against absurdly large payloads before writing to disk.
      const MAX_BASE64_LENGTH = 68 * 1024 * 1024;
      if (b64.length > MAX_BASE64_LENGTH) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'Image data too large',
        };
      }

      // OpenAI returns PNG — no MIME type in the response, it's always PNG.
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

function resolveSize(aspectRatio: string | undefined): OpenAISize {
  if (aspectRatio === '16:9') return '1536x1024';
  if (aspectRatio === '1:1') return '1024x1024';
  // Default (9:16 / portrait / unspecified) → closest portrait OpenAI offers.
  return '1024x1536';
}
