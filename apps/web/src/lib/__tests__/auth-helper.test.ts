import { describe, it, expect, vi, beforeEach } from 'vitest';
import { databaseMockFactory, mockPrisma } from '@/__test-utils__/database-mock';

// Mock next-auth
const mockAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock database
vi.mock('@reelstack/database', databaseMockFactory);

// Import after mocks
const { getAuthUser } = await import('../api/auth');

describe('getAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await getAuthUser();
    expect(result).toBeNull();
  });

  it('returns null when session has no user', async () => {
    mockAuth.mockResolvedValue({ user: null });
    const result = await getAuthUser();
    expect(result).toBeNull();
  });

  it('returns null when session user has no id', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } });
    const result = await getAuthUser();
    expect(result).toBeNull();
  });

  it('returns null when user not found in DB', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'test@test.com' } });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await getAuthUser();
    expect(result).toBeNull();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('returns dbUser when authenticated', async () => {
    const dbUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'test@test.com' } });
    mockPrisma.user.findUnique.mockResolvedValue(dbUser);

    const result = await getAuthUser();
    expect(result).toEqual({ dbUser });
  });
});
