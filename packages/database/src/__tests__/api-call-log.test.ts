import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  mockApiCallLogCreate,
  mockApiCallLogFindMany,
  mockApiCallLogFindFirst,
} from './prisma-mock';

vi.mock('@prisma/client', async () => {
  const { prismaMockFactory } = await import('./prisma-mock');
  return prismaMockFactory();
});

const { dbApiCallSink, listApiCallLogs, getApiCallLog } = await import('../api-call-log');
import type { ApiCallLogEntry } from '@reelstack/logger';

function makeEntry(overrides: Partial<ApiCallLogEntry> = {}): ApiCallLogEntry {
  return {
    jobId: 'job-1',
    stepId: 'fetch',
    callId: 'call-abc',
    kind: 'llm',
    provider: 'anthropic',
    model: 'claude-opus',
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    requestHeaders: { Authorization: '[REDACTED]' },
    requestBody: { system: 'You are...', messages: [{ role: 'user', content: 'hi' }] },
    responseStatus: 200,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: { content: [{ type: 'text', text: 'hello' }] },
    durationMs: 1234,
    startedAt: 1776000000000,
    costUSD: 0.0123,
    ...overrides,
  };
}

describe('dbApiCallSink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the audit entry into ApiCallLog with correct mapping', async () => {
    mockApiCallLogCreate.mockResolvedValue({ id: 'row-1' });

    dbApiCallSink.saveApiCall(makeEntry());

    // fire-and-forget → let the microtask settle
    await Promise.resolve();

    expect(mockApiCallLogCreate).toHaveBeenCalledOnce();
    const arg = mockApiCallLogCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.jobId).toBe('job-1');
    expect(arg.data.callId).toBe('call-abc');
    expect(arg.data.kind).toBe('llm');
    expect(arg.data.provider).toBe('anthropic');
    expect(arg.data.method).toBe('POST');
    expect(arg.data.url).toBe('https://api.anthropic.com/v1/messages');
    expect(arg.data.responseStatus).toBe(200);
    expect(arg.data.durationMs).toBe(1234);
    expect(arg.data.costUSD).toBe(0.0123);
    expect(arg.data.startedAt).toBeInstanceOf(Date);
    expect(arg.data.requestBody).toEqual({
      system: 'You are...',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('maps missing optional fields to null', async () => {
    mockApiCallLogCreate.mockResolvedValue({ id: 'row-1' });

    dbApiCallSink.saveApiCall(
      makeEntry({
        model: undefined,
        costUSD: undefined,
        error: undefined,
        responseStatus: undefined,
      })
    );
    await Promise.resolve();

    const arg = mockApiCallLogCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.model).toBeNull();
    expect(arg.data.costUSD).toBeNull();
    expect(arg.data.error).toBeNull();
    expect(arg.data.responseStatus).toBeNull();
  });

  it('swallows prisma errors (audit must never break the pipeline)', () => {
    mockApiCallLogCreate.mockRejectedValue(new Error('DB down'));
    expect(() => dbApiCallSink.saveApiCall(makeEntry())).not.toThrow();
  });
});

describe('listApiCallLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clamps limit to 200 and queries by jobId ordered by createdAt', async () => {
    mockApiCallLogFindMany.mockResolvedValue([]);
    await listApiCallLogs({ jobId: 'job-1', limit: 5000 });
    const arg = mockApiCallLogFindMany.mock.calls[0][0] as {
      take: number;
      where: { jobId: string };
      orderBy: { createdAt: string };
    };
    expect(arg.take).toBe(200);
    expect(arg.where.jobId).toBe('job-1');
    expect(arg.orderBy.createdAt).toBe('asc');
  });

  it('honors cursor for pagination', async () => {
    mockApiCallLogFindMany.mockResolvedValue([]);
    await listApiCallLogs({ jobId: 'job-1', cursor: 'row-42' });
    const arg = mockApiCallLogFindMany.mock.calls[0][0] as {
      cursor?: { id: string };
      skip?: number;
    };
    expect(arg.cursor).toEqual({ id: 'row-42' });
    expect(arg.skip).toBe(1);
  });
});

describe('getApiCallLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries a single row by jobId + callId', async () => {
    mockApiCallLogFindFirst.mockResolvedValue({ id: 'row-1' });
    await getApiCallLog('job-1', 'call-abc');
    const arg = mockApiCallLogFindFirst.mock.calls[0][0] as {
      where: { jobId: string; callId: string };
    };
    expect(arg.where).toEqual({ jobId: 'job-1', callId: 'call-abc' });
  });
});
