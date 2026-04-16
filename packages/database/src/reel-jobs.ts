/**
 * ReelJob CRUD + status transitions + callback dedup.
 * Status transitions are validated against the state machine in
 * `@reelstack/types` so callers can't jump from FAILED back to PROCESSING.
 */
import { prisma, prismaRead } from './client';
import { isValidStatusTransition } from '@reelstack/types';

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

export async function getReelJobsByUser(userId: string, limit = 20, cursor?: string) {
  return prismaRead.reelJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}
