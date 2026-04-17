/**
 * Shared @reelstack/database mock factory for apps/web tests.
 *
 * Bun runs all tests in a single process. vi.mock() is global —
 * the FIRST call for a given module wins, and subsequent calls are no-ops.
 * If the first mock omits an export (e.g. getReelJob), every test that
 * imports it will get `undefined` instead of a function.
 *
 * This factory exports ALL database functions as vi.fn() so that
 * whichever test file loads first provides the full API surface.
 * Individual tests customize behavior via mockImplementation/mockReturnValue.
 */
import { vi } from 'vitest';

// User queries
export const mockGetUserByEmail = vi.fn();
export const mockGetUserById = vi.fn();
export const mockUpsertUser = vi.fn();
export const mockGetUserPreferences = vi.fn();
export const mockUpdateUserPreferences = vi.fn();
export const mockUpdateUserTier = vi.fn();
export const mockGetUserBySellfCustomerId = vi.fn();
export const mockLinkSellfCustomer = vi.fn();

// Usage queries
export const mockGetMonthlyCreditsUsed = vi.fn();

// Template queries
export const mockCreateTemplate = vi.fn();
export const mockGetTemplatesByUser = vi.fn();
export const mockGetTemplateById = vi.fn();
export const mockGetPublicTemplates = vi.fn();
export const mockUpdateTemplate = vi.fn();
export const mockDeleteTemplate = vi.fn();
export const mockIncrementTemplateUsage = vi.fn();

// ApiKey queries
export const mockCreateApiKey = vi.fn();
export const mockGetApiKeysByUser = vi.fn();
export const mockGetApiKeyByHash = vi.fn();
export const mockRevokeApiKey = vi.fn();
export const mockTouchApiKey = vi.fn();

// Token & credit queries
export const mockConsumeCredits = vi.fn();
export const mockGetCreditCost = vi.fn();
export const mockAddTokens = vi.fn();
export const mockGetTokenBalance = vi.fn();
export const mockGetTokenTransactions = vi.fn();

// ReelJob queries
export const mockCreateReelJob = vi.fn();
export const mockGetReelJob = vi.fn();
export const mockGetReelJobInternal = vi.fn();
export const mockUpdateReelJobStatus = vi.fn();
export const mockMarkCallbackSent = vi.fn();
export const mockResetCallbackSent = vi.fn();
export const mockGetReelJobsByUser = vi.fn();

// TierConfig queries
export const mockGetAllTierConfigs = vi.fn();
export const mockUpsertTierConfig = vi.fn();
export const mockSeedTierDefaults = vi.fn();

// AuditLog queries
export const mockCreateAuditLog = vi.fn().mockResolvedValue({});

// Module queries
export const mockIsUnlimited = vi.fn().mockReturnValue(false);
export const mockShouldShowWatermark = vi.fn().mockReturnValue(false);
export const mockCanUserAccessModule = vi.fn().mockResolvedValue(true);
export const mockListAccessibleModules = vi.fn().mockResolvedValue([]);
export const mockGetModuleBySlug = vi.fn().mockResolvedValue(null);
export const mockGrantModuleAccess = vi.fn().mockResolvedValue(undefined);
export const mockSeedModuleDefaults = vi.fn().mockResolvedValue(undefined);

// Prisma client (for tests that access prisma directly)
export const mockPrisma = {
  user: { findUnique: vi.fn(), upsert: vi.fn() },
  reelJob: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  template: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  apiKey: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  tierConfig: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  auditLog: { create: vi.fn(), findMany: vi.fn() },
  webhookEvent: { create: vi.fn() },
  tokenTransaction: { create: vi.fn(), findMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
};

/**
 * Complete mock factory. Pass to vi.mock('@reelstack/database', databaseMockFactory).
 */
export function databaseMockFactory() {
  return {
    prisma: mockPrisma,
    prismaRead: mockPrisma,
    createDB: vi.fn().mockReturnValue(mockPrisma),
    getUserByEmail: (...args: unknown[]) => mockGetUserByEmail(...args),
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
    upsertUser: (...args: unknown[]) => mockUpsertUser(...args),
    getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
    updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
    updateUserTier: (...args: unknown[]) => mockUpdateUserTier(...args),
    getUserBySellfCustomerId: (...args: unknown[]) => mockGetUserBySellfCustomerId(...args),
    linkSellfCustomer: (...args: unknown[]) => mockLinkSellfCustomer(...args),
    getMonthlyCreditsUsed: (...args: unknown[]) => mockGetMonthlyCreditsUsed(...args),
    createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
    getTemplatesByUser: (...args: unknown[]) => mockGetTemplatesByUser(...args),
    getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
    getPublicTemplates: (...args: unknown[]) => mockGetPublicTemplates(...args),
    updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
    incrementTemplateUsage: (...args: unknown[]) => mockIncrementTemplateUsage(...args),
    createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
    getApiKeysByUser: (...args: unknown[]) => mockGetApiKeysByUser(...args),
    getApiKeyByHash: (...args: unknown[]) => mockGetApiKeyByHash(...args),
    revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
    touchApiKey: (...args: unknown[]) => mockTouchApiKey(...args),
    consumeCredits: (...args: unknown[]) => mockConsumeCredits(...args),
    getCreditCost: (...args: unknown[]) => mockGetCreditCost(...args),
    addTokens: (...args: unknown[]) => mockAddTokens(...args),
    getTokenBalance: (...args: unknown[]) => mockGetTokenBalance(...args),
    getTokenTransactions: (...args: unknown[]) => mockGetTokenTransactions(...args),
    createReelJob: (...args: unknown[]) => mockCreateReelJob(...args),
    getReelJob: (...args: unknown[]) => mockGetReelJob(...args),
    getReelJobInternal: (...args: unknown[]) => mockGetReelJobInternal(...args),
    updateReelJobStatus: (...args: unknown[]) => mockUpdateReelJobStatus(...args),
    markCallbackSent: (...args: unknown[]) => mockMarkCallbackSent(...args),
    resetCallbackSent: (...args: unknown[]) => mockResetCallbackSent(...args),
    getReelJobsByUser: (...args: unknown[]) => mockGetReelJobsByUser(...args),
    getAllTierConfigs: (...args: unknown[]) => mockGetAllTierConfigs(...args),
    upsertTierConfig: (...args: unknown[]) => mockUpsertTierConfig(...args),
    seedTierDefaults: (...args: unknown[]) => mockSeedTierDefaults(...args),
    createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
    getAuditLogs: vi.fn(),
    isUnlimited: (...args: unknown[]) => mockIsUnlimited(...args),
    shouldShowWatermark: (...args: unknown[]) => mockShouldShowWatermark(...args),
    canUserAccessModule: (...args: unknown[]) => mockCanUserAccessModule(...args),
    listAccessibleModules: (...args: unknown[]) => mockListAccessibleModules(...args),
    getModuleBySlug: (...args: unknown[]) => mockGetModuleBySlug(...args),
    grantModuleAccess: (...args: unknown[]) => mockGrantModuleAccess(...args),
    seedModuleDefaults: (...args: unknown[]) => mockSeedModuleDefaults(...args),
    MODULE_DEFAULTS: [],
    PrismaClient: vi.fn(),
  };
}
