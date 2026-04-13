/**
 * Job context propagation using AsyncLocalStorage.
 *
 * Allows any code deep in the call stack (e.g., LLM calls, tool calls)
 * to access the current jobId and collect costs without explicit parameter threading.
 */
import { AsyncLocalStorage } from 'async_hooks';
import type { CostEntry, CostSummary } from './types';

/** Minimal interface to avoid circular dependency with pipeline-logger module */
interface ApiCallLogger {
  saveApiCall(
    stepId: string,
    callId: string,
    data: {
      provider: string;
      model: string;
      request: { systemPrompt: string; userMessage: string };
      response: { text: string; usage?: { inputTokens: number; outputTokens: number } };
      durationMs: number;
    }
  ): void;
}

interface JobStore {
  jobId: string;
  costs: CostEntry[];
  apiCallLogger?: ApiCallLogger;
}

export const jobContext = new AsyncLocalStorage<JobStore>();

/** Get the current jobId from async context, or undefined if not in a job. */
export function getJobId(): string | undefined {
  return jobContext.getStore()?.jobId;
}

/** Run a function within a job context so all nested calls can access jobId and collect costs. */
export function runWithJobId<T>(jobId: string, fn: () => T): T {
  // If already in a context with the same jobId, reuse it (avoids nested stores losing costs)
  const existing = jobContext.getStore();
  if (existing && existing.jobId === jobId) return fn();
  return jobContext.run({ jobId, costs: [] }, fn);
}

/** Set API call logger for the current job (called by orchestrator after creating PipelineLogger). */
export function setApiCallLogger(logger: ApiCallLogger): void {
  const store = jobContext.getStore();
  if (store) store.apiCallLogger = logger;
}

/** Log an API call to the pipeline logger (if available in job context). */
export function logApiCall(
  stepId: string,
  callId: string,
  data: {
    provider: string;
    model: string;
    request: { systemPrompt: string; userMessage: string };
    response: { text: string; usage?: { inputTokens: number; outputTokens: number } };
    durationMs: number;
  }
): void {
  jobContext.getStore()?.apiCallLogger?.saveApiCall(stepId, callId, data);
}

/** Add a cost entry to the current job context. Safe to call outside a job (no-op). */
export function addCost(entry: CostEntry): void {
  const store = jobContext.getStore();
  if (store) store.costs.push(entry);
}

/** Get all cost entries collected in the current job context. */
export function getCosts(): readonly CostEntry[] {
  return jobContext.getStore()?.costs ?? [];
}

/** Get aggregated cost summary for the current job. */
export function getCostSummary(): CostSummary {
  const entries = getCosts();
  const byType: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  let totalUSD = 0;

  for (const e of entries) {
    totalUSD += e.costUSD;
    byType[e.type] = (byType[e.type] ?? 0) + e.costUSD;
    byProvider[e.provider] = (byProvider[e.provider] ?? 0) + e.costUSD;
  }

  return { totalUSD, byType, byProvider, entries };
}
