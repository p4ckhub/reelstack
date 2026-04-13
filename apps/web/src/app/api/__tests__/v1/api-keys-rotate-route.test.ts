import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { middlewareMockFactory, mockAuthenticate } from '@/__test-utils__/middleware-mock';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/api/v1/middleware', middlewareMockFactory);
vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 9 }),
}));

import { databaseMockFactory, mockPrisma } from '@/__test-utils__/database-mock';
vi.mock('@reelstack/database', databaseMockFactory);

const mockGenerateApiKey = vi.fn();
vi.mock('@/lib/api/v1/api-keys', () => ({
  generateApiKey: (...args: unknown[]) => mockGenerateApiKey(...args),
}));

const { POST } = await import('../../v1/api-keys/[id]/rotate/route');

function makeRequest(id: string): NextRequest {
  const url = `http://localhost/api/v1/api-keys/${id}/rotate`;
  const req = new Request(url, { method: 'POST' }) as unknown as NextRequest;
  // withAuth mock passes raw Request; route reads req.nextUrl.pathname
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}

describe('POST /api/v1/api-keys/[id]/rotate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await POST(makeRequest('key-1'));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when API key not found', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    const response = await POST(makeRequest('nonexistent'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rotates API key and returns new key', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: 'key-old',
      name: 'My Key',
      scopes: ['*'],
      rateLimitPerMinute: 60,
      expiresAt: null,
    });
    mockPrisma.apiKey.update.mockResolvedValue({});
    mockGenerateApiKey.mockReturnValue({
      plaintext: 'rs_live_new_key',
      prefix: 'rs_live_newp',
      hash: 'new_hash',
    });
    mockPrisma.apiKey.create.mockResolvedValue({
      id: 'key-new',
      name: 'My Key',
      keyPrefix: 'rs_live_newp',
      scopes: ['*'],
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
    });

    const response = await POST(makeRequest('key-old'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe('key-new');
    expect(body.data.key).toBe('rs_live_new_key');
    expect(body.data.rotatedFrom).toBe('key-old');
  });

  it('revokes old key during rotation', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: 'key-old',
      name: 'My Key',
      scopes: ['*'],
      rateLimitPerMinute: 60,
      expiresAt: null,
    });
    mockPrisma.apiKey.update.mockResolvedValue({});
    mockGenerateApiKey.mockReturnValue({
      plaintext: 'rs_live_new_key',
      prefix: 'rs_live_newp',
      hash: 'new_hash',
    });
    mockPrisma.apiKey.create.mockResolvedValue({
      id: 'key-new',
      name: 'My Key',
      keyPrefix: 'rs_live_newp',
      scopes: ['*'],
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
    });

    await POST(makeRequest('key-old'));

    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-old' },
      data: expect.objectContaining({
        revokedReason: 'Rotated',
        isActive: false,
      }),
    });
  });
});
