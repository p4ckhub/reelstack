import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const mockAuthenticate = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/api/v1/middleware', () => {
  function withAuth(
    _options: unknown,
    handler: (req: NextRequest, ctx: unknown) => Promise<NextResponse>
  ) {
    return async (req: NextRequest) => {
      const ctx = await mockAuthenticate(req);
      if (!ctx) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
          { status: 401 },
        );
      }
      try {
        return await handler(req, ctx);
      } catch (err) {
        console.error(err);
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
          { status: 500 },
        );
      }
    };
  }
  function successResponse(data: unknown, status = 200) {
    return NextResponse.json({ data }, { status });
  }
  function errorResponse(code: string, message: string, status: number) {
    return NextResponse.json({ error: { code, message } }, { status });
  }
  return { withAuth, successResponse, errorResponse, authenticate: mockAuthenticate };
});

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 9 }),
}));

const mockRevokeApiKey = vi.fn();
vi.mock('@reelstack/database', () => ({
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

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
