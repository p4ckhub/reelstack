import type { ProductionTool } from './registry/tool-interface';
import type { AssetGenerationStatus } from './types';
import { GenerationError } from './errors';
import { createLogger } from '@reelstack/logger';

const log = createLogger('polling');

export interface PollOptions {
  /** Initial delay before first poll (ms) */
  readonly initialDelayMs?: number;
  /** Maximum delay between polls (ms) */
  readonly maxDelayMs?: number;
  /** Total timeout (ms) */
  readonly timeoutMs?: number;
  /** Backoff multiplier */
  readonly backoffFactor?: number;
}

const DEFAULTS: Required<PollOptions> = {
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  timeoutMs: 300_000, // 5 min
  backoffFactor: 1.5,
};

/**
 * Polls an async tool until the job completes or fails.
 * Uses exponential backoff.
 */
export async function pollUntilDone(
  tool: ProductionTool,
  jobId: string,
  options?: PollOptions,
): Promise<AssetGenerationStatus> {
  if (!tool.poll) {
    throw new GenerationError(`Tool ${tool.id} does not support polling`, tool.id);
  }

  const opts = { ...DEFAULTS, ...options };
  const MAX_TIMEOUT = 600_000;
  const cappedTimeout = Math.min(opts.timeoutMs, MAX_TIMEOUT);
  const deadline = Date.now() + cappedTimeout;
  let delay = opts.initialDelayMs;
  let pollCount = 0;
  const MAX_POLLS = 120;

  while (Date.now() < deadline && pollCount < MAX_POLLS) {
    await sleep(delay);
    pollCount++;

    const status = await tool.poll(jobId);
    log.debug({ toolId: tool.id, jobId, status: status.status, pollCount }, 'Poll result');

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
  }

  throw new GenerationError(
    `Polling timed out (${pollCount} polls, ${cappedTimeout}ms) for job ${jobId}`,
    tool.id,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
