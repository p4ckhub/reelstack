import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  getAuthUser: () => mockGetAuthUser(),
}));

const mockGetMonthlyCreditsUsed = vi.fn();
const mockGetTokenBalance = vi.fn();
vi.mock('@reelstack/database', () => ({
  getMonthlyCreditsUsed: (...args: unknown[]) => mockGetMonthlyCreditsUsed(...args),
  getTokenBalance: (...args: unknown[]) => mockGetTokenBalance(...args),
}));

vi.mock('@/lib/api/validation', () => ({
  getTierLimits: (tier: string) => {
    const limits: Record<string, { maxFileSize: number; maxDuration: number; creditsPerMonth: number }> = {
      FREE: { maxFileSize: 100, maxDuration: 120, creditsPerMonth: 30 },
      PRO: { maxFileSize: 2000, maxDuration: 1800, creditsPerMonth: 1000 },
    };
    return Promise.resolve(limits[tier] ?? limits.FREE);
  },
}));

const { GET } = await import('../user/route');

describe('GET /api/user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns user data with usage stats', async () => {
    const dbUser = {
      id: 'user-1',
      email: 'test@test.com',
      tier: 'FREE',
      createdAt: new Date('2024-01-01'),
    };
    mockGetAuthUser.mockResolvedValue({ dbUser });
    mockGetMonthlyCreditsUsed.mockResolvedValue(20);
    mockGetTokenBalance.mockResolvedValue(10);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe('user-1');
    expect(body.email).toBe('test@test.com');
    expect(body.tier).toBe('FREE');
    expect(body.creditsUsed).toBe(20);
    expect(body.creditsPerMonth).toBe(30);
    expect(body.tokenBalance).toBe(10);
  });
});
