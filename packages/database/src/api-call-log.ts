/**
 * Database sink for API call audit entries.
 *
 * Registered once at bootstrap via `addGlobalApiCallSink(dbApiCallSink)`.
 * Every outbound HTTP request captured by the fetch hook lands here and
 * is persisted to the `ApiCallLog` table — giving us a durable, queryable
 * audit trail beyond the per-job storage artifacts.
 *
 * Writes are fire-and-forget. If the DB is down the reel still produces.
 */
import type { ApiCallLogEntry, ApiCallLogger } from '@reelstack/logger';
import type { Prisma } from '@prisma/client';
import { prisma, prismaRead } from './client';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Prisma accepts any JSON-serializable value. We already scrubbed binary
  // payloads out upstream, so we cast through Prisma's type here.
  return value as Prisma.InputJsonValue;
}

export const dbApiCallSink: ApiCallLogger = {
  saveApiCall(entry: ApiCallLogEntry): void {
    prisma.apiCallLog
      .create({
        data: {
          jobId: entry.jobId,
          stepId: entry.stepId,
          callId: entry.callId,
          kind: entry.kind,
          provider: entry.provider,
          model: entry.model ?? null,
          method: entry.method,
          url: entry.url,
          requestHeaders: toJson(entry.requestHeaders),
          requestBody: toJson(entry.requestBody),
          responseStatus: entry.responseStatus ?? null,
          responseHeaders: toJson(entry.responseHeaders),
          responseBody: toJson(entry.responseBody),
          durationMs: entry.durationMs,
          error: entry.error ?? null,
          costUSD: entry.costUSD ?? null,
          startedAt: new Date(entry.startedAt),
        },
      })
      .catch(() => {
        // Swallow. Audit writes must not break the pipeline.
      });
  },
};

export interface ApiCallLogListOptions {
  jobId: string;
  limit?: number;
  cursor?: string;
}

/** Paginated list of API calls for a job (read-replica). Response bodies
 * are omitted for speed; fetch a single call via `getApiCallLog` for full. */
export async function listApiCallLogs(opts: ApiCallLogListOptions) {
  const limit = Math.min(opts.limit ?? 50, 200);
  return prismaRead.apiCallLog.findMany({
    where: { jobId: opts.jobId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      jobId: true,
      stepId: true,
      callId: true,
      kind: true,
      provider: true,
      model: true,
      method: true,
      url: true,
      responseStatus: true,
      durationMs: true,
      error: true,
      costUSD: true,
      startedAt: true,
      createdAt: true,
    },
  });
}

export async function getApiCallLog(jobId: string, callId: string) {
  return prismaRead.apiCallLog.findFirst({
    where: { jobId, callId },
  });
}
