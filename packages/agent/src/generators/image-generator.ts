/**
 * ImageGenerator adapter: wraps ProductionTool(s) into a simple
 * generate-and-wait interface for image generation.
 *
 * Supports fallback chains: pass an ordered array of tools and the
 * generator will try each one in sequence until generation succeeds.
 * If all tools fail, throws with combined error details.
 *
 * Used by pipelines that need a still image before animating it
 * (e.g., image -> image-to-video workflows).
 */
import { createLogger } from '@reelstack/logger';
import type { ProductionTool } from '../registry/tool-interface';

const log = createLogger('image-generator');

export interface ImageGeneratorInput {
  prompt: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export interface ImageGeneratorResult {
  imageUrl: string;
}

export interface ImageGeneratorOptions {
  /** Polling interval in ms (default: 3000) */
  pollIntervalMs?: number;
  /** Max polling attempts before timeout (default: 40) */
  maxPollAttempts?: number;
}

export interface ImageGenerator {
  readonly toolId: string;
  generate(input: ImageGeneratorInput): Promise<ImageGeneratorResult>;
}

/**
 * Create an ImageGenerator from one or more ProductionTools.
 * When multiple tools are provided, they form a fallback chain:
 * the generator tries each tool in order until one succeeds.
 *
 * Handles the full lifecycle per tool: generate -> poll until done -> return URL.
 * On failure, logs the error and moves to the next tool in the chain.
 */
export function createImageGenerator(
  tools: ProductionTool | ProductionTool[],
  options?: ImageGeneratorOptions
): ImageGenerator {
  const toolChain = Array.isArray(tools) ? tools : [tools];
  if (toolChain.length === 0) {
    throw new Error('createImageGenerator: at least one tool must be provided');
  }

  const pollIntervalMs = options?.pollIntervalMs ?? 3000;
  const maxPollAttempts = options?.maxPollAttempts ?? 40;

  return {
    toolId: toolChain.map((t) => t.id).join(','),

    async generate(input: ImageGeneratorInput): Promise<ImageGeneratorResult> {
      const errors: Array<{ toolId: string; error: string }> = [];

      for (const tool of toolChain) {
        try {
          log.info(
            {
              toolId: tool.id,
              prompt: input.prompt.substring(0, 300),
              aspectRatio: input.aspectRatio,
            },
            'Image generation attempt'
          );
          const result = await generateWithTool(tool, input, pollIntervalMs, maxPollAttempts);
          log.info(
            {
              toolId: tool.id,
              imageUrl: result.imageUrl.substring(0, 100),
            },
            'Image generation succeeded'
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
                `Image tool ${tool.id} failed (${message}), trying next tool...`
              );
            } else {
              log.error(
                { toolId: tool.id, error: message },
                `Image tool ${tool.id} failed (${message}), no more tools in chain`
              );
            }
          }
        }
      }

      const summary = errors.map((e) => `${e.toolId}: ${e.error}`).join('; ');
      throw new Error(`All image generation tools failed. ${summary}`);
    },
  };
}

/** Generate an image using a single tool (full lifecycle: generate -> poll -> URL). */
async function generateWithTool(
  tool: ProductionTool,
  input: ImageGeneratorInput,
  pollIntervalMs: number,
  maxPollAttempts: number
): Promise<ImageGeneratorResult> {
  const job = await tool.generate({
    purpose: `AI image: ${input.prompt.slice(0, 100)}`,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
  });

  if (job.status === 'failed') {
    throw new Error(job.error ?? `${tool.name} generation failed`);
  }

  // Sync tool - result is immediate
  if (job.status === 'completed') {
    if (!job.url) throw new Error(`${tool.name} returned completed but no URL`);
    return { imageUrl: job.url };
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
      return { imageUrl: status.url };
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
