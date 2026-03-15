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

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
vi.mock('@reelstack/database', () => ({
  createAuditLog: vi.fn().mockResolvedValue({}),
  prisma: {
    apiKey: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

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
    mockFindFirst.mockResolvedValue(null);
    const response = await POST(makeRequest('nonexistent'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rotates API key and returns new key', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValue({
      id: 'key-old',
      name: 'My Key',
      scopes: ['*'],
      rateLimitPerMinute: 60,
      expiresAt: null,
    });
    mockUpdate.mockResolvedValue({});
    mockGenerateApiKey.mockReturnValue({
      plaintext: 'rs_live_new_key',
      prefix: 'rs_live_newp',
      hash: 'new_hash',
    });
    mockCreate.mockResolvedValue({
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
    mockFindFirst.mockResolvedValue({
      id: 'key-old',
      name: 'My Key',
      scopes: ['*'],
      rateLimitPerMinute: 60,
      expiresAt: null,
    });
    mockUpdate.mockResolvedValue({});
    mockGenerateApiKey.mockReturnValue({
      plaintext: 'rs_live_new_key',
      prefix: 'rs_live_newp',
      hash: 'new_hash',
    });
    mockCreate.mockResolvedValue({
      id: 'key-new',
      name: 'My Key',
      keyPrefix: 'rs_live_newp',
      scopes: ['*'],
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
    });

    await POST(makeRequest('key-old'));

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'key-old' },
      data: expect.objectContaining({
        revokedReason: 'Rotated',
        isActive: false,
      }),
    });
  });
});
