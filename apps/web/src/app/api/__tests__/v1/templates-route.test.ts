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
  return { withAuth, successResponse, errorResponse, authenticate: mockAuthenticate };
});

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 19 }),
}));

const mockGetTemplatesByUser = vi.fn();
const mockCreateTemplate = vi.fn();
vi.mock('@reelstack/database', () => ({
  getTemplatesByUser: (...args: unknown[]) => mockGetTemplatesByUser(...args),
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
}));

vi.mock('@reelstack/core', () => ({
  sanitizeStyle: (s: unknown) => s,
  BUILT_IN_TEMPLATES: [
    {
      id: 'built-in-1',
      name: 'Default',
      description: 'Default template',
      style: { fontSize: 24 },
      category: 'minimal',
      isBuiltIn: true,
      isPublic: true,
      usageCount: 100,
    },
  ],
}));

const { GET, POST } = await import('../../v1/templates/route');

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: 'key-1', scopes: ['*'] };

function makePostRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/v1/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('GET /api/v1/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/v1/templates') as unknown as NextRequest);
    expect(response.status).toBe(401);
  });

  it('returns built-in and user templates', async () => {
    const userTemplates = [
      {
        id: 'custom-1',
        name: 'My Template',
        description: 'Custom',
        style: { fontSize: 30 },
        category: 'bold',
        isPublic: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ];
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetTemplatesByUser.mockResolvedValue(userTemplates);

    const response = await GET(new Request('http://localhost/api/v1/templates') as unknown as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].isBuiltIn).toBe(true);
    expect(body.data[0].name).toBe('Default');
    expect(body.data[1].isBuiltIn).toBe(false);
    expect(body.data[1].name).toBe('My Template');
  });

  it('passes userId to getTemplatesByUser', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetTemplatesByUser.mockResolvedValue([]);
    await GET(new Request('http://localhost/api/v1/templates') as unknown as NextRequest);
    expect(mockGetTemplatesByUser).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /api/v1/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await POST(makePostRequest({ name: 'Test', style: {} }));
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await POST(makePostRequest({ invalid: true }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing name', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await POST(makePostRequest({ style: { fontSize: 24 } }));
    expect(response.status).toBe(400);
  });

  it('creates template and returns 201', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockCreateTemplate.mockResolvedValue({
      id: 'tmpl-1',
      name: 'My New Template',
      description: 'A template',
      style: { fontSize: 24 },
      category: 'modern',
      isPublic: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });

    const response = await POST(
      makePostRequest({
        name: 'My New Template',
        description: 'A template',
        style: { fontSize: 24 },
        category: 'modern',
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toBe('tmpl-1');
    expect(body.data.name).toBe('My New Template');
  });

  it('returns 400 for invalid JSON body', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const req = new Request('http://localhost/api/v1/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as NextRequest;
    const response = await POST(req);
    expect(response.status).toBe(400);
  });
});
