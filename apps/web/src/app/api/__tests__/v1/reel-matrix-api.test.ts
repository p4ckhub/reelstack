/**
 * POST /matrix + GET/DELETE /matrix/{batchId} contract tests.
 *
 * Mocks the agent's `createMatrix` (covered in its own unit tests) and
 * the database layer. Just verifies request validation, status
 * mapping, and authorization scoping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

import { mockAuthenticate } from '@/__test-utils__/middleware-mock';
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/api/v1/middleware', async () =>
  (await import('@/__test-utils__/middleware-mock')).middlewareMockFactory()
);
vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 99 }),
}));

const mockCreateMatrix = vi.fn();
// Inline cartesian product matching the real `expandDimensions` from
// @reelstack/agent — easier than importing the real one through the
// vi.mock factory (which can't reach outside its return value).
function fakeExpandDimensions(
  dims: Record<string, readonly string[]>
): Array<Record<string, string>> {
  const keys = Object.keys(dims);
  if (keys.length === 0) return [{}];
  let cells: Array<Record<string, string>> = [{}];
  for (const k of keys) {
    const next: Array<Record<string, string>> = [];
    for (const c of cells) for (const v of dims[k]!) next.push({ ...c, [k]: v });
    cells = next;
  }
  return cells;
}
vi.mock('@reelstack/agent', () => ({
  createMatrix: (...args: unknown[]) => mockCreateMatrix(...args),
  expandDimensions: fakeExpandDimensions,
  // reel-schemas.ts pulls `isPublicUrl` for callback URL validation +
  // `listHfCardSlugs()` for endCard.cardSlug validation; not exercised
  // here but the imports must resolve.
  isPublicUrl: () => true,
  isPrivateHost: () => false,
  listHfCardSlugs: () => ['shimmer', 'glitch', 'neon-sign', 'burst', 'wave-text', 'text'],
}));

import { databaseMockFactory, mockPrisma } from '@/__test-utils__/database-mock';
vi.mock('@reelstack/database', async () =>
  (await import('@/__test-utils__/database-mock')).databaseMockFactory()
);

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: 'key-1', scopes: ['*'] };

function makePostRequest(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeGetRequest(url: string): NextRequest {
  return new Request(url, { method: 'GET' }) as unknown as NextRequest;
}

function makeDeleteRequest(url: string): NextRequest {
  return new Request(url, { method: 'DELETE' }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticate.mockResolvedValue(mockAuthCtx);
});

describe('POST /api/v1/reel/matrix', () => {
  it('creates a matrix batch and returns 202 with summary', async () => {
    mockCreateMatrix.mockResolvedValue({
      batchId: 'batch-1',
      totalCells: 6,
      baseJobs: 2,
      forkJobs: 4,
      estimatedCost: { credits: 20, fullPipelines: 2, freeForks: 4 },
      jobs: [],
    });

    const { POST } = await import('../../v1/reel/matrix/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/matrix', {
        base: { mode: 'n8n-explainer', workflowUrl: 'https://n8n.io/workflows/2813' },
        dimensions: {
          language: ['pl', 'en'],
          'endCard.platform': ['ig', 'fb', 'tiktok'],
        },
      })
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.data).toMatchObject({
      batchId: 'batch-1',
      totalCells: 6,
      baseJobs: 2,
      forkJobs: 4,
    });
    expect(mockCreateMatrix).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        apiKeyId: 'key-1',
      })
    );
  });

  it('rejects empty dimensions', async () => {
    const { POST } = await import('../../v1/reel/matrix/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/matrix', {
        base: { mode: 'n8n-explainer' },
        dimensions: {},
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(mockCreateMatrix).not.toHaveBeenCalled();
  });

  it('rejects missing base.mode', async () => {
    const { POST } = await import('../../v1/reel/matrix/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/matrix', {
        base: { workflowUrl: 'https://x' },
        dimensions: { language: ['pl'] },
      })
    );

    expect(res.status).toBe(400);
    expect(mockCreateMatrix).not.toHaveBeenCalled();
  });

  it('surfaces orchestrator validation errors as 400', async () => {
    mockCreateMatrix.mockRejectedValue(
      new Error('Unknown dimension keys: [tts.voice]. Allowed BASE: [language]...')
    );

    const { POST } = await import('../../v1/reel/matrix/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/matrix', {
        base: { mode: 'n8n-explainer' },
        dimensions: { 'tts.voice': ['Charon', 'Aoede'] },
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/dimension/i);
  });

  it('returns 500 on unexpected orchestrator failure', async () => {
    mockCreateMatrix.mockRejectedValue(new Error('Database connection lost'));

    const { POST } = await import('../../v1/reel/matrix/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/matrix', {
        base: { mode: 'n8n-explainer' },
        dimensions: { language: ['pl'] },
      })
    );

    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/reel/matrix/:id', () => {
  it('returns aggregated status + outputs map', async () => {
    mockPrisma.reelBatch.findFirst = vi.fn().mockResolvedValue({
      id: 'batch-1',
      mode: 'n8n-explainer',
      status: 'COMPLETED',
      dimensions: { language: ['pl'], 'endCard.platform': ['ig', 'fb'] },
      createdAt: new Date('2026-05-01T10:00:00Z'),
      updatedAt: new Date('2026-05-01T10:30:00Z'),
      jobs: [
        {
          id: 'j-pl-fb',
          status: 'COMPLETED',
          outputUrl: 'https://r2/pl-fb.mp4',
          error: null,
          batchRole: 'base',
          batchCellKey: 'fb|pl',
        },
        {
          id: 'j-pl-ig',
          status: 'COMPLETED',
          outputUrl: 'https://r2/pl-ig.mp4',
          error: null,
          batchRole: 'fork',
          batchCellKey: 'ig|pl',
        },
      ],
    });

    const { GET } = await import('../../v1/reel/matrix/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/v1/reel/matrix/batch-1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      batchId: 'batch-1',
      status: 'completed',
      totalCells: 2,
      completed: 2,
      failed: 0,
      outputs: {
        'fb|pl': 'https://r2/pl-fb.mp4',
        'ig|pl': 'https://r2/pl-ig.mp4',
      },
    });
    expect(json.data.jobs).toHaveLength(2);
  });

  it('returns 404 when batch not found or not owned by caller', async () => {
    mockPrisma.reelBatch.findFirst = vi.fn().mockResolvedValue(null);

    const { GET } = await import('../../v1/reel/matrix/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/v1/reel/matrix/missing'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/v1/reel/matrix/:id', () => {
  it('cancels batch + marks queued jobs FAILED, returns count', async () => {
    mockPrisma.reelBatch.findFirst = vi.fn().mockResolvedValue({
      id: 'batch-1',
      status: 'RUNNING',
      jobs: [
        { id: 'j-1', status: 'COMPLETED' },
        { id: 'j-2', status: 'QUEUED' },
        { id: 'j-3', status: 'PROCESSING' },
        { id: 'j-4', status: 'QUEUED' },
      ],
    });
    mockPrisma.reelBatch.update = vi.fn().mockResolvedValue(undefined);
    mockPrisma.reelJob.update = vi.fn().mockResolvedValue(undefined);

    const { DELETE } = await import('../../v1/reel/matrix/[id]/route');
    const res = await DELETE(makeDeleteRequest('http://localhost/api/v1/reel/matrix/batch-1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      batchId: 'batch-1',
      status: 'cancelled',
      cancelledJobs: 2, // only the two QUEUED jobs
    });
    expect(mockPrisma.reelBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } })
    );
  });

  it('idempotent: already-cancelled batch returns 0 cancelled jobs', async () => {
    mockPrisma.reelBatch.findFirst = vi.fn().mockResolvedValue({
      id: 'batch-1',
      status: 'CANCELLED',
      jobs: [],
    });

    const { DELETE } = await import('../../v1/reel/matrix/[id]/route');
    const res = await DELETE(makeDeleteRequest('http://localhost/api/v1/reel/matrix/batch-1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.cancelledJobs).toBe(0);
  });
});
