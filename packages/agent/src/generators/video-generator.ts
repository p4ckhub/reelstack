/**
 * VideoGenerator adapter: wraps ProductionTool(s) into a simple
 * generate-and-wait interface for all-in-one video generation.
 *
 * Supports fallback chains: pass an ordered array of tools and the
 * generator will try each one in sequence until generation succeeds.
 * If all tools fail, throws with combined error details.
 *
 * Used by ai-tips and presenter-explainer modes where the pipeline
 * needs to generate complete video clips (prompt -> video with audio).
 */
import { createLogger } from '@reelstack/logger';
import type { ProductionTool } from '../registry/tool-interface';

const log = createLogger('video-generator');

export interface VideoGeneratorInput {
  prompt: string;
  duration: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  /** Source image for image-to-video (if provided, uses img2video instead of txt2video) */
  imageUrl?: string;
}

export interface VideoGeneratorResult {
  videoUrl: string;
  audioUrl?: string;
  durationSeconds?: number;
}

export interface VideoGeneratorOptions {
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
  /** Max polling attempts before timeout (default: 60) */
  maxPollAttempts?: number;
}

export interface VideoGenerator {
  readonly toolId: string;
  generate(input: VideoGeneratorInput): Promise<VideoGeneratorResult>;
}

/**
 * Create a VideoGenerator from one or more ProductionTools.
 * When multiple tools are provided, they form a fallback chain:
 * the generator tries each tool in order until one succeeds.
 *
 * Handles the full lifecycle per tool: generate -> poll until done -> return URL.
 * On failure, logs the error and moves to the next tool in the chain.
 */
export function createVideoGenerator(
  tools: ProductionTool | ProductionTool[],
  options?: VideoGeneratorOptions
): VideoGenerator {
  const toolChain = Array.isArray(tools) ? tools : [tools];
  if (toolChain.length === 0) {
    throw new Error('createVideoGenerator: at least one tool must be provided');
  }

  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  const maxPollAttempts = options?.maxPollAttempts ?? 60;

  return {
    toolId: toolChain.map((t) => t.id).join(','),

    async generate(input: VideoGeneratorInput): Promise<VideoGeneratorResult> {
      const errors: Array<{ toolId: string; error: string }> = [];

      for (const tool of toolChain) {
        try {
          log.info(
            {
              toolId: tool.id,
              prompt: input.prompt.substring(0, 300),
              duration: input.duration,
              aspectRatio: input.aspectRatio,
              hasImageUrl: !!input.imageUrl,
            },
            'Video generation attempt'
          );
          const result = await generateWithTool(tool, input, pollIntervalMs, maxPollAttempts);
          log.info(
            {
              toolId: tool.id,
              videoUrl: result.videoUrl.substring(0, 100),
              durationSeconds: result.durationSeconds,
            },
            'Video generation succeeded'
          );
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ toolId: tool.id, error: message });

          if (toolChain.length > 1) {
            const remaining = toolChain.length - errors.length;
            if (remaining > 0) {
              log.warn(
                { toolId: tool.id, error: message, remainingTools: remaining },
                `Video tool ${tool.id} failed (${message}), trying next tool...`
              );
            } else {
              log.error(
                { toolId: tool.id, error: message },
                `Video tool ${tool.id} failed (${message}), no more tools in chain`
              );
            }
          }
        }
      }

      const summary = errors.map((e) => `${e.toolId}: ${e.error}`).join('; ');
      throw new Error(`All video generation tools failed. ${summary}`);
    },
  };
}

/** Generate a video using a single tool (full lifecycle: generate -> poll -> URL). */
async function generateWithTool(
  tool: ProductionTool,
  input: VideoGeneratorInput,
  pollIntervalMs: number,
  maxPollAttempts: number
): Promise<VideoGeneratorResult> {
  const job = await tool.generate({
    purpose: `AI video: ${input.prompt.slice(0, 100)}`,
    prompt: input.prompt,
    durationSeconds: input.duration,
    aspectRatio: input.aspectRatio,
    imageUrl: input.imageUrl,
  });

  if (job.status === 'failed') {
    throw new Error(job.error ?? `${tool.name} generation failed`);
  }

  // Sync tool - result is immediate
  if (job.status === 'completed') {
    if (!job.url) throw new Error(`${tool.name} returned completed but no URL`);
    return { videoUrl: job.url, durationSeconds: job.durationSeconds };
  }

  // Async tool - poll until done
  if (!tool.poll) {
    throw new Error(`${tool.name} returned async job but has no poll method`);
  }

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    await sleep(pollIntervalMs);
    const status = await tool.poll(job.jobId);

    if (status.status === 'completed') {
      if (!status.url) throw new Error(`${tool.name} completed but no URL`);
      return { videoUrl: status.url, durationSeconds: status.durationSeconds };
    }

    if (status.status === 'failed') {
      throw new Error(status.error ?? `${tool.name} generation failed during processing`);
    }
  }

  throw new Error(`${tool.name} generation timeout: exceeded ${maxPollAttempts} poll attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
