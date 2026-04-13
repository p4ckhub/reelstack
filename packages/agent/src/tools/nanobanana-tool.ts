import { randomUUID } from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob } from '../types';
import { createLogger } from '@reelstack/logger';
import { addCost } from '../context';
import { calculateToolCost } from '../config/pricing';
import { NANOBANANA_GUIDELINES } from './prompt-guidelines';

const log = createLogger('nanobanana-tool');

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * NanoBanana / Gemini image generation tool.
 * Uses the Gemini API (nano-banana model) to generate images from text prompts.
 */
export class NanoBananaTool implements ProductionTool {
  readonly id = 'nanobanana';
  readonly name = 'NanoBanana (Gemini Image)';
  readonly promptGuidelines = NANOBANANA_GUIDELINES;
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-image',
      supportsPrompt: true,
      supportsScript: false,
      estimatedLatencyMs: 15_000,
      isAsync: false,
      costTier: 'cheap',
    },
  ];

  private get apiKey(): string | undefined {
    return process.env.NANOBANANA_API_KEY ?? process.env.GEMINI_API_KEY;
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey)
      return { available: false, reason: 'NANOBANANA_API_KEY or GEMINI_API_KEY not set' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'API key not set' };
    }

    const prompt = request.prompt ?? request.searchQuery ?? 'abstract colorful background';

    const model = process.env.NANOBANANA_MODEL ?? 'gemini-3.1-flash-image-preview';
    const aspectRatio =
      request.aspectRatio === '16:9' ? '16:9' : request.aspectRatio === '1:1' ? '1:1' : '9:16';

    try {
      const startTime = performance.now();

      log.info(
        {
          model,
          prompt: prompt.substring(0, 200),
          aspectRatio,
          endpoint: `${GEMINI_API}/models/${model}:generateContent`,
        },
        'NanoBanana generate request'
      );

      const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio,
              imageSize: '1K',
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
        redirect: 'error',
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          { status: res.status, durationMs, errorBody: errBody.substring(0, 500) },
          'NanoBanana generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `Gemini API error (${res.status})`,
        };
      }

      const data = (await res.json()) as GeminiResponse;

      // Find the image part in the response
      const imagePart = data.candidates?.[0]?.content?.parts?.find((p) =>
        p.inlineData?.mimeType?.startsWith('image/')
      );

      if (!imagePart?.inlineData) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No image in response',
        };
      }

      // Size limit on base64 data (50MB decoded ~ 68MB base64)
      const MAX_BASE64_LENGTH = 68 * 1024 * 1024;
      if (imagePart.inlineData.data.length > MAX_BASE64_LENGTH) {
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'Image data too large',
        };
      }

      // Validate MIME type strictly
      const allowedMimes: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      };
      const ext = allowedMimes[imagePart.inlineData.mimeType];
      if (!ext) {
        log.warn({ mimeType: imagePart.inlineData.mimeType }, 'Unexpected MIME type from Gemini');
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'Invalid image type',
        };
      }

      // Save to temp file with path traversal guard
      const filename = `nanobanana-${randomUUID()}.${ext}`;
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
      fs.writeFileSync(resolved, Buffer.from(imagePart.inlineData.data, 'base64'));

      log.info(
        {
          path: tmpPath,
          durationMs,
          model,
          prompt: prompt.substring(0, 200),
          mimeType: imagePart.inlineData.mimeType,
          sizeKB: Math.round(Buffer.from(imagePart.inlineData.data, 'base64').length / 1024),
        },
        'NanoBanana image generated'
      );

      addCost({
        step: `asset:${this.id}`,
        provider: 'nanobanana',
        model: 'gemini-2.0-flash-exp',
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
        error: `NanoBanana request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
}
