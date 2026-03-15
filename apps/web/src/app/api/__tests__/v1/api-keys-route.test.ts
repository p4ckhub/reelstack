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

const mockGetApiKeysByUser = vi.fn();
const mockCreateApiKey = vi.fn();
const mockApiKeyCount = vi.fn();
vi.mock('@reelstack/database', () => ({
  getApiKeysByUser: (...args: unknown[]) => mockGetApiKeysByUser(...args),
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  createAuditLog: vi.fn().mockResolvedValue({}),
  prisma: {
    apiKey: {
      count: (...args: unknown[]) => mockApiKeyCount(...args),
    },
  },
}));

vi.mock('@reelstack/types', async (importOriginal) => {
  const original = await importOriginal<typeof import('@reelstack/types')>();
  return { ...original };
});

const mockGenerateApiKey = vi.fn();
vi.mock('@/lib/api/v1/api-keys', () => ({
  generateApiKey: (...args: unknown[]) => mockGenerateApiKey(...args),
}));

const { GET, POST } = await import('../../v1/api-keys/route');

function makeRequest(method = 'GET'): NextRequest {
  const url = 'http://localhost/api/v1/api-keys';
  const req = new Request(url, { method }) as unknown as NextRequest;
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}

function makePostRequest(body: unknown): NextRequest {
  const url = 'http://localhost/api/v1/api-keys';
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}

describe('GET /api/v1/api-keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns list of API keys', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetApiKeysByUser.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Test Key',
        keyPrefix: 'rs_live_abc',
        scopes: ['*'],
        rateLimitPerMinute: 60,
        isActive: true,
        expiresAt: null,
        lastUsedAt: null,
        usageCount: BigInt(5),
        createdAt: new Date('2024-01-01'),
      },
    ]);

    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('key-1');
    expect(body.data[0].usageCount).toBe(5);
  });

  it('passes userId to getApiKeysByUser', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetApiKeysByUser.mockResolvedValue([]);
    await GET(makeRequest());
    expect(mockGetApiKeysByUser).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /api/v1/api-keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await POST(makePostRequest({ name: 'Test Key' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    const req = new Request('http://localhost/api/v1/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as NextRequest;
    const response = await POST(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing name', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    const response = await POST(makePostRequest({}));
    expect(response.status).toBe(400);
  });

  it('returns 400 when max keys reached', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockApiKeyCount.mockResolvedValue(10);
    const response = await POST(makePostRequest({ name: 'New Key' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('creates API key and returns 201 with plaintext', async () => {
    mockAuthenticate.mockResolvedValue({ user: { id: 'user-1' } });
    mockApiKeyCount.mockResolvedValue(0);
    mockGenerateApiKey.mockReturnValue({
      plaintext: 'rs_live_full_key_value',
      prefix: 'rs_live_abcd',
      hash: 'hashed_value',
    });
    mockCreateApiKey.mockResolvedValue({
      id: 'key-new',
      name: 'New Key',
      keyPrefix: 'rs_live_abcd',
      scopes: ['*'],
      expiresAt: null,
      createdAt: new Date('2024-01-01'),
    });

    const response = await POST(makePostRequest({ name: 'New Key' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe('key-new');
    expect(body.data.key).toBe('rs_live_full_key_value');
  });
});
