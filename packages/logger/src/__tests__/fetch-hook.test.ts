/**
 * End-to-end tests for the global fetch hook.
 *
 * Drives `performLoggedFetch` with mock `fetchImpl` so we can assert that
 * the full audit pipeline (redact → scrub → dispatch to sinks) works
 * exactly as intended without touching `globalThis.fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addGlobalApiCallSink,
  performLoggedFetch,
  installFetchHook,
  removeGlobalApiCallSink,
  runInsideSink,
  runWithJobContext,
  setApiCallLogger,
  type ApiCallLogEntry,
  type ApiCallLogger,
} from '../index';

function makeSink(): ApiCallLogger & { calls: ApiCallLogEntry[] } {
  const calls: ApiCallLogEntry[] = [];
  return {
    calls,
    saveApiCall(entry) {
      calls.push(entry);
    },
  };
}

function mockJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('performLoggedFetch', () => {
  it('logs a successful request with scrubbed body and redacted headers', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({ ok: true, text: 'hi' }));

    await runWithJobContext('job-happy', async () => {
      setApiCallLogger(sink);
      await performLoggedFetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer sk-secret-123',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ prompt: 'Hello' }),
        },
        mockFetch as unknown as typeof fetch
      );
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(sink.calls).toHaveLength(1);
    const entry = sink.calls[0];
    expect(entry.jobId).toBe('job-happy');
    expect(entry.method).toBe('POST');
    expect(entry.provider).toBe('anthropic');
    expect(entry.kind).toBe('llm');
    expect(entry.responseStatus).toBe(200);
    expect(entry.requestHeaders?.Authorization).toBe('[REDACTED]');
    expect(entry.requestBody).toEqual({ prompt: 'Hello' });
    expect(entry.responseBody).toEqual({ ok: true, text: 'hi' });
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('strips long base64 from request body', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({ done: true }));
    const huge = 'A'.repeat(1024);

    await runWithJobContext('job-b64', async () => {
      setApiCallLogger(sink);
      await performLoggedFetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          body: JSON.stringify({ image: huge, note: 'keep' }),
          headers: { 'content-type': 'application/json' },
        },
        mockFetch as unknown as typeof fetch
      );
    });

    const body = sink.calls[0].requestBody as { image: string; note: string };
    expect(body.image).toMatch(/^\[base64 stripped:/);
    expect(body.note).toBe('keep');
  });

  it('describes binary responses by size, not content', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': '4' },
        })
    );

    await runWithJobContext('job-bin', async () => {
      setApiCallLogger(sink);
      await performLoggedFetch(
        'https://cdn.example.com/a.mp4',
        undefined,
        mockFetch as unknown as typeof fetch
      );
    });

    expect(sink.calls[0].responseBody).toMatch(/^\[binary:/);
  });

  it('logs and rethrows on fetch failure', async () => {
    const sink = makeSink();
    const err = new Error('net down');
    const mockFetch = vi.fn(async () => {
      throw err;
    });

    await runWithJobContext('job-err', async () => {
      setApiCallLogger(sink);
      await expect(
        performLoggedFetch(
          'https://api.heygen.com/v2/video/generate',
          { method: 'POST' },
          mockFetch as unknown as typeof fetch
        )
      ).rejects.toThrow('net down');
    });

    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].error).toBe('Error: net down');
    expect(sink.calls[0].responseStatus).toBeUndefined();
  });

  it('passes through without logging when no jobContext', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({ ok: true }));

    // No runWithJobContext — entry should not reach any sink.
    addGlobalApiCallSink(sink);
    try {
      await performLoggedFetch(
        'https://api.example.com/ping',
        undefined,
        mockFetch as unknown as typeof fetch
      );
    } finally {
      removeGlobalApiCallSink(sink);
    }

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(sink.calls).toHaveLength(0);
  });

  it('passes through without logging when jobContext has no sink', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({ ok: true }));

    await runWithJobContext('job-no-sink', async () => {
      // No setApiCallLogger, no addGlobalApiCallSink — hook should skip logging.
      await performLoggedFetch(
        'https://api.example.com/ping',
        undefined,
        mockFetch as unknown as typeof fetch
      );
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(sink.calls).toHaveLength(0);
  });

  it('skips logging for fetches issued from inside the sink (reentrancy guard)', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({ ok: true }));

    await runWithJobContext('job-reentrant', async () => {
      setApiCallLogger(sink);
      await runInsideSink(async () => {
        // Simulates a sink's own R2 upload or DB write triggering fetch.
        await performLoggedFetch(
          'https://api.example.com/upload',
          { method: 'PUT' },
          mockFetch as unknown as typeof fetch
        );
      });
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(sink.calls).toHaveLength(0);
  });

  it('dispatches to per-job sink AND all registered global sinks', async () => {
    const perJob = makeSink();
    const globalA = makeSink();
    const globalB = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({ ok: true }));

    addGlobalApiCallSink(globalA);
    addGlobalApiCallSink(globalB);
    try {
      await runWithJobContext('job-fanout', async () => {
        setApiCallLogger(perJob);
        await performLoggedFetch(
          'https://api.example.com/x',
          undefined,
          mockFetch as unknown as typeof fetch
        );
      });
    } finally {
      removeGlobalApiCallSink(globalA);
      removeGlobalApiCallSink(globalB);
    }

    expect(perJob.calls).toHaveLength(1);
    expect(globalA.calls).toHaveLength(1);
    expect(globalB.calls).toHaveLength(1);
    expect(perJob.calls[0].jobId).toBe('job-fanout');
    expect(globalA.calls[0].jobId).toBe('job-fanout');
    expect(globalB.calls[0].jobId).toBe('job-fanout');
    // All three see the exact same entry object shape.
    expect(globalA.calls[0].callId).toBe(perJob.calls[0].callId);
  });

  it('swallows errors thrown by a sink (one bad sink does not break logging)', async () => {
    const good = makeSink();
    const bad: ApiCallLogger = {
      saveApiCall() {
        throw new Error('sink exploded');
      },
    };
    const mockFetch = vi.fn(async () => mockJsonResponse({ ok: true }));

    addGlobalApiCallSink(bad);
    try {
      await runWithJobContext('job-badsink', async () => {
        setApiCallLogger(good);
        await performLoggedFetch(
          'https://api.example.com/y',
          undefined,
          mockFetch as unknown as typeof fetch
        );
      });
    } finally {
      removeGlobalApiCallSink(bad);
    }

    expect(good.calls).toHaveLength(1);
  });
});

describe('addGlobalApiCallSink', () => {
  it('is idempotent for the same instance', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({}));

    addGlobalApiCallSink(sink);
    addGlobalApiCallSink(sink);
    try {
      await runWithJobContext('job-dup', async () => {
        await performLoggedFetch(
          'https://api.example.com/',
          undefined,
          mockFetch as unknown as typeof fetch
        );
      });
    } finally {
      removeGlobalApiCallSink(sink);
    }

    expect(sink.calls).toHaveLength(1);
  });

  it('can be removed', async () => {
    const sink = makeSink();
    const mockFetch = vi.fn(async () => mockJsonResponse({}));

    addGlobalApiCallSink(sink);
    removeGlobalApiCallSink(sink);
    await runWithJobContext('job-removed', async () => {
      await performLoggedFetch(
        'https://api.example.com/',
        undefined,
        mockFetch as unknown as typeof fetch
      );
    });
    expect(sink.calls).toHaveLength(0);
  });
});

describe('installFetchHook', () => {
  let originalGlobalFetch: typeof fetch;

  beforeEach(() => {
    originalGlobalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalGlobalFetch;
  });

  it('swaps globalThis.fetch on first call, no-op on second', () => {
    const before = globalThis.fetch;
    installFetchHook();
    const afterFirst = globalThis.fetch;
    expect(afterFirst).not.toBe(before);
    installFetchHook();
    const afterSecond = globalThis.fetch;
    expect(afterSecond).toBe(afterFirst);
  });
});
