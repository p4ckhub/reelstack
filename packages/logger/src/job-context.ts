/**
 * Job-scoped async context shared by the whole pipeline.
 *
 * Anything deep in the call stack (LLM call, tool call, storage write) can
 * look up the current `jobId` and dispatch API-call audit entries to the
 * per-job logger without explicit parameter threading.
 *
 * Extras bag: downstream packages can stash their own per-job state here
 * (e.g., cost tracking in @reelstack/agent). Using a string-keyed record
 * keeps @reelstack/logger free of agent-specific types.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ApiCallLogEntry, ApiCallLogger } from './api-log';

export interface JobStore {
  jobId: string;
  apiCallLogger?: ApiCallLogger;
  extras: Record<string, unknown>;
}

export const jobContext = new AsyncLocalStorage<JobStore>();

/** Process-wide sinks that also receive every audit entry (e.g., DB writer).
 * Separate from the per-job `apiCallLogger` because they persist across
 * jobs and rely on `entry.jobId` to partition their output. */
const globalSinks: ApiCallLogger[] = [];

/** Run `fn` inside a job-scoped context. Reuses the existing store if the
 * jobId matches so nested runs don't drop logger/extras set by the caller. */
export function runWithJobContext<T>(jobId: string, fn: () => T): T {
  const existing = jobContext.getStore();
  if (existing && existing.jobId === jobId) return fn();
  return jobContext.run({ jobId, extras: {} }, fn);
}

export function getJobId(): string | undefined {
  return jobContext.getStore()?.jobId;
}

export function setApiCallLogger(logger: ApiCallLogger): void {
  const store = jobContext.getStore();
  if (store) store.apiCallLogger = logger;
}

/** Register a process-wide audit sink that receives every call (in addition
 * to the per-job `apiCallLogger`). Idempotent — adding the same instance
 * twice registers it only once. Call once at bootstrap. */
export function addGlobalApiCallSink(sink: ApiCallLogger): void {
  if (!globalSinks.includes(sink)) globalSinks.push(sink);
}

/** Remove a previously-registered global sink. Primarily for tests. */
export function removeGlobalApiCallSink(sink: ApiCallLogger): void {
  const i = globalSinks.indexOf(sink);
  if (i >= 0) globalSinks.splice(i, 1);
}

export function logApiCall(partial: Omit<ApiCallLogEntry, 'jobId'>): void {
  const store = jobContext.getStore();
  if (!store) return;
  const entry: ApiCallLogEntry = { ...partial, jobId: store.jobId };

  if (store.apiCallLogger) {
    try {
      store.apiCallLogger.saveApiCall(entry);
    } catch {
      // Logging must never break the caller.
    }
  }

  for (const sink of globalSinks) {
    try {
      sink.saveApiCall(entry);
    } catch {
      // Likewise.
    }
  }
}
