import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────

import { middlewareMockFactory, mockAuthenticate } from '@/__test-utils__/middleware-mock';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/api/v1/middleware', middlewareMockFactory);
vi.mock('@/lib/api/rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 9 }),
}));

vi.mock('@/lib/api/v1/pipeline-helpers', () => ({
  resolvePipelineDefinition: () => ({
    id: 'generate',
    name: 'Full Auto Generate',
    steps: [],
  }),
}));

import { databaseMockFactory, mockGetReelJob } from '@/__test-utils__/database-mock';
vi.mock('@reelstack/database', databaseMockFactory);

const mockPipelineEngineGetStatus = vi.fn();
const mockPipelineEngineRetryStep = vi.fn();
const mockPipelineEngineResumeFrom = vi.fn();
const mockPipelineEngineLoadContext = vi.fn();

const mockPipelineEngineFactory = () => ({
  getStatus: mockPipelineEngineGetStatus,
  retryStep: mockPipelineEngineRetryStep,
  resumeFrom: mockPipelineEngineResumeFrom,
  loadContext: mockPipelineEngineLoadContext,
});

vi.mock('@reelstack/agent', () => ({
  PipelineEngine: vi.fn().mockImplementation(mockPipelineEngineFactory),
  createGeneratePipeline: vi.fn().mockReturnValue({
    id: 'generate',
    name: 'Full Auto Generate',
    steps: [],
  }),
  isCoreMode: (mode: string) => ['generate', 'compose'].includes(mode),
  registerModule: vi.fn(),
  callLLM: vi.fn(),
}));

vi.mock('@reelstack/agent/pipeline', () => ({
  PipelineEngine: vi.fn().mockImplementation(mockPipelineEngineFactory),
}));

import { queueMockFactory, mockEnqueue } from '@/__test-utils__/queue-mock';
vi.mock('@reelstack/queue', queueMockFactory);

// ── Helpers ──────────────────────────────────────────────────

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };
const mockAuthCtx = { user: mockUser, apiKeyId: 'key-1', scopes: ['*'] };

function makeGetRequest(url: string): NextRequest {
  return new Request(url, { method: 'GET' }) as unknown as NextRequest;
}

function makePostRequest(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// ── Tests ────────────────────────────────────────────────────

describe('GET /api/v1/reel/render/[id]/steps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
  });

  it('returns step statuses for a job', async () => {
    mockGetReelJob.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'PROCESSING',
      reelConfig: { mode: 'generate' },
    });
    mockPipelineEngineGetStatus.mockResolvedValue([
      { id: 'tts', name: 'Generate voiceover', status: 'completed', durationMs: 5000 },
      { id: 'plan', name: 'Plan production', status: 'running' },
      { id: 'render', name: 'Render video', status: 'pending' },
    ]);

    const { GET } = await import('../../v1/reel/render/[id]/steps/route');
    const res = await GET(makeGetRequest('http://localhost/api/v1/reel/render/job-1/steps'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(3);
    expect(json.data[0]).toMatchObject({ id: 'tts', status: 'completed' });
  });

  it('returns 404 for non-existent job', async () => {
    mockGetReelJob.mockResolvedValue(null);

    const { GET } = await import('../../v1/reel/render/[id]/steps/route');
    const res = await GET(makeGetRequest('http://localhost/api/v1/reel/render/nonexistent/steps'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/reel/render/[id]/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
  });

  it('retries a specific step', async () => {
    mockGetReelJob.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      reelConfig: { mode: 'generate' },
    });
    mockPipelineEngineRetryStep.mockResolvedValue({
      id: 'tts',
      name: 'Generate voiceover',
      status: 'completed',
      durationMs: 3000,
    });

    const { POST } = await import('../../v1/reel/render/[id]/retry/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/render/job-1/retry', { stepId: 'tts' })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ id: 'tts', status: 'completed' });
  });

  it('requires stepId in body', async () => {
    mockGetReelJob.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      reelConfig: { mode: 'generate' },
    });

    const { POST } = await import('../../v1/reel/render/[id]/retry/route');
    const res = await POST(makePostRequest('http://localhost/api/v1/reel/render/job-1/retry', {}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts optional modifiedInput', async () => {
    mockGetReelJob.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      reelConfig: { mode: 'generate' },
    });
    mockPipelineEngineRetryStep.mockResolvedValue({
      id: 'tts',
      name: 'Generate voiceover',
      status: 'completed',
      durationMs: 2000,
    });

    const { POST } = await import('../../v1/reel/render/[id]/retry/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/render/job-1/retry', {
        stepId: 'tts',
        modifiedInput: { voice: 'en-US-GuyNeural' },
      })
    );
    const _json = await res.json();

    expect(res.status).toBe(200);
    expect(mockPipelineEngineRetryStep).toHaveBeenCalledWith(expect.anything(), 'job-1', 'tts', {
      voice: 'en-US-GuyNeural',
    });
  });

  it('returns updated step status', async () => {
    mockGetReelJob.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      reelConfig: { mode: 'generate' },
    });
    mockPipelineEngineRetryStep.mockResolvedValue({
      id: 'plan',
      name: 'Plan production',
      status: 'completed',
      durationMs: 1500,
      completedAt: 1710000000000,
    });

    const { POST } = await import('../../v1/reel/render/[id]/retry/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/render/job-1/retry', { stepId: 'plan' })
    );
    const json = await res.json();

    expect(json.data.id).toBe('plan');
    expect(json.data.status).toBe('completed');
    expect(json.data.durationMs).toBe(1500);
  });

  it('returns 404 for non-existent job', async () => {
    mockGetReelJob.mockResolvedValue(null);

    const { POST } = await import('../../v1/reel/render/[id]/retry/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/render/nonexistent/retry', { stepId: 'tts' })
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/v1/reel/render/[id]/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue(mockAuthCtx);
    mockEnqueue.mockResolvedValue(undefined);
  });

  it('resumes pipeline from a specific step', async () => {
    mockGetReelJob.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      reelConfig: { mode: 'generate' },
    });

    const { POST } = await import('../../v1/reel/render/[id]/resume/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/render/job-1/resume', {
        fromStepId: 'plan',
      })
    );

    expect(res.status).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ jobId: 'job-1', fromStepId: 'plan' }),
      'reel-render'
    );
  });

  it('requires fromStepId in body', async () => {
    mockGetReelJob.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: 'FAILED',
      reelConfig: { mode: 'generate' },
    });

    const { POST } = await import('../../v1/reel/render/[id]/resume/route');
    const res = await POST(makePostRequest('http://localhost/api/v1/reel/render/job-1/resume', {}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent job', async () => {
    mockGetReelJob.mockResolvedValue(null);

    const { POST } = await import('../../v1/reel/render/[id]/resume/route');
    const res = await POST(
      makePostRequest('http://localhost/api/v1/reel/render/nonexistent/resume', {
        fromStepId: 'plan',
      })
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});
