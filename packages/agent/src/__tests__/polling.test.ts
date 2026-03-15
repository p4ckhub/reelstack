import { describe, it, expect } from 'vitest';
import { pollUntilDone } from '../polling';
import type { ProductionTool } from '../registry/tool-interface';
import type { AssetGenerationStatus } from '../types';

/** Creates a minimal mock tool with a controllable poll function */
function mockTool(pollFn: (jobId: string) => Promise<AssetGenerationStatus>): ProductionTool {
  return {
    id: 'test-tool',
    name: 'Test Tool',
    capabilities: [],
    healthCheck: async () => ({ available: true }),
    generate: async () => ({ jobId: 'j1', toolId: 'test-tool', status: 'processing' }),
    poll: pollFn,
  };
}

describe('pollUntilDone', () => {
  it('returns completed status on first poll', async () => {
    const tool = mockTool(async () => ({
      jobId: 'j1',
      toolId: 'test-tool',
      status: 'completed',
      url: 'https://example.com/video.mp4',
    }));

    const result = await pollUntilDone(tool, 'j1', {
      initialDelayMs: 10,
      maxDelayMs: 10,
      timeoutMs: 1000,
    });

    expect(result.status).toBe('completed');
    expect(result.url).toBe('https://example.com/video.mp4');
  });

  it('returns failed status immediately', async () => {
    let callCount = 0;
    const tool = mockTool(async () => {
      callCount++;
      return {
        jobId: 'j1',
        toolId: 'test-tool',
        status: 'failed',
        error: 'insufficient credits',
      };
    });

    const result = await pollUntilDone(tool, 'j1', {
      initialDelayMs: 10,
      maxDelayMs: 10,
      timeoutMs: 1000,
    });

    expect(callCount).toBe(1); // Should stop on first failed
    expect(result.status).toBe('failed');
    expect(result.error).toBe('insufficient credits');
  });

  it('polls through processing until completed', async () => {
    let callCount = 0;
    const tool = mockTool(async () => {
      callCount++;
      if (callCount < 4) {
        return { jobId: 'j1', toolId: 'test-tool', status: 'processing' };
      }
      return {
        jobId: 'j1',
        toolId: 'test-tool',
        status: 'completed',
        url: 'https://done.mp4',
      };
    });

    const result = await pollUntilDone(tool, 'j1', {
      initialDelayMs: 10,
      maxDelayMs: 10,
      timeoutMs: 5000,
    });

    expect(result.status).toBe('completed');
    expect(callCount).toBe(4);
  });

  it('polls through processing until failed', async () => {
    let callCount = 0;
    const tool = mockTool(async () => {
      callCount++;
      if (callCount < 3) {
        return { jobId: 'j1', toolId: 'test-tool', status: 'processing' };
      }
      return {
        jobId: 'j1',
        toolId: 'test-tool',
        status: 'failed',
        error: 'generation error',
      };
    });

    const result = await pollUntilDone(tool, 'j1', {
      initialDelayMs: 10,
      maxDelayMs: 10,
      timeoutMs: 5000,
    });

    expect(result.status).toBe('failed');
    expect(callCount).toBe(3);
  });

  it('throws on timeout when task never completes', async () => {
    const tool = mockTool(async () => ({
      jobId: 'j1',
      toolId: 'test-tool',
      status: 'processing',
    }));

    await expect(
      pollUntilDone(tool, 'j1', {
        initialDelayMs: 10,
        maxDelayMs: 10,
        timeoutMs: 100,
      }),
    ).rejects.toThrow('Polling timed out');
  });

  it('throws when tool does not support polling', async () => {
    const tool: ProductionTool = {
      id: 'no-poll',
      name: 'No Poll Tool',
      capabilities: [],
      healthCheck: async () => ({ available: true }),
      generate: async () => ({ jobId: 'j1', toolId: 'no-poll', status: 'processing' }),
    };

    await expect(pollUntilDone(tool, 'j1')).rejects.toThrow('does not support polling');
  });
});
