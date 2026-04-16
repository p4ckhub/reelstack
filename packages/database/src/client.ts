/**
 * Prisma client singletons.
 *
 * - `prisma` — primary client. Use for all writes and for reads that must be
 *   strongly consistent with recent writes.
 * - `prismaRead` — read-replica client. Uses DATABASE_READ_URL when set,
 *   falls back to `prisma` otherwise. Use for analytics and listing endpoints
 *   where a few seconds of replication lag is acceptable.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const prismaRead: PrismaClient = (() => {
  if (globalForPrisma.prismaRead) return globalForPrisma.prismaRead;

  if (process.env.DATABASE_READ_URL) {
    const client = new PrismaClient({
      datasourceUrl: process.env.DATABASE_READ_URL,
      log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    });
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaRead = client;
    return client;
  }

  // No read replica configured - use primary
  return prisma;
})();

export function createDB(): PrismaClient {
  return prisma;
}

export { PrismaClient };
