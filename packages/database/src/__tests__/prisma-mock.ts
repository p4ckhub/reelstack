/**
 * Shared @prisma/client mock for packages/database tests.
 *
 * Both helpers.test.ts and token-credit.test.ts mock @prisma/client.
 * Bun runs them in one process — only the first mock wins.
 * This shared factory ensures ALL mock functions are available.
 */
import { vi } from 'vitest';

// User model
export const mockUserFindUnique = vi.fn();
export const mockUserFindFirst = vi.fn();
export const mockUserFindUniqueOrThrow = vi.fn();
export const mockUserUpsert = vi.fn();
export const mockUserUpdate = vi.fn();

// ReelJob model
export const mockReelJobCount = vi.fn();
export const mockReelJobAggregate = vi.fn();
export const mockReelJobCreate = vi.fn();
export const mockReelJobFindFirst = vi.fn();
export const mockReelJobFindUnique = vi.fn();
export const mockReelJobUpdate = vi.fn();
export const mockReelJobFindMany = vi.fn();

// TokenTransaction model
export const mockTokenTransactionCreate = vi.fn();
export const mockTokenTransactionFindMany = vi.fn();

// TierConfig model
export const mockTierConfigFindUnique = vi.fn();
export const mockTierConfigFindMany = vi.fn();

// Raw queries
export const mockExecuteRaw = vi.fn();
export const mockQueryRaw = vi.fn();
export const mockQueryRawUnsafe = vi.fn();
export const mockTransaction = vi.fn();

/** The shared mock Prisma instance. */
export const mockPrismaInstance = {
  user: {
    findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    findUniqueOrThrow: (...args: unknown[]) => mockUserFindUniqueOrThrow(...args),
    upsert: (...args: unknown[]) => mockUserUpsert(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
  },
  reelJob: {
    count: (...args: unknown[]) => mockReelJobCount(...args),
    aggregate: (...args: unknown[]) => mockReelJobAggregate(...args),
    create: (...args: unknown[]) => mockReelJobCreate(...args),
    findFirst: (...args: unknown[]) => mockReelJobFindFirst(...args),
    findUnique: (...args: unknown[]) => mockReelJobFindUnique(...args),
    update: (...args: unknown[]) => mockReelJobUpdate(...args),
    findMany: (...args: unknown[]) => mockReelJobFindMany(...args),
  },
  tokenTransaction: {
    create: (...args: unknown[]) => mockTokenTransactionCreate(...args),
    findMany: (...args: unknown[]) => mockTokenTransactionFindMany(...args),
  },
  tierConfig: {
    findUnique: (...args: unknown[]) => mockTierConfigFindUnique(...args),
    findMany: (...args: unknown[]) => mockTierConfigFindMany(...args),
  },
  $transaction: (...args: unknown[]) => mockTransaction(...args),
  $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
};

export function prismaMockFactory() {
  return {
    PrismaClient: class {
      constructor() {
        return mockPrismaInstance;
      }
    },
  };
}
