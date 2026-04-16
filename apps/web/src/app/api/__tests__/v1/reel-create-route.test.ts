import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { middlewareMockFactory, mockAuthenticate } from '@/__test-utils__/middleware-mock';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/api/v1/middleware', middlewareMockFactory);

vi.mock('@/lib/api/validation', () => ({
  getTierLimits: () =>
    Promise.resolve({ maxFileSize: 100 * 1024 * 1024, maxDuration: 120, creditsPerMonth: 30 }),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 9 }),
}));

import {
  databaseMockFactory,
  mockCreateReelJob,
  mockConsumeCredits,
  mockGetCreditCost,
  mockUpdateReelJobStatus,
  mockCanUserAccessModule,
  mockGetModuleBySlug,
  mockIsUnlimited,
} from '@/__test-utils__/database-mock';
vi.mock('@reelstack/database', databaseMockFactory);

import { queueMockFactory, mockEnqueue } from '@/__test-utils__/queue-mock';
vi.mock('@reelstack/queue', queueMockFactory);

const { POST } = await import('../../v1/reel/generate/route');

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: 'key-1', scopes: ['*'] };

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/v1/reel/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/v1/reel/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCreditCost.mockResolvedValue(10);
    mockUpdateReelJobStatus.mockResolvedValue({});
    // Module access defaults: allowed, not-owner, fallback cost 10
    mockCanUserAccessModule.mockResolvedValue(true);
    mockIsUnlimited.mockReturnValue(false);
    mockGetModuleBySlug.mockResolvedValue(null);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthenticate.mockResolvedValue(null);
    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const req = new Request('http://localhost/api/v1/reel/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as NextRequest;
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for empty script', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    const response = await POST(makeRequest({ script: '' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 429 when credits and tokens exhausted', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: false, source: null });
    const response = await POST(makeRequest({ script: 'Hello world' }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('creates reel job and returns 201 with tier credit', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-1' });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ script: 'Hello world' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.jobId).toBe('reel-1');
    expect(body.data.status).toBe('queued');
    expect(body.data.creditSource).toBe('tier');
    expect(body.data.pollUrl).toBe('/api/v1/reel/render/reel-1');
  });

  it('returns mode=generate for script-only request', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-1' });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ script: 'Hello world' }));
    const body = await response.json();
    expect(body.data.mode).toBe('generate');
  });

  it('returns mode=compose when assets provided', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-2' });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(
      makeRequest({
        script: 'Hello world',
        assets: [
          {
            id: 'v1',
            url: 'https://example.com/video.mp4',
            type: 'video',
            description: 'Talking head',
            isPrimary: true,
          },
        ],
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.mode).toBe('compose');
  });

  it('returns creditSource token when token consumed', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'token' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-2' });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.creditSource).toBe('token');
  });

  it('enqueues to reel-render queue', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-3' });
    mockEnqueue.mockResolvedValue(undefined);

    await POST(makeRequest({ script: 'Hello' }));
    expect(mockEnqueue).toHaveBeenCalledWith('reel-3', { jobId: 'reel-3' }, 'reel-render');
  });

  it('returns 503 when queue unavailable', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-4' });
    mockEnqueue.mockRejectedValue(new Error('queue down'));

    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(503);
  });

  it('passes config to createReelJob', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-5' });
    mockEnqueue.mockResolvedValue(undefined);

    await POST(
      makeRequest({
        script: 'Hello world',
        layout: 'split-screen',
        style: 'cinematic',
      })
    );

    expect(mockCreateReelJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        script: 'Hello world',
        reelConfig: expect.objectContaining({
          layout: 'split-screen',
          style: 'cinematic',
          mode: 'generate',
        }),
      })
    );
  });

  it('stores mode=compose in reelConfig when assets provided', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-6' });
    mockEnqueue.mockResolvedValue(undefined);

    await POST(
      makeRequest({
        script: 'Hello world',
        assets: [
          { id: 'v1', url: 'https://example.com/v.mp4', type: 'video', description: 'Video' },
        ],
      })
    );

    expect(mockCreateReelJob).toHaveBeenCalledWith(
      expect.objectContaining({
        reelConfig: expect.objectContaining({ mode: 'compose' }),
      })
    );
  });

  it('returns 403 when user lacks module access', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockCanUserAccessModule.mockResolvedValue(false);
    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(mockConsumeCredits).not.toHaveBeenCalled();
  });

  it('uses per-module credit cost when module row exists', async () => {
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockCanUserAccessModule.mockResolvedValue(true);
    mockGetModuleBySlug.mockResolvedValue({ creditCost: 25 });
    mockConsumeCredits.mockResolvedValue({ consumed: true, source: 'tier' });
    mockCreateReelJob.mockResolvedValue({ id: 'reel-7' });
    mockEnqueue.mockResolvedValue(undefined);

    await POST(makeRequest({ script: 'Hello' }));

    // Third positional arg to consumeCredits is the per-module cost.
    expect(mockConsumeCredits).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 25);
  });

  it('owner bypasses credit consumption', async () => {
    const ownerCtx = { ...mockAuthCtx, user: { ...mockUser, isOwner: true } };
    mockAuthenticate.mockResolvedValue(ownerCtx);
    mockIsUnlimited.mockReturnValue(true);
    mockCanUserAccessModule.mockResolvedValue(true);
    mockCreateReelJob.mockResolvedValue({ id: 'reel-owner' });
    mockEnqueue.mockResolvedValue(undefined);

    const response = await POST(makeRequest({ script: 'Hello' }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.creditSource).toBe('owner');
    expect(mockConsumeCredits).not.toHaveBeenCalled();
  });
});
