/**
 * GET /api/v1/admin/runtime-metrics
 *
 * Per-runtime aggregate stats for the dual-runtime rollout. Queries recent
 * `ReelJob` rows, groups by `mode + runtime + status`, computes:
 *   - count, completed, failed
 *   - p50 / p95 / mean render duration (completedAt - startedAt, ms)
 *   - mean cost (USD) from productionMeta.costs.totalUSD
 *   - flag-applied share (jobs that landed on hyperframes via canary flag)
 *
 * Owner-only: tier === 'OWNER'. Tier defaults to 'FREE' for everyone else.
 *
 * Query params:
 *   ?days=N   Lookback window in days (default 7, max 90)
 */
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api/auth';
import { prisma } from '@reelstack/database';

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

interface JobMetric {
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  reelConfig: unknown;
  productionMeta: unknown;
}

interface BucketStats {
  mode: string;
  runtime: string;
  count: number;
  completed: number;
  failed: number;
  flagApplied: number;
  durationsMs: number[];
  costsUSD: number[];
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.dbUser.tier !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get('days') ?? DEFAULT_DAYS);
  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Number.isFinite(daysParam) ? daysParam : DEFAULT_DAYS)
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const jobs = (await prisma.reelJob.findMany({
    where: { createdAt: { gte: since }, status: { in: ['COMPLETED', 'FAILED'] } },
    select: {
      startedAt: true,
      completedAt: true,
      status: true,
      reelConfig: true,
      productionMeta: true,
    },
  })) as JobMetric[];

  const buckets = new Map<string, BucketStats>();
  for (const job of jobs) {
    const config = (job.reelConfig as Record<string, unknown> | null) ?? {};
    const meta = (job.productionMeta as Record<string, unknown> | null) ?? {};
    const mode = (config.mode as string | undefined) ?? 'generate';
    // Prefer runtime persisted in productionMeta (post-resolution); fall back
    // to the config field, then 'remotion' for legacy jobs that predate the
    // dual-runtime rollout.
    const runtime =
      (meta.runtime as string | undefined) ?? (config.runtime as string | undefined) ?? 'remotion';
    const flagApplied = meta.runtimeFlagApplied === true;
    const key = `${mode}|${runtime}`;
    const bucket = buckets.get(key) ?? {
      mode,
      runtime,
      count: 0,
      completed: 0,
      failed: 0,
      flagApplied: 0,
      durationsMs: [],
      costsUSD: [],
    };
    bucket.count++;
    if (job.status === 'COMPLETED') bucket.completed++;
    if (job.status === 'FAILED') bucket.failed++;
    if (flagApplied) bucket.flagApplied++;
    if (job.startedAt && job.completedAt) {
      bucket.durationsMs.push(job.completedAt.getTime() - job.startedAt.getTime());
    }
    const costs = meta.costs as { totalUSD?: number } | undefined;
    if (typeof costs?.totalUSD === 'number') bucket.costsUSD.push(costs.totalUSD);
    buckets.set(key, bucket);
  }

  const out = [...buckets.values()]
    .map((b) => ({
      mode: b.mode,
      runtime: b.runtime,
      count: b.count,
      completed: b.completed,
      failed: b.failed,
      successRate: b.count > 0 ? Math.round((b.completed / b.count) * 1000) / 1000 : 0,
      flagAppliedShare: b.count > 0 ? Math.round((b.flagApplied / b.count) * 1000) / 1000 : 0,
      durationMs: percentiles(b.durationsMs),
      costUSD: meanOrNull(b.costsUSD),
    }))
    .sort((a, b) =>
      a.mode === b.mode ? a.runtime.localeCompare(b.runtime) : a.mode.localeCompare(b.mode)
    );

  return NextResponse.json({ days, since: since.toISOString(), buckets: out });
}

function percentiles(values: number[]): {
  count: number;
  mean: number | null;
  p50: number | null;
  p95: number | null;
} {
  if (values.length === 0) return { count: 0, mean: null, p50: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  return { count: values.length, mean, p50: pick(0.5), p95: pick(0.95) };
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10000) / 10000;
}
