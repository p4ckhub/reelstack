import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  PipelineContext,
  PipelineDefinition,
  PipelineResult,
  StepDefinition,
  StepStatus,
} from '../pipeline-engine';

// ── Storage mock ──────────────────────────────────────────────

const mockUpload = vi.fn().mockResolvedValue('uploaded-key');
const mockDownload = vi.fn<(path: string) => Promise<Buffer>>();
const mockDelete = vi.fn();
const mockGetSignedUrl = vi.fn().mockResolvedValue('https://signed.url');

vi.mock('@reelstack/storage', () => ({
  createStorage: () =>
    Promise.resolve({
      upload: (...args: unknown[]) => mockUpload(...args),
      download: (...args: unknown[]) => mockDownload(...(args as [string])),
      getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    }),
}));

vi.mock('@reelstack/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

import { PipelineEngine } from '../pipeline-engine';

// ── Helpers ───────────────────────────────────────────────────

function makeStep(
  id: string,
  dependsOn: string[] = [],
  result: unknown = { ok: true }
): StepDefinition {
  return {
    id,
    name: `Step ${id}`,
    dependsOn,
    execute: vi.fn().mockResolvedValue(result),
  };
}

function makePipeline(steps: StepDefinition[]): PipelineDefinition {
  return { id: 'test-pipeline', name: 'Test Pipeline', steps };
}

function storedContext(ctx: PipelineContext): Buffer {
  return Buffer.from(JSON.stringify(ctx));
}

// ── Tests ─────────────────────────────────────────────────────

describe('PipelineEngine', () => {
  let engine: PipelineEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PipelineEngine();
  });

  // ── Core execution ────────────────────────────────────────

  describe('runAll', () => {
    it('runs all steps in order', async () => {
      const stepA = makeStep('a');
      const stepB = makeStep('b', ['a']);
      const stepC = makeStep('c', ['b']);
      const pipeline = makePipeline([stepA, stepB, stepC]);

      const result = await engine.runAll(pipeline, {}, 'job-1');

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(3);
      expect(result.steps.every((s) => s.status === 'completed')).toBe(true);

      // Verify execution order: A before B before C
      // mock.invocationCallOrder gives the global call sequence number
      const orderA = (stepA.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      const orderB = (stepB.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      const orderC = (stepC.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      expect(orderA).toBeLessThan(orderB);
      expect(orderB).toBeLessThan(orderC);
    });

    it('passes accumulated context between steps', async () => {
      const stepA = makeStep('a', [], { voiceUrl: '/a.mp3' });
      const stepB: StepDefinition = {
        id: 'b',
        name: 'Step B',
        dependsOn: ['a'],
        execute: vi.fn().mockImplementation((ctx: PipelineContext) => {
          // Step B should see step A's result
          expect(ctx.results['a']).toEqual({ voiceUrl: '/a.mp3' });
          return Promise.resolve({ transcript: 'hello' });
        }),
      };
      const pipeline = makePipeline([stepA, stepB]);

      const result = await engine.runAll(pipeline, { script: 'test' }, 'job-2');

      expect(result.context.results['a']).toEqual({ voiceUrl: '/a.mp3' });
      expect(result.context.results['b']).toEqual({ transcript: 'hello' });
      expect(result.context.input).toEqual({ script: 'test' });
    });

    it('stops on first step failure', async () => {
      const stepA = makeStep('a');
      const stepB: StepDefinition = {
        id: 'b',
        name: 'Step B',
        dependsOn: ['a'],
        execute: vi.fn().mockRejectedValue(new Error('TTS failed')),
      };
      const stepC = makeStep('c', ['b']);
      const pipeline = makePipeline([stepA, stepB, stepC]);

      const result = await engine.runAll(pipeline, {}, 'job-3');

      expect(result.status).toBe('failed');
      expect(result.failedStepId).toBe('b');
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].status).toBe('failed');
      expect(result.steps[1].error).toBe('TTS failed');
      expect(result.steps[2].status).toBe('pending');
      expect(stepC.execute).not.toHaveBeenCalled();
    });

    it('reports correct status for each step', async () => {
      const stepA = makeStep('a', [], 'done-a');
      const stepB = makeStep('b', ['a'], 'done-b');
      const pipeline = makePipeline([stepA, stepB]);

      const result = await engine.runAll(pipeline, {}, 'job-4');

      for (const step of result.steps) {
        expect(step.status).toBe('completed');
        expect(step.durationMs).toBeGreaterThanOrEqual(0);
        expect(step.completedAt).toBeTypeOf('number');
      }
    });

    it('calls onProgress callback for each step', async () => {
      const stepA = makeStep('a');
      const stepB = makeStep('b', ['a']);
      const pipeline = makePipeline([stepA, stepB]);
      const onProgress = vi.fn();

      await engine.runAll(pipeline, {}, 'job-5', onProgress);

      // Each step triggers 'running' and 'completed' callbacks
      expect(onProgress).toHaveBeenCalledTimes(4);
      expect(onProgress).toHaveBeenCalledWith('a', expect.objectContaining({ status: 'running' }));
      expect(onProgress).toHaveBeenCalledWith(
        'a',
        expect.objectContaining({ status: 'completed' })
      );
      expect(onProgress).toHaveBeenCalledWith('b', expect.objectContaining({ status: 'running' }));
      expect(onProgress).toHaveBeenCalledWith(
        'b',
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  // ── Dependency checking ───────────────────────────────────

  describe('dependency validation', () => {
    it('validates step dependencies before execution', async () => {
      // Step B depends on 'x' which is not in the pipeline
      const stepA = makeStep('a');
      const stepB: StepDefinition = {
        id: 'b',
        name: 'Step B',
        dependsOn: ['x'],
        execute: vi.fn(),
      };
      const pipeline = makePipeline([stepA, stepB]);

      await expect(engine.runAll(pipeline, {}, 'job-dep-1')).rejects.toThrow(
        /dependency.*x.*not found/i
      );
    });

    it('refuses to run step when dependencies not met on resume', async () => {
      const stepA = makeStep('a');
      const stepB = makeStep('b', ['a']);
      const pipeline = makePipeline([stepA, stepB]);

      // Provide context where step A hasn't completed
      const emptyCtx: PipelineContext = { jobId: 'job-dep-2', results: {}, input: {} };
      mockDownload.mockResolvedValueOnce(storedContext(emptyCtx));

      await expect(engine.resumeFrom(pipeline, 'job-dep-2', 'b')).rejects.toThrow(
        /dependencies not met.*b/i
      );
    });

    it('allows steps with no dependencies to run first', async () => {
      const stepA = makeStep('a');
      const pipeline = makePipeline([stepA]);

      const result = await engine.runAll(pipeline, {}, 'job-dep-3');

      expect(result.status).toBe('completed');
      expect(stepA.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ── Context persistence ───────────────────────────────────

  describe('context persistence', () => {
    it('persists context after each step', async () => {
      const stepA = makeStep('a', [], 'result-a');
      const stepB = makeStep('b', ['a'], 'result-b');
      const pipeline = makePipeline([stepA, stepB]);

      await engine.runAll(pipeline, { x: 1 }, 'job-p1');

      // Context uploaded after step A and after step B
      const contextUploads = mockUpload.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[1] === 'string' && (call[1] as string).includes('context.json')
      );
      expect(contextUploads.length).toBeGreaterThanOrEqual(2);
    });

    it('loads persisted context on resume', async () => {
      const stepA = makeStep('a', [], 'result-a');
      const stepB = makeStep('b', ['a'], 'result-b');
      const pipeline = makePipeline([stepA, stepB]);

      const savedCtx: PipelineContext = {
        jobId: 'job-p2',
        results: { a: 'result-a' },
        input: { script: 'hello' },
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      const result = await engine.resumeFrom(pipeline, 'job-p2', 'b');

      expect(result.status).toBe('completed');
      expect(result.context.results['b']).toBe('result-b');
      // Step A was not re-executed
      expect(stepA.execute).not.toHaveBeenCalled();
    });

    it('saves individual step results to storage', async () => {
      const stepA = makeStep('a', [], { data: 42 });
      const pipeline = makePipeline([stepA]);

      await engine.runAll(pipeline, {}, 'job-p3');

      const stepUploads = mockUpload.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[1] === 'string' && (call[1] as string).includes('steps/a.json')
      );
      expect(stepUploads).toHaveLength(1);
      const uploaded = JSON.parse(stepUploads[0][0].toString());
      expect(uploaded).toEqual({ data: 42 });
    });
  });

  // ── Resume ────────────────────────────────────────────────

  describe('resumeFrom', () => {
    it('resumes from a specific step', async () => {
      const stepA = makeStep('a', [], 'result-a');
      const stepB = makeStep('b', ['a'], 'result-b');
      const stepC = makeStep('c', ['b'], 'result-c');
      const pipeline = makePipeline([stepA, stepB, stepC]);

      const savedCtx: PipelineContext = {
        jobId: 'job-r1',
        results: { a: 'result-a' },
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      const result = await engine.resumeFrom(pipeline, 'job-r1', 'b');

      expect(result.status).toBe('completed');
      expect(stepA.execute).not.toHaveBeenCalled();
      expect(stepB.execute).toHaveBeenCalled();
      expect(stepC.execute).toHaveBeenCalled();
    });

    it('skips already-completed steps on resume', async () => {
      const stepA = makeStep('a', [], 'result-a');
      const stepB = makeStep('b', ['a'], 'result-b');
      const stepC = makeStep('c', ['b'], 'result-c');
      const pipeline = makePipeline([stepA, stepB, stepC]);

      const savedCtx: PipelineContext = {
        jobId: 'job-r2',
        results: { a: 'result-a', b: 'result-b' },
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      const result = await engine.resumeFrom(pipeline, 'job-r2', 'c');

      expect(stepA.execute).not.toHaveBeenCalled();
      expect(stepB.execute).not.toHaveBeenCalled();
      expect(stepC.execute).toHaveBeenCalled();
      expect(result.steps[0].status).toBe('skipped');
      expect(result.steps[1].status).toBe('skipped');
      expect(result.steps[2].status).toBe('completed');
    });

    it('fails to resume if dependencies not in context', async () => {
      const stepA = makeStep('a');
      const stepB = makeStep('b', ['a']);
      const pipeline = makePipeline([stepA, stepB]);

      const savedCtx: PipelineContext = {
        jobId: 'job-r3',
        results: {},
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      await expect(engine.resumeFrom(pipeline, 'job-r3', 'b')).rejects.toThrow(
        /dependencies not met/i
      );
    });
  });

  // ── Retry ─────────────────────────────────────────────────

  describe('retryStep', () => {
    it('retries a single step and updates context', async () => {
      const stepA = makeStep('a', [], 'result-a');
      const stepB = makeStep('b', ['a'], 'new-result-b');
      const pipeline = makePipeline([stepA, stepB]);

      const savedCtx: PipelineContext = {
        jobId: 'job-rt1',
        results: { a: 'result-a', b: 'old-result-b' },
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      const status = await engine.retryStep(pipeline, 'job-rt1', 'b');

      expect(status.status).toBe('completed');
      expect(stepB.execute).toHaveBeenCalledTimes(1);
    });

    it('retries with modified input merged into context', async () => {
      const stepA = makeStep('a', [], 'result-a');
      const stepB: StepDefinition = {
        id: 'b',
        name: 'Step B',
        dependsOn: ['a'],
        execute: vi.fn().mockImplementation((ctx: PipelineContext) => {
          expect(ctx.input['temperature']).toBe(0.5);
          return Promise.resolve('retry-ok');
        }),
      };
      const pipeline = makePipeline([stepA, stepB]);

      const savedCtx: PipelineContext = {
        jobId: 'job-rt2',
        results: { a: 'result-a' },
        input: { temperature: 0.8 },
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      const status = await engine.retryStep(pipeline, 'job-rt2', 'b', { temperature: 0.5 });

      expect(status.status).toBe('completed');
    });

    it('does not continue to next step after retry', async () => {
      const stepA = makeStep('a', [], 'result-a');
      const stepB = makeStep('b', ['a'], 'result-b');
      const stepC = makeStep('c', ['b'], 'result-c');
      const pipeline = makePipeline([stepA, stepB, stepC]);

      const savedCtx: PipelineContext = {
        jobId: 'job-rt3',
        results: { a: 'result-a' },
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      await engine.retryStep(pipeline, 'job-rt3', 'b');

      expect(stepB.execute).toHaveBeenCalledTimes(1);
      expect(stepC.execute).not.toHaveBeenCalled();
    });
  });

  // ── Status ────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns pending for steps not yet run', async () => {
      const stepA = makeStep('a');
      const stepB = makeStep('b', ['a']);
      const pipeline = makePipeline([stepA, stepB]);

      // No context stored yet
      mockDownload.mockRejectedValueOnce(new Error('not found'));

      const statuses = await engine.getStatus(pipeline, 'job-s1');

      expect(statuses).toHaveLength(2);
      expect(statuses.every((s) => s.status === 'pending')).toBe(true);
    });

    it('returns completed for finished steps', async () => {
      const stepA = makeStep('a');
      const stepB = makeStep('b', ['a']);
      const pipeline = makePipeline([stepA, stepB]);

      const savedCtx: PipelineContext = {
        jobId: 'job-s2',
        results: { a: 'result-a', b: 'result-b' },
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      const statuses = await engine.getStatus(pipeline, 'job-s2');

      expect(statuses[0].status).toBe('completed');
      expect(statuses[1].status).toBe('completed');
    });

    it('returns failed for errored step', async () => {
      const stepA = makeStep('a');
      const stepB: StepDefinition = {
        id: 'b',
        name: 'Step B',
        dependsOn: ['a'],
        execute: vi.fn().mockRejectedValue(new Error('boom')),
      };
      const pipeline = makePipeline([stepA, stepB]);

      const result = await engine.runAll(pipeline, {}, 'job-s3');

      expect(result.steps[1].status).toBe('failed');
      expect(result.steps[1].error).toBe('boom');
    });
  });

  // ── loadContext ───────────────────────────────────────────

  describe('loadContext', () => {
    it('returns context when it exists', async () => {
      const savedCtx: PipelineContext = {
        jobId: 'job-lc1',
        results: { a: 'x' },
        input: { k: 'v' },
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      const ctx = await engine.loadContext('job-lc1');

      expect(ctx).toEqual(savedCtx);
    });

    it('returns null when context does not exist', async () => {
      mockDownload.mockRejectedValueOnce(new Error('not found'));

      const ctx = await engine.loadContext('job-lc2');

      expect(ctx).toBeNull();
    });
  });

  // ── Edge cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty pipeline (no steps)', async () => {
      const pipeline = makePipeline([]);

      const result = await engine.runAll(pipeline, {}, 'job-e1');

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(0);
    });

    it('handles step that throws non-Error', async () => {
      const stepA: StepDefinition = {
        id: 'a',
        name: 'Step A',
        dependsOn: [],
        execute: vi.fn().mockRejectedValue('string error'),
      };
      const pipeline = makePipeline([stepA]);

      const result = await engine.runAll(pipeline, {}, 'job-e2');

      expect(result.status).toBe('failed');
      expect(result.steps[0].status).toBe('failed');
      expect(result.steps[0].error).toBe('string error');
    });

    it('handles storage failure gracefully during persist', async () => {
      // Storage upload fails but pipeline should still continue
      mockUpload.mockRejectedValueOnce(new Error('storage down'));
      mockUpload.mockRejectedValueOnce(new Error('storage down'));

      const stepA = makeStep('a', [], 'ok');
      const stepB = makeStep('b', ['a'], 'ok');
      const pipeline = makePipeline([stepA, stepB]);

      // Should not throw, should still run steps
      const result = await engine.runAll(pipeline, {}, 'job-e3');

      expect(result.status).toBe('completed');
      expect(stepA.execute).toHaveBeenCalled();
      expect(stepB.execute).toHaveBeenCalled();
    });

    it('throws when resuming with non-existent step ID', async () => {
      const stepA = makeStep('a');
      const pipeline = makePipeline([stepA]);

      const savedCtx: PipelineContext = {
        jobId: 'job-e4',
        results: {},
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      await expect(engine.resumeFrom(pipeline, 'job-e4', 'nonexistent')).rejects.toThrow(
        /step.*nonexistent.*not found/i
      );
    });

    it('throws when retrying non-existent step ID', async () => {
      const stepA = makeStep('a');
      const pipeline = makePipeline([stepA]);

      const savedCtx: PipelineContext = {
        jobId: 'job-e5',
        results: {},
        input: {},
      };
      mockDownload.mockResolvedValueOnce(storedContext(savedCtx));

      await expect(engine.retryStep(pipeline, 'job-e5', 'nonexistent')).rejects.toThrow(
        /step.*nonexistent.*not found/i
      );
    });
  });
});
