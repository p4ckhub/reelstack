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

const mockGetTemplateById = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();
vi.mock('@reelstack/database', () => ({
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
  updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
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
    },
  ],
}));

const { GET, PATCH, DELETE } = await import('../../v1/templates/[id]/route');

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: 'key-1', scopes: ['*'] };

function makePatchRequest(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('GET /api/v1/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/v1/templates/tmpl-1') as unknown as NextRequest);
    expect(response.status).toBe(401);
  });

  it('returns built-in template by id', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await GET(new Request('http://localhost/api/v1/templates/built-in-1') as unknown as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe('built-in-1');
    expect(body.data.isBuiltIn).toBe(true);
  });

  it('returns user template by id', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetTemplateById.mockResolvedValue({
      id: 'tmpl-1',
      name: 'Custom',
      description: 'Custom template',
      style: { fontSize: 30 },
      category: 'bold',
      isPublic: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });

    const response = await GET(new Request('http://localhost/api/v1/templates/tmpl-1') as unknown as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe('tmpl-1');
    expect(body.data.isBuiltIn).toBe(false);
  });

  it('returns 404 when template not found', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetTemplateById.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/v1/templates/nonexistent') as unknown as NextRequest);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/v1/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await PATCH(
      makePatchRequest('http://localhost/api/v1/templates/tmpl-1', { name: 'Updated' })
    );
    expect(response.status).toBe(401);
  });

  it('returns 403 when trying to update built-in template', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await PATCH(
      makePatchRequest('http://localhost/api/v1/templates/built-in-1', { name: 'Updated' })
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 for invalid JSON body', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const req = new Request('http://localhost/api/v1/templates/tmpl-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as NextRequest;
    const response = await PATCH(req);
    expect(response.status).toBe(400);
  });

  it('returns 404 when template not found', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockUpdateTemplate.mockResolvedValue({ count: 0 });
    const response = await PATCH(
      makePatchRequest('http://localhost/api/v1/templates/nonexistent', { name: 'Updated' })
    );
    expect(response.status).toBe(404);
  });

  it('updates template and returns success', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockUpdateTemplate.mockResolvedValue({ count: 1 });
    const response = await PATCH(
      makePatchRequest('http://localhost/api/v1/templates/tmpl-1', { name: 'Updated Name' })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.updated).toBe(true);
    expect(mockUpdateTemplate).toHaveBeenCalledWith('tmpl-1', 'user-1', { name: 'Updated Name' });
  });
});

describe('DELETE /api/v1/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await DELETE(new Request('http://localhost/api/v1/templates/tmpl-1') as unknown as NextRequest);
    expect(response.status).toBe(401);
  });

  it('returns 403 when trying to delete built-in template', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await DELETE(new Request('http://localhost/api/v1/templates/built-in-1') as unknown as NextRequest);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when template not found', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockDeleteTemplate.mockResolvedValue({ count: 0 });
    const response = await DELETE(new Request('http://localhost/api/v1/templates/nonexistent') as unknown as NextRequest);
    expect(response.status).toBe(404);
  });

  it('deletes template and returns success', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockDeleteTemplate.mockResolvedValue({ count: 1 });
    const response = await DELETE(new Request('http://localhost/api/v1/templates/tmpl-1') as unknown as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.deleted).toBe(true);
    expect(mockDeleteTemplate).toHaveBeenCalledWith('tmpl-1', 'user-1');
  });
});
