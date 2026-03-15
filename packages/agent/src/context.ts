/**
 * Job context propagation using AsyncLocalStorage.
 *
 * Allows any code deep in the call stack (e.g., LLM calls, tool calls)
 * to access the current jobId without explicit parameter threading.
 * Used for correlating API call logs with pipeline jobs.
 */
import { AsyncLocalStorage } from 'async_hooks';

interface JobStore {
  jobId: string;
}

export const jobContext = new AsyncLocalStorage<JobStore>();

/** Get the current jobId from async context, or undefined if not in a job. */
export function getJobId(): string | undefined {
  return jobContext.getStore()?.jobId;
}

/** Run a function within a job context so all nested calls can access jobId. */
export function runWithJobId<T>(jobId: string, fn: () => T): T {
  return jobContext.run({ jobId }, fn);
}
