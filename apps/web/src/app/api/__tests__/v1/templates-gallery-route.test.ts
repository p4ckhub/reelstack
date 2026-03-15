import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const mockAuthenticate = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/api/v1/middleware', () => {
  function withAuth(
    _options: unknown,
    handler: (req: NextRequest, ctx: unknown) => Promise<NextResponse>
  ) {
    return async (req: NextRequest) => {
      const ctx = await mockAuthenticate(req);
      if (!ctx) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing authentication' } },
          { status: 401 }
        );
      }
      return handler(req, ctx);
    };
  }
  function successResponse(data: unknown, status = 200) {
    return NextResponse.json({ data }, { status });
  }
  function errorResponse(code: string, message: string, status: number) {
    return NextResponse.json({ error: { code, message } }, { status });
  }
  function paginatedResponse(
    items: unknown[],
    limit: number,
    getCursor: (item: unknown) => string
  ) {
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && data.length > 0 ? getCursor(data[data.length - 1]) : null;
    return NextResponse.json({ data, pagination: { nextCursor, hasMore } });
  }
  return { withAuth, successResponse, errorResponse, paginatedResponse, authenticate: mockAuthenticate };
});

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 19 }),
}));

const mockGetPublicTemplates = vi.fn();
vi.mock('@reelstack/database', () => ({
  getPublicTemplates: (...args: unknown[]) => mockGetPublicTemplates(...args),
}));

vi.mock('@reelstack/core', () => ({
  BUILT_IN_TEMPLATES: [
    {
      id: 'built-in-1',
      name: 'Default',
      description: 'Default template',
      style: { fontSize: 24 },
      category: 'minimal',
      usageCount: 100,
    },
  ],
}));

const { GET } = await import('../../v1/templates/gallery/route');

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: 'key-1', scopes: ['*'] };

describe('GET /api/v1/templates/gallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/v1/templates/gallery') as unknown as NextRequest);
    expect(response.status).toBe(401);
  });

  it('returns built-in and public templates on first page', async () => {
    const publicTemplates = [
      {
        id: 'pub-1',
        name: 'Community Template',
        description: 'A public template',
        style: { fontSize: 28 },
        category: 'bold',
        usageCount: 42,
      },
    ];
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetPublicTemplates.mockResolvedValue(publicTemplates);

    const response = await GET(new Request('http://localhost/api/v1/templates/gallery') as unknown as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].isBuiltIn).toBe(true);
    expect(body.data[1].isBuiltIn).toBe(false);
    expect(body.data[1].name).toBe('Community Template');
  });

  it('returns paginated results when cursor is provided', async () => {
    const templates = [
      {
        id: 'pub-2',
        name: 'Page 2 Template',
        description: 'From second page',
        style: { fontSize: 20 },
        category: 'modern',
        usageCount: 5,
      },
    ];
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetPublicTemplates.mockResolvedValue(templates);

    const response = await GET(
      new Request('http://localhost/api/v1/templates/gallery?cursor=pub-1&limit=10') as unknown as NextRequest
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Page 2 Template');
  });

  it('calls getPublicTemplates with undefined cursor for first page', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetPublicTemplates.mockResolvedValue([]);
    await GET(new Request('http://localhost/api/v1/templates/gallery') as unknown as NextRequest);
    expect(mockGetPublicTemplates).toHaveBeenCalledWith(undefined, 20);
  });
});
