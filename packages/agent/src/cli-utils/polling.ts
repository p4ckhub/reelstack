/**
 * Generic job polling for CLI commands.
 * Consolidates duplicated HeyGen/lipsync polling loops.
 */
import { D, G, R, X } from './cli-helpers';

export interface PollableTool {
  poll(jobId: string): Promise<{
    status: string;
    url?: string;
    durationSeconds?: number;
    error?: string;
  }>;
}

export interface PollResult {
  status: 'completed' | 'failed' | 'timeout';
  url?: string;
  durationSeconds?: number;
  error?: string;
}

/**
 * Poll a job until completed, failed, or timeout.
 *
 * @param tool - Tool with poll() method
 * @param jobId - Job ID to poll
 * @param intervalMs - Poll interval (default: 5000ms)
 * @param maxRetries - Max poll attempts (default: 60 = 5 min at 5s interval)
 * @param logEveryMs - Log progress every N ms (default: 30000 = 30s)
 */
export async function pollUntilDone(
  tool: PollableTool,
  jobId: string,
  { intervalMs = 5000, maxRetries = 60, logEveryMs = 30_000 } = {}
): Promise<PollResult> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const poll = await tool.poll(jobId);
    const sec = (i + 1) * (intervalMs / 1000);

    if (poll.status === 'completed') {
      console.log(`${G}Done${X} (${sec}s): ${poll.durationSeconds?.toFixed(1) ?? '?'}s`);
      return {
        status: 'completed',
        url: poll.url,
        durationSeconds: poll.durationSeconds,
      };
    }

    if (poll.status === 'failed') {
      console.log(`${R}Failed: ${poll.error}${X}`);
      return { status: 'failed', error: poll.error };
    }

    if ((sec * 1000) % logEveryMs === 0) {
      console.log(`${D}${sec}s...${X}`);
    }
  }

  return { status: 'timeout', error: `Timeout after ${(maxRetries * intervalMs) / 1000}s` };
}
