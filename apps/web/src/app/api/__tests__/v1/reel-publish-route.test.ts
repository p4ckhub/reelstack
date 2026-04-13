import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { middlewareMockFactory, mockAuthenticate } from '@/__test-utils__/middleware-mock';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/api/v1/middleware', middlewareMockFactory);
vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 9 }),
}));

import { databaseMockFactory, mockGetReelJob } from '@/__test-utils__/database-mock';
vi.mock('@reelstack/database', databaseMockFactory);

import { queueMockFactory, mockEnqueue } from '@/__test-utils__/queue-mock';
vi.mock('@reelstack/queue', queueMockFactory);

const { POST } = await import('../../v1/reel/publish/route');

const validReelId = '550e8400-e29b-41d4-a716-446655440000';
const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: null, scopes: ['*'] };

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/v1/reel/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/v1/reel/publish', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await POST(
      makeRequest({ reelId: validReelId, platforms: ['tiktok'], caption: 'Hi' })
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const req = new Request('http://localhost/api/v1/reel/publish', {
      method: 'POST',
      body: 'not json',
    }) as unknown as NextRequest;
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for empty platforms', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await POST(makeRequest({ reelId: validReelId, platforms: [], caption: 'Hi' }));
    expect(response.status).toBe(400);
  });

  it('returns 404 when reel job not found', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetReelJob.mockResolvedValue(null);
    const response = await POST(
      makeRequest({ reelId: validReelId, platforms: ['tiktok'], caption: 'Hi' })
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when reel not completed', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetReelJob.mockResolvedValue({ id: validReelId, status: 'PROCESSING', outputUrl: null });
    const response = await POST(
      makeRequest({ reelId: validReelId, platforms: ['tiktok'], caption: 'Hi' })
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when reel has no output URL', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetReelJob.mockResolvedValue({ id: validReelId, status: 'COMPLETED', outputUrl: null });
    const response = await POST(
      makeRequest({ reelId: validReelId, platforms: ['tiktok'], caption: 'Hi' })
    );
    expect(response.status).toBe(400);
  });

  it('creates publish job and returns 201', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetReelJob.mockResolvedValue({
      id: validReelId,
      status: 'COMPLETED',
      outputUrl: 'https://storage.example.com/reel.mp4',
    });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(
      makeRequest({
        reelId: validReelId,
        platforms: ['tiktok', 'instagram'],
        caption: 'Check this out!',
        hashtags: ['#reel'],
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.reelId).toBe(validReelId);
    expect(body.data.platforms).toEqual(['tiktok', 'instagram']);
    expect(body.data.status).toBe('queued');
  });

  it('enqueues to reel-publish queue', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetReelJob.mockResolvedValue({
      id: validReelId,
      status: 'COMPLETED',
      outputUrl: 'https://example.com/reel.mp4',
    });
    mockEnqueue.mockResolvedValue(undefined);

    await POST(
      makeRequest({
        reelId: validReelId,
        platforms: ['tiktok'],
        caption: 'Hello',
      })
    );

    expect(mockEnqueue).toHaveBeenCalledWith(
      validReelId,
      expect.objectContaining({ jobId: validReelId, platforms: ['tiktok'], caption: 'Hello' }),
      'reel-publish'
    );
  });

  it('returns 503 when queue unavailable', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockGetReelJob.mockResolvedValue({
      id: validReelId,
      status: 'COMPLETED',
      outputUrl: 'https://example.com/reel.mp4',
    });
    mockEnqueue.mockRejectedValue(new Error('queue down'));

    const response = await POST(
      makeRequest({
        reelId: validReelId,
        platforms: ['tiktok'],
        caption: 'Hello',
      })
    );
    expect(response.status).toBe(503);
  });
});
