/**
 * ReelJob CRUD + status transitions + callback dedup.
 * Status transitions are validated against the state machine in
 * `@reelstack/types` so callers can't jump from FAILED back to PROCESSING.
 */
import { prisma, prismaRead } from './client';
import { isValidStatusTransition } from '@reelstack/types';

/**
 * Keys callers can override when forking a completed job to re-render
 * with a tweak. Anything outside this list would either invalidate the
 * cached pipeline outputs (`workflowUrl` / `script` / `language` change
 * the script + voiceover) or doesn't belong to a runtime config (`mode`,
 * `runtime` change the pipeline shape entirely → use a fresh job).
 *
 * Resume route + `forkReelJob` share this list as one source of truth.
 */
export const FORK_OVERRIDABLE_KEYS = [
  'endCard',
  'captionStyle',
  'tts',
  'brandPreset',
  'scrollStopper',
  'highlightMode',
] as const;
export type ForkOverridableKey = (typeof FORK_OVERRIDABLE_KEYS)[number];

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown>
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = out[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue !== null &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

export async function createReelJob(data: {
  userId: string;
  script?: string;
  reelConfig?: object;
  apiKeyId?: string;
  creditCost?: number;
  callbackUrl?: string;
  parentJobId?: string;
  language?: string;
}) {
  return prisma.reelJob.create({
    data: {
      userId: data.userId,
      script: data.script,
      reelConfig: data.reelConfig as object | undefined,
      apiKeyId: data.apiKeyId,
      creditCost: data.creditCost ?? 10,
      callbackUrl: data.callbackUrl,
      parentJobId: data.parentJobId,
      language: data.language,
    },
  });
}

export async function getReelJob(id: string, userId: string) {
  return prismaRead.reelJob.findFirst({ where: { id, userId } });
}

export async function getReelJobInternal(id: string) {
  return prisma.reelJob.findUnique({ where: { id } });
}

export async function updateReelJobStatus(
  id: string,
  updates: {
    status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress?: number;
    outputUrl?: string;
    error?: string;
    publishStatus?: object;
    productionMeta?: object;
    startedAt?: Date;
    completedAt?: Date;
  }
) {
  if (updates.status) {
    const current = await prisma.reelJob.findUnique({
      where: { id },
      select: { status: true },
    });

    if (current && !isValidStatusTransition(current.status, updates.status)) {
      throw new Error(
        `Invalid status transition: ${current.status} → ${updates.status} for job ${id}`
      );
    }
  }

  return prisma.reelJob.update({ where: { id }, data: updates });
}

/**
 * Atomically mark callback as sent. Returns true if this call actually flipped
 * the flag. Uses a conditional update to prevent duplicate deliveries when
 * concurrent workers race.
 */
export async function markCallbackSent(id: string): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "ReelJob" SET "callbackSent" = true WHERE id = ${id} AND "callbackSent" = false
  `;
  return updated > 0;
}

/** Reset callbackSent so the callback can be retried after delivery failure. */
export async function resetCallbackSent(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "ReelJob" SET "callbackSent" = false WHERE id = ${id}
  `;
}

/**
 * Fork a completed job: create a child ReelJob that inherits the
 * source's pipeline cache (MinIO `jobs/{sourceId}/`) but renders with
 * `configOverrides` deep-merged into `reelConfig`. Used by the resume
 * API to re-render a reel with a different end-card platform / caption
 * style / TTS voice without re-running the upstream pipeline.
 *
 * Caller is responsible for copying the MinIO context + enqueueing the
 * child job after this returns.
 */
export async function forkReelJob(params: {
  sourceJobId: string;
  userId: string;
  configOverrides: Record<string, unknown>;
}) {
  const source = await prisma.reelJob.findUnique({ where: { id: params.sourceJobId } });
  // Don't leak source existence to a non-owner — both branches return
  // the same "not found" error so an attacker can't enumerate job IDs.
  if (!source || source.userId !== params.userId) {
    throw new Error(`Reel job ${params.sourceJobId} not found`);
  }
  if (source.status !== 'COMPLETED') {
    throw new Error(
      `Cannot fork job in status ${source.status}; only COMPLETED jobs can be forked`
    );
  }
  if (!source.reelConfig) {
    throw new Error(`Cannot fork job ${params.sourceJobId}: source.reelConfig is empty`);
  }

  const offendingKeys = Object.keys(params.configOverrides).filter(
    (k) => !(FORK_OVERRIDABLE_KEYS as readonly string[]).includes(k)
  );
  if (offendingKeys.length > 0) {
    throw new Error(
      `Cannot override keys [${offendingKeys.join(', ')}] via fork — would invalidate cached pipeline. Allowed: ${FORK_OVERRIDABLE_KEYS.join(', ')}`
    );
  }

  const mergedConfig = deepMerge(
    source.reelConfig as Record<string, unknown>,
    params.configOverrides
  );

  return prisma.reelJob.create({
    data: {
      userId: source.userId,
      script: source.script,
      reelConfig: mergedConfig as object,
      apiKeyId: source.apiKeyId,
      // Cost lives on the source job; forks pay zero credits because
      // the expensive steps (LLM, TTS, screenshot) are reused from cache.
      creditCost: 0,
      language: source.language,
      sourceJobId: source.id,
      forkedAt: new Date(),
      status: 'QUEUED',
    },
  });
}

export async function getReelJobsByUser(userId: string, limit = 20, cursor?: string) {
  return prismaRead.reelJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}
