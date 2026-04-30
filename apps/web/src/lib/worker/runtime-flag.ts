/**
 * Runtime feature flag — gradual hyperframes rollout.
 *
 * When `RUNTIME_OVERRIDE_PCT_<MODE>` is set (0..100), a deterministic share
 * of jobs without an explicit runtime request is steered to `hyperframes`.
 * Used for canary rollouts: bump pct from 0 → 10 → 50 → 100 while watching
 * per-runtime metrics. Explicit user requests are always respected.
 *
 * The bucket is hashed off `jobId + mode`, so the same job always lands in
 * the same bucket (idempotent under retry/resume). Modes that don't
 * declare a `hyperframes` runtime are skipped — the flag never breaks a
 * job by routing it to an unsupported runtime.
 */
import type { ModuleRuntime } from '@reelstack/agent';

const PCT_PREFIX = 'RUNTIME_OVERRIDE_PCT_';

/**
 * Decide the runtime for a job. Falls back to `requested` (or `undefined`
 * for the registry to default-resolve) when no flag matches.
 *
 * Returns a `{ runtime, overridden }` pair so callers can log the decision
 * for metrics attribution.
 */
export function applyRuntimeFlag(args: {
  mode: string;
  jobId: string;
  supported: readonly ModuleRuntime[];
  requested?: ModuleRuntime;
  /** Test seam — defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}): { runtime: ModuleRuntime | undefined; overridden: boolean } {
  const { mode, jobId, supported, requested, env = process.env } = args;
  if (requested) return { runtime: requested, overridden: false };

  const pctRaw = env[PCT_PREFIX + mode.toUpperCase().replace(/-/g, '_')];
  if (!pctRaw) return { runtime: undefined, overridden: false };
  const pct = Number(pctRaw);
  if (!Number.isFinite(pct) || pct <= 0) return { runtime: undefined, overridden: false };

  if (!supported.includes('hyperframes')) {
    return { runtime: undefined, overridden: false };
  }

  // FNV-1a 32-bit hash of `${jobId}|${mode}` — small, fast, no deps. We
  // only need uniform distribution into 100 buckets, not crypto.
  const bucket = fnv1a(`${jobId}|${mode}`) % 100;
  if (bucket < Math.min(100, pct)) {
    return { runtime: 'hyperframes', overridden: true };
  }
  return { runtime: undefined, overridden: false };
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}
