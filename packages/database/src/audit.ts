/** Append-only audit log. */
import { prisma, prismaRead } from './client';

export async function createAuditLog(data: {
  userId?: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  return prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      target: data.target,
      metadata: data.metadata as object | undefined,
      ip: data.ip,
    },
  });
}

export async function getAuditLogs(options: {
  userId?: string;
  action?: string;
  limit?: number;
  cursor?: string;
}) {
  const { userId, action, limit = 50, cursor } = options;
  return prismaRead.auditLog.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}
