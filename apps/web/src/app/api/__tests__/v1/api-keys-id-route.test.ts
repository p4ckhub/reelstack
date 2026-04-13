import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { middlewareMockFactory, mockAuthenticate } from '@/__test-utils__/middleware-mock';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/api/v1/middleware', middlewareMockFactory);
vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 9 }),
}));

import { databaseMockFactory, mockRevokeApiKey } from '@/__test-utils__/database-mock';
vi.mock('@reelstack/database', databaseMockFactory);

const { DELETE } = await import('../../v1/api-keys/[id]/route');

function makeRequest(id: string): NextRequest {
  const url = `http://localhost/api/v1/api-keys/${id}`;
  const req = new Request(url, { method: 'DELETE' }) as unknown as NextRequest;
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}

describe('DELETE /api/v1/api-keys/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await DELETE(makeRequest('key-1'));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when API key not found', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockRevokeApiKey.mockResolvedValue({ count: 0 });
    const response = await DELETE(makeRequest('nonexistent'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('revokes API key and returns success', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockRevokeApiKey.mockResolvedValue({ count: 1 });
    const response = await DELETE(makeRequest('key-1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.revoked).toBe(true);
    expect(mockRevokeApiKey).toHaveBeenCalledWith('key-1', 'user-1');
  });
});
