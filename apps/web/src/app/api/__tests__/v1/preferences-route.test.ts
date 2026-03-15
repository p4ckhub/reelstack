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

const mockGetUserPreferences = vi.fn();
const mockUpdateUserPreferences = vi.fn();
vi.mock('@reelstack/database', () => ({
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
}));

const { GET, PATCH } = await import('../../v1/user/preferences/route');

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: null, scopes: ['*'] };

function makeRequest(method: string, body?: unknown): NextRequest {
  return new Request('http://localhost/api/v1/user/preferences', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

describe('GET /api/v1/user/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await GET(makeRequest('GET'));
    expect(response.status).toBe(401);
  });

  it('returns empty object when no preferences set', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetUserPreferences.mockResolvedValue({});
    const response = await GET(makeRequest('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({});
  });

  it('returns saved preferences', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const prefs = { defaultLayout: 'fullscreen', brandPreset: { highlightColor: '#FF0000' } };
    mockGetUserPreferences.mockResolvedValue(prefs);
    const response = await GET(makeRequest('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(prefs);
  });
});

describe('PATCH /api/v1/user/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await PATCH(makeRequest('PATCH', { defaultLayout: 'fullscreen' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const req = new Request('http://localhost/api/v1/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as NextRequest;
    const response = await PATCH(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid layout', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await PATCH(makeRequest('PATCH', { defaultLayout: 'widescreen' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('updates preferences and returns merged result', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const merged = { defaultLayout: 'fullscreen', brandPreset: { highlightColor: '#FF0000' } };
    mockUpdateUserPreferences.mockResolvedValue(merged);

    const response = await PATCH(makeRequest('PATCH', { defaultLayout: 'fullscreen' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(merged);
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith('user-1', { defaultLayout: 'fullscreen' });
  });

  it('accepts partial brandPreset update', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const update = { brandPreset: { highlightColor: '#00FF00' } };
    mockUpdateUserPreferences.mockResolvedValue(update);

    const response = await PATCH(makeRequest('PATCH', update));
    expect(response.status).toBe(200);
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith('user-1', update);
  });
});
