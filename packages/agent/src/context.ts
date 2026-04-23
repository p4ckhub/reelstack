/**
 * Agent-side context helpers.
 *
 * The job-scoped AsyncLocalStorage (`jobContext`), API-call audit logger,
 * and the global fetch hook all live in `@reelstack/logger` so that
 * pure-infrastructure packages (tts, transcription, storage) can use them
 * without depending on agent.
 *
 * This module layers agent-specific per-job state (cost tracking) on top
 * of the shared store via its `extras` bag.
 */
import {
  jobContext,
  runWithJobContext,
  getJobId,
  setApiCallLogger,
  logApiCall,
} from '@reelstack/logger';
import type { CostEntry, CostSummary } from './types';

const COSTS_KEY = 'costs';

function getOrCreateCosts(): CostEntry[] | undefined {
  const store = jobContext.getStore();
  if (!store) return undefined;
  let costs = store.extras[COSTS_KEY] as CostEntry[] | undefined;
  if (!costs) {
    costs = [];
    store.extras[COSTS_KEY] = costs;
  }
  return costs;
}

/** Run a function within a job context so all nested calls can access jobId,
 * collect costs, and emit API-call audit entries. */
export function runWithJobId<T>(jobId: string, fn: () => T): T {
  return runWithJobContext(jobId, fn);
}

/** Add a cost entry to the current job context. Safe to call outside a job (no-op). */
export function addCost(entry: CostEntry): void {
  getOrCreateCosts()?.push(entry);
}

/** Get all cost entries collected in the current job context. */
export function getCosts(): readonly CostEntry[] {
  const store = jobContext.getStore();
  return (store?.extras[COSTS_KEY] as CostEntry[] | undefined) ?? [];
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

// Re-export shared job-context helpers so existing agent imports keep working.
export { jobContext, getJobId, setApiCallLogger, logApiCall };
