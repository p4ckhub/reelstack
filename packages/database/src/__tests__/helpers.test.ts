import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prismaMockFactory,
  mockUserFindUnique,
  mockUserUpsert,
  mockReelJobAggregate,
} from './prisma-mock';

vi.mock('@prisma/client', prismaMockFactory);

const { getUserByEmail, getUserById, upsertUser, getMonthlyCreditsUsed } = await import('../index');

describe('User helpers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getUserByEmail queries by email', async () => {
    mockUserFindUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });
    const user = await getUserByEmail('a@b.com');
    expect(user).toEqual({ id: '1', email: 'a@b.com' });
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
  });

  it('getUserById queries by id', async () => {
    mockUserFindUnique.mockResolvedValue({ id: '1' });
    await getUserById('1');
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  it('upsertUser creates or updates', async () => {
    mockUserUpsert.mockResolvedValue({ id: '1', email: 'a@b.com' });
    await upsertUser('1', 'a@b.com');
    expect(mockUserUpsert).toHaveBeenCalledWith({
      where: { id: '1' },
      update: { email: 'a@b.com' },
      create: { id: '1', email: 'a@b.com' },
    });
  });
});

describe('getMonthlyCreditsUsed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums creditCost from start of current month', async () => {
    mockReelJobAggregate.mockResolvedValue({ _sum: { creditCost: 70 } });
    const count = await getMonthlyCreditsUsed('user-1');
    expect(count).toBe(70);
    const callArgs = mockReelJobAggregate.mock.calls[0][0];
    expect(callArgs.where.userId).toBe('user-1');
    expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
    const gte = callArgs.where.createdAt.gte as Date;
    expect(gte.getDate()).toBe(1);
    expect(gte.getHours()).toBe(0);
  });
});
