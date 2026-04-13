import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prismaMockFactory,
  mockReelJobAggregate,
  mockReelJobCreate,
  mockReelJobFindFirst,
  mockReelJobFindUnique,
  mockReelJobUpdate,
  mockReelJobFindMany,
  mockUserFindUnique,
  mockUserFindUniqueOrThrow,
  mockUserUpdate,
  mockTokenTransactionCreate,
  mockTokenTransactionFindMany,
  mockExecuteRaw,
  mockTransaction,
} from './prisma-mock';

vi.mock('@prisma/client', prismaMockFactory);

// Configure $transaction to pass-through to the callback with mock tx
mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
  return fn({
    reelJob: { aggregate: (...args: unknown[]) => mockReelJobAggregate(...args) },
    user: {
      findUniqueOrThrow: (...args: unknown[]) => mockUserFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    tokenTransaction: { create: (...args: unknown[]) => mockTokenTransactionCreate(...args) },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  });
});

const {
  consumeCredits,
  addTokens,
  getTokenBalance,
  getTokenTransactions,
  updateUserTier,
  createReelJob,
  getReelJob,
  getReelJobInternal,
  updateReelJobStatus,
  getReelJobsByUser,
} = await import('../index');

describe('consumeCredits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consumes from tier when under monthly budget', async () => {
    mockReelJobAggregate.mockResolvedValue({ _sum: { creditCost: 50 } });
    // First executeRaw is FOR UPDATE lock
    mockExecuteRaw.mockResolvedValueOnce(1);

    const result = await consumeCredits('user-1', 100, 10);
    expect(result).toEqual({ consumed: true, source: 'tier' });
  });

  it('falls back to tokens when tier budget exhausted', async () => {
    mockReelJobAggregate.mockResolvedValue({ _sum: { creditCost: 95 } });
    // First executeRaw = FOR UPDATE lock, second = token deduction
    mockExecuteRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mockTokenTransactionCreate.mockResolvedValue({});

    const result = await consumeCredits('user-1', 100, 10);
    expect(result).toEqual({ consumed: true, source: 'token' });
    expect(mockTokenTransactionCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', amount: -10, reason: 'render' },
    });
  });

  it('returns consumed false when both tier and tokens exhausted', async () => {
    mockReelJobAggregate.mockResolvedValue({ _sum: { creditCost: 95 } });
    // First executeRaw = FOR UPDATE lock, second = token deduction fails
    mockExecuteRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const result = await consumeCredits('user-1', 100, 10);
    expect(result).toEqual({ consumed: false, source: null });
  });

  it('uses SUM of creditCost for monthly budget check', async () => {
    mockReelJobAggregate.mockResolvedValue({ _sum: { creditCost: 90 } });
    mockExecuteRaw.mockResolvedValueOnce(1);

    const result = await consumeCredits('user-1', 100, 10);
    expect(result).toEqual({ consumed: true, source: 'tier' });
    expect(mockReelJobAggregate).toHaveBeenCalled();
  });

  it('handles null sum (no jobs yet)', async () => {
    mockReelJobAggregate.mockResolvedValue({ _sum: { creditCost: null } });
    mockExecuteRaw.mockResolvedValueOnce(1);

    const result = await consumeCredits('user-1', 100, 10);
    expect(result).toEqual({ consumed: true, source: 'tier' });
  });
});

describe('addTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments balance and creates transaction', async () => {
    mockUserUpdate.mockResolvedValue({});
    mockTokenTransactionCreate.mockResolvedValue({ id: 'tx-1' });

    await addTokens('user-1', 50, 'purchase', 'order-123');
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenBalance: { increment: 50 } },
    });
    expect(mockTokenTransactionCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', amount: 50, reason: 'purchase', sellfOrderId: 'order-123' },
    });
  });

  it('creates transaction without sellfOrderId', async () => {
    mockUserUpdate.mockResolvedValue({});
    mockTokenTransactionCreate.mockResolvedValue({ id: 'tx-2' });

    await addTokens('user-1', 10, 'refund');
    expect(mockTokenTransactionCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', amount: 10, reason: 'refund', sellfOrderId: undefined },
    });
  });
});

describe('getTokenBalance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user token balance', async () => {
    mockUserFindUnique.mockResolvedValue({ tokenBalance: 42 });
    const balance = await getTokenBalance('user-1');
    expect(balance).toBe(42);
  });

  it('returns 0 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const balance = await getTokenBalance('nonexistent');
    expect(balance).toBe(0);
  });
});

describe('getTokenTransactions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ordered transactions with limit', async () => {
    const mockTxns = [{ id: 'tx-1', amount: 50 }];
    mockTokenTransactionFindMany.mockResolvedValue(mockTxns);
    const result = await getTokenTransactions('user-1', 10);
    expect(result).toEqual(mockTxns);
    expect(mockTokenTransactionFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  });
});

describe('updateUserTier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates user tier', async () => {
    mockUserUpdate.mockResolvedValue({ id: 'user-1', tier: 'PRO' });
    await updateUserTier('user-1', 'PRO');
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tier: 'PRO' },
    });
  });
});

describe('ReelJob CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createReelJob creates with all fields', async () => {
    mockReelJobCreate.mockResolvedValue({ id: 'reel-1' });
    await createReelJob({
      userId: 'user-1',
      script: 'Hello world',
      reelConfig: { layout: 'fullscreen' },
      apiKeyId: 'key-1',
      creditCost: 10,
    });
    expect(mockReelJobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        script: 'Hello world',
        reelConfig: { layout: 'fullscreen' },
        apiKeyId: 'key-1',
        creditCost: 10,
      }),
    });
  });

  it('getReelJob scopes by userId', async () => {
    mockReelJobFindFirst.mockResolvedValue({ id: 'reel-1' });
    await getReelJob('reel-1', 'user-1');
    expect(mockReelJobFindFirst).toHaveBeenCalledWith({
      where: { id: 'reel-1', userId: 'user-1' },
    });
  });

  it('getReelJobInternal reads without userId scope', async () => {
    mockReelJobFindUnique.mockResolvedValue({ id: 'reel-1' });
    await getReelJobInternal('reel-1');
    expect(mockReelJobFindUnique).toHaveBeenCalledWith({ where: { id: 'reel-1' } });
  });

  it('updateReelJobStatus updates subset of fields', async () => {
    mockReelJobFindUnique.mockResolvedValue({ status: 'PROCESSING' });
    mockReelJobUpdate.mockResolvedValue({ id: 'reel-1', status: 'COMPLETED' });
    await updateReelJobStatus('reel-1', { status: 'COMPLETED', progress: 100 });
    expect(mockReelJobFindUnique).toHaveBeenCalledWith({
      where: { id: 'reel-1' },
      select: { status: true },
    });
    expect(mockReelJobUpdate).toHaveBeenCalledWith({
      where: { id: 'reel-1' },
      data: { status: 'COMPLETED', progress: 100 },
    });
  });

  it('valid transition QUEUED → PROCESSING succeeds', async () => {
    mockReelJobFindUnique.mockResolvedValue({ status: 'QUEUED' });
    mockReelJobUpdate.mockResolvedValue({ id: 'reel-1', status: 'PROCESSING' });
    await updateReelJobStatus('reel-1', { status: 'PROCESSING' });
    expect(mockReelJobUpdate).toHaveBeenCalledWith({
      where: { id: 'reel-1' },
      data: { status: 'PROCESSING' },
    });
  });

  it('valid transition PROCESSING → COMPLETED succeeds', async () => {
    mockReelJobFindUnique.mockResolvedValue({ status: 'PROCESSING' });
    mockReelJobUpdate.mockResolvedValue({ id: 'reel-1', status: 'COMPLETED' });
    await updateReelJobStatus('reel-1', { status: 'COMPLETED', progress: 100 });
    expect(mockReelJobUpdate).toHaveBeenCalledWith({
      where: { id: 'reel-1' },
      data: { status: 'COMPLETED', progress: 100 },
    });
  });

  it('invalid transition COMPLETED → QUEUED throws', async () => {
    mockReelJobFindUnique.mockResolvedValue({ status: 'COMPLETED' });
    await expect(updateReelJobStatus('reel-1', { status: 'QUEUED' })).rejects.toThrow(
      'Invalid status transition: COMPLETED → QUEUED for job reel-1'
    );
  });

  it('invalid transition COMPLETED → PROCESSING throws', async () => {
    mockReelJobFindUnique.mockResolvedValue({ status: 'COMPLETED' });
    await expect(updateReelJobStatus('reel-1', { status: 'PROCESSING' })).rejects.toThrow(
      'Invalid status transition: COMPLETED → PROCESSING for job reel-1'
    );
  });

  it('valid retry FAILED → QUEUED succeeds', async () => {
    mockReelJobFindUnique.mockResolvedValue({ status: 'FAILED' });
    mockReelJobUpdate.mockResolvedValue({ id: 'reel-1', status: 'QUEUED' });
    await updateReelJobStatus('reel-1', { status: 'QUEUED' });
    expect(mockReelJobUpdate).toHaveBeenCalledWith({
      where: { id: 'reel-1' },
      data: { status: 'QUEUED' },
    });
  });

  it('update without status change skips validation', async () => {
    mockReelJobUpdate.mockResolvedValue({ id: 'reel-1', progress: 50 });
    await updateReelJobStatus('reel-1', { progress: 50 });
    expect(mockReelJobFindUnique).not.toHaveBeenCalled();
    expect(mockReelJobUpdate).toHaveBeenCalledWith({
      where: { id: 'reel-1' },
      data: { progress: 50 },
    });
  });

  it('getReelJobsByUser returns ordered list', async () => {
    mockReelJobFindMany.mockResolvedValue([]);
    await getReelJobsByUser('user-1', 5);
    expect(mockReelJobFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
  });
});
