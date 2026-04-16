/** API key CRUD + touch (for last-used tracking). */
import { prisma, prismaRead } from './client';

export async function createApiKey(data: {
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
  expiresAt?: Date;
}) {
  return prisma.apiKey.create({
    data: {
      userId: data.userId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      keyHash: data.keyHash,
      scopes: data.scopes ?? ['*'],
      rateLimitPerMinute: data.rateLimitPerMinute ?? 60,
      expiresAt: data.expiresAt,
    },
  });
}

export async function getApiKeysByUser(userId: string) {
  return prismaRead.apiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      rateLimitPerMinute: true,
      isActive: true,
      expiresAt: true,
      lastUsedAt: true,
      usageCount: true,
      createdAt: true,
    },
  });
}

export async function getApiKeyByHash(keyHash: string) {
  return prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });
}

export async function revokeApiKey(id: string, userId: string, reason?: string) {
  return prisma.apiKey.updateMany({
    where: { id, userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: reason ?? 'User revoked',
      isActive: false,
    },
  });
}

export async function touchApiKey(id: string, ip?: string) {
  return prisma.apiKey.update({
    where: { id },
    data: {
      lastUsedAt: new Date(),
      lastUsedIp: ip,
      usageCount: { increment: 1 },
    },
  });
}
