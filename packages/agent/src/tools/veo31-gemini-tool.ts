import { randomUUID } from 'node:crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
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

const log = createLogger('veo31-vertex');

const LOCATION = 'us-central1';

/**
 * Google Veo 3.1 video generation via Vertex AI.
 * Generates video with NATIVE AUDIO (speech, sound effects, lip sync).
 * Supports image-to-video via reference images.
 *
 * Auth: gcloud OAuth2 token (requires gcloud CLI logged in).
 * Requires: VERTEX_PROJECT_ID (Google Cloud project ID)
 */
export class Veo31GeminiTool implements ProductionTool {
  readonly id = 'veo31-gemini';
  readonly name = 'Veo 3.1 (Vertex AI, native audio)';
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'ai-video',
      supportsPrompt: true,
      supportsScript: true, // native audio generation
      maxDurationSeconds: 8,
      estimatedLatencyMs: 120_000,
      isAsync: true,
      costTier: 'expensive',
    },
  ];

  private get projectId(): string | undefined {
    return process.env.VERTEX_PROJECT_ID;
  }

  private get model(): string {
    return process.env.VEO31_MODEL ?? 'veo-3.1-generate-001';
  }

  private get baseUrl(): string {
    return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${LOCATION}/publishers/google/models/${this.model}`;
  }

  /** Get OAuth2 access token from gcloud CLI */
  private getAccessToken(): string | undefined {
    try {
      return execSync('gcloud auth print-access-token', {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return undefined;
    }
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.projectId) return { available: false, reason: 'VERTEX_PROJECT_ID not set' };
    const token = this.getAccessToken();
    if (!token)
      return { available: false, reason: 'gcloud auth not configured (run: gcloud auth login)' };
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    const token = this.getAccessToken();
    if (!token || !this.projectId) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: 'Vertex AI auth not configured',
      };
    }

    const prompt = request.prompt ?? 'abstract cinematic background';
    const aspectRatio = request.aspectRatio === '16:9' ? '16:9' : '9:16';
    // Veo 3.1 only supports 4, 6, or 8 second durations
    const validDurations = [4, 6, 8];
    const rawDur = Math.min(request.durationSeconds ?? 8, 8);
    const duration = validDurations.reduce((prev, curr) =>
      Math.abs(curr - rawDur) < Math.abs(prev - rawDur) ? curr : prev
    );

    try {
      const instance: Record<string, unknown> = { prompt };
      // Character consistency: referenceImageUrl falls back to imageUrl
      const sourceImageUrl = request.imageUrl ?? request.referenceImageUrl;
      if (sourceImageUrl) {
        // Vertex AI image-to-video: instance.image with base64 + mimeType
        let imgBuffer: Buffer | undefined;

        if (sourceImageUrl.startsWith('/') || sourceImageUrl.startsWith('file:')) {
          const resolvedPath = path.resolve(sourceImageUrl.replace('file://', ''));
          const tmpRoot = path.resolve(os.tmpdir());
          const isSafePath =
            resolvedPath.startsWith(tmpRoot) ||
            resolvedPath.startsWith('/tmp/') ||
            resolvedPath.startsWith('/private/tmp/');
          if (!isSafePath) {
            log.warn({ path: resolvedPath }, 'Image path outside tmpdir, skipping');
          } else {
            try {
              imgBuffer = fs.readFileSync(resolvedPath);
            } catch {
              /* file not found */
            }
          }
        } else if (sourceImageUrl.startsWith('http')) {
          const imgRes = await fetch(sourceImageUrl, {
            signal: AbortSignal.timeout(30_000),
            redirect: 'error',
          });
          if (imgRes.ok) imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        }

        if (imgBuffer) {
          const mimeType =
            sourceImageUrl.endsWith('.jpg') || sourceImageUrl.endsWith('.jpeg')
              ? 'image/jpeg'
              : 'image/png';
          instance.image = { bytesBase64Encoded: imgBuffer.toString('base64'), mimeType };
        }
      }

      // Last frame for seamless loops: same image as first frame
      if (request.endImageUrl) {
        const endUrl = request.endImageUrl;
        let endBuffer: Buffer | undefined;
        if (endUrl.startsWith('/') || endUrl.startsWith('file:')) {
          const resolvedEnd = path.resolve(endUrl.replace('file://', ''));
          const tmpRoot2 = path.resolve(os.tmpdir());
          const isSafeEnd =
            resolvedEnd.startsWith(tmpRoot2) ||
            resolvedEnd.startsWith('/tmp/') ||
            resolvedEnd.startsWith('/private/tmp/');
          if (!isSafeEnd) {
            log.warn({ path: resolvedEnd }, 'End image path outside tmpdir, skipping');
          } else {
            try {
              endBuffer = fs.readFileSync(resolvedEnd);
            } catch {
              /* file not found */
            }
          }
        } else if (endUrl.startsWith('http')) {
          const res = await fetch(endUrl, {
            signal: AbortSignal.timeout(30_000),
            redirect: 'error',
          });
          if (res.ok) endBuffer = Buffer.from(await res.arrayBuffer());
        }
        if (endBuffer) {
          const mimeType =
            endUrl.endsWith('.jpg') || endUrl.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
          instance.lastFrame = { bytesBase64Encoded: endBuffer.toString('base64'), mimeType };
        }
      }

      const requestBody = {
        instances: [instance],
        parameters: {
          aspectRatio,
          sampleCount: 1,
          durationSeconds: duration,
          personGeneration: 'allow_all',
          generateAudio: true,
        },
      };

      const startTime = performance.now();

      log.info(
        {
          prompt,
          aspectRatio,
          duration,
          hasImageInput: !!request.imageUrl,
          endpoint: `${this.baseUrl}:predictLongRunning`,
        },
        'Veo 3.1 generate request'
      );

      const res = await fetch(`${this.baseUrl}:predictLongRunning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
            status: res.status,
            durationMs,
            errorBody: errBody.substring(0, 500),
            prompt: prompt.substring(0, 200),
          },
          'Veo 3.1 generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `Veo 3.1 API error (${res.status}): ${errBody.substring(0, 100)}`,
        };
      }

      const data = (await res.json()) as { name?: string };
      if (!data.name) {
        log.warn(
          { durationMs, responseData: JSON.stringify(data).substring(0, 300) },
          'No operation name returned'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No operation name returned',
        };
      }

      log.info(
        {
          operationName: data.name,
          durationMs,
          prompt: prompt.substring(0, 200),
          aspectRatio,
          duration,
        },
        'Veo 3.1 video generation started'
      );
      return { jobId: data.name, toolId: this.id, status: 'processing' };
    } catch (err) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `Veo 3.1 request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    const token = this.getAccessToken();
    if (!token) {
      return { jobId, toolId: this.id, status: 'failed', error: 'gcloud auth expired' };
    }

    if (
      !jobId ||
      jobId.length > 512 ||
      !/^[a-zA-Z0-9.\-_/]+$/.test(jobId) ||
      jobId.includes('..')
    ) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid operation name format' };
    }

    try {
      const startTime = performance.now();

      const res = await fetch(`${this.baseUrl}:fetchPredictOperation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ operationName: jobId }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        log.debug({ jobId, status: res.status, durationMs }, 'Veo 3.1 poll: not ready');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as VeoOperationResponse;

      log.info(
        {
          jobId,
          done: data.done,
          durationMs,
          hasVideo: !!data.response?.videos?.[0],
          hasUri: !!data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
          raiReasons: data.response?.raiMediaFilteredReasons,
          raiCount: data.response?.raiMediaFilteredCount,
          errorCode: data.error?.code,
          errorMessage: data.error?.message,
          responseKeys: Object.keys(data.response ?? {}),
        },
        'Veo 3.1 poll response'
      );

      if (!data.done) {
        return { jobId, toolId: this.id, status: 'processing' };
      }

      // Vertex AI returns video as base64 inline
      const video = data.response?.videos?.[0];
      if (video?.bytesBase64Encoded) {
        // Decode and save to temp file
        const buffer = Buffer.from(video.bytesBase64Encoded, 'base64');
        const tmpFile = path.join(os.tmpdir(), `veo31-${randomUUID()}.mp4`);
        fs.writeFileSync(tmpFile, buffer);
        log.info(
          { path: tmpFile, sizeKB: Math.round(buffer.length / 1024) },
          'Veo 3.1 video decoded'
        );
        addCost({
          step: `asset:${this.id}`,
          provider: 'vertex-ai',
          model: this.model,
          type: 'video',
          costUSD: calculateToolCost(this.id, 8),
          inputUnits: 1,
          durationMs,
        });
        return { jobId, toolId: this.id, status: 'completed', url: tmpFile, durationSeconds: 8 };
      }

      // Fallback: check for URI-based response
      const sample = data.response?.generateVideoResponse?.generatedSamples?.[0];
      if (sample?.video?.uri) {
        addCost({
          step: `asset:${this.id}`,
          provider: 'vertex-ai',
          model: this.model,
          type: 'video',
          costUSD: calculateToolCost(this.id, 8),
          inputUnits: 1,
          durationMs,
        });
        return { jobId, toolId: this.id, status: 'completed', url: sample.video.uri };
      }

      if (data.error) {
        log.warn(
          { jobId, errorCode: data.error.code, errorMessage: data.error.message },
          'Veo 3.1 operation error'
        );
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: `Veo 3.1 error: ${data.error.message ?? data.error.code}`,
        };
      }

      // Check if content was filtered by Google's safety system
      const raiReasons = data.response?.raiMediaFilteredReasons;
      const raiCount = data.response?.raiMediaFilteredCount;
      if (raiReasons || raiCount) {
        log.warn(
          { jobId, raiReasons, raiCount },
          'Veo 3.1 video filtered by Google safety (RAI). Prompt may contain flagged content.'
        );
        return {
          jobId,
          toolId: this.id,
          status: 'failed',
          error: `Veo 3.1 content filtered by Google safety: ${JSON.stringify(raiReasons ?? 'unknown')}`,
        };
      }

      log.warn(
        { jobId, responseKeys: Object.keys(data.response ?? {}), dataKeys: Object.keys(data) },
        'Veo 3.1 done but no video found in response'
      );
      return { jobId, toolId: this.id, status: 'failed', error: 'No video in response' };
    } catch (err) {
      log.warn({ jobId, err }, 'Veo 3.1 poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

interface VeoOperationResponse {
  done?: boolean;
  response?: {
    videos?: Array<{ bytesBase64Encoded?: string }>;
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
    raiMediaFilteredReasons?: string[];
    raiMediaFilteredCount?: number;
  };
  error?: { code?: number; message?: string };
}
