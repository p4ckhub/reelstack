/**
 * Tests for pipeline fixes:
 * 1. Resume wiring — engine.resumeFrom() called when fromStepId provided
 * 2. Cost tracking in pipeline artifacts — persist() includes costs
 * 3. API call logging — logApiCall() flows to PipelineLogger.saveApiCall()
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────

import {
  storageMockFactory,
  mockUpload,
  mockGetSignedUrl,
  mockDownload,
} from '../__test-utils__/storage-mock';

const storedFiles = new Map<string, Buffer>();

vi.mock('@reelstack/storage', storageMockFactory);

mockUpload.mockImplementation((buf: Buffer, key: string) => {
  storedFiles.set(key, buf);
  return Promise.resolve('ok');
});
mockDownload.mockImplementation((key: string) => {
  const data = storedFiles.get(key);
  if (!data) return Promise.reject(new Error(`Not found: ${key}`));
  return Promise.resolve(data);
});
mockGetSignedUrl.mockResolvedValue('https://signed.url');

import { loggerMockFactory } from '../__test-utils__/logger-mock';
vi.mock('@reelstack/logger', loggerMockFactory);

import { PipelineLogger } from '../orchestrator/pipeline-logger';
import { runWithJobId, addCost, getCostSummary, setApiCallLogger, logApiCall } from '../context';

// ── Tests ────────────────────────────────────────────────────

describe('pipeline fixes', () => {
  beforeEach(() => {
    mockUpload.mockClear();
    storedFiles.clear();
  });

  // ── Fix 1: Resume wiring ─────────────────────────────────

  describe('resume wiring', () => {
    it('PipelineEngine.resumeFrom loads context and starts from given step', async () => {
      // This tests the engine itself (not the worker wrapper)
      const { PipelineEngine } = await import('../orchestrator/pipeline-engine');

      const engine = new PipelineEngine();
      const step1Executed = vi.fn().mockResolvedValue({ data: 'step1-result' });
      const step2Executed = vi.fn().mockResolvedValue({ data: 'step2-result' });
      const step3Executed = vi.fn().mockResolvedValue({ data: 'step3-result' });

      const pipeline = {
        id: 'test',
        name: 'Test Pipeline',
        steps: [
          { id: 'step-1', name: 'Step 1', dependsOn: [], execute: step1Executed },
          { id: 'step-2', name: 'Step 2', dependsOn: ['step-1'], execute: step2Executed },
          { id: 'step-3', name: 'Step 3', dependsOn: ['step-2'], execute: step3Executed },
        ],
      };

      // First: run all steps to completion so context is persisted
      const fullResult = await engine.runAll(pipeline, { input: 'test' }, 'resume-test-job');
      expect(fullResult.status).toBe('completed');
      expect(step1Executed).toHaveBeenCalledTimes(1);
      expect(step2Executed).toHaveBeenCalledTimes(1);
      expect(step3Executed).toHaveBeenCalledTimes(1);

      // Reset mocks
      step1Executed.mockClear();
      step2Executed.mockClear();
      step3Executed.mockClear();

      // Now resume from step-2 — step-1 should NOT be re-executed
      const resumeResult = await engine.resumeFrom(pipeline, 'resume-test-job', 'step-2');
      expect(resumeResult.status).toBe('completed');
      expect(step1Executed).not.toHaveBeenCalled(); // skipped!
      expect(step2Executed).toHaveBeenCalledTimes(1); // re-executed
      expect(step3Executed).toHaveBeenCalledTimes(1); // continued
    });
  });

  // ── Fix 2: Cost tracking in pipeline artifacts ────────────

  describe('costs in pipeline.json', () => {
    it('persist() includes cost summary when costs exist', async () => {
      await runWithJobId('cost-test-job', async () => {
        // Simulate costs being added during pipeline execution
        addCost({
          step: 'llm:planner',
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          type: 'llm',
          costUSD: 0.05,
          inputUnits: 1000,
          outputUnits: 500,
        });
        addCost({
          step: 'asset:veo31',
          provider: 'vertex-ai',
          type: 'video',
          costUSD: 1.6,
          inputUnits: 1,
        });

        const logger = new PipelineLogger('cost-test-job');
        logger.logStep('plan', 100);
        await logger.persist();

        // Find the pipeline.json upload
        const pipelineCall = mockUpload.mock.calls.find(
          (c: unknown[]) => c[1] === 'jobs/cost-test-job/pipeline.json'
        );
        expect(pipelineCall).toBeDefined();

        const parsed = JSON.parse((pipelineCall![0] as Buffer).toString('utf-8'));
        expect(parsed.costs).toBeDefined();
        expect(parsed.costs.totalUSD).toBeCloseTo(1.65);
        expect(parsed.costs.byProvider['anthropic']).toBeCloseTo(0.05);
        expect(parsed.costs.byProvider['vertex-ai']).toBeCloseTo(1.6);
        expect(parsed.costs.byType['llm']).toBeCloseTo(0.05);
        expect(parsed.costs.byType['video']).toBeCloseTo(1.6);
        expect(parsed.costs.entries).toHaveLength(2);
      });
    });

    it('persist() omits costs field when no costs', async () => {
      await runWithJobId('no-cost-job', async () => {
        const logger = new PipelineLogger('no-cost-job');
        logger.logStep('plan', 100);
        await logger.persist();

        const pipelineCall = mockUpload.mock.calls.find(
          (c: unknown[]) => c[1] === 'jobs/no-cost-job/pipeline.json'
        );
        const parsed = JSON.parse((pipelineCall![0] as Buffer).toString('utf-8'));
        expect(parsed.costs).toBeUndefined();
      });
    });
  });

  // ── Fix 3: API call logging ───────────────────────────────

  describe('API call logging via context', () => {
    it('logApiCall flows to PipelineLogger.saveApiCall', async () => {
      await runWithJobId('api-log-job', async () => {
        const logger = new PipelineLogger('api-log-job');
        setApiCallLogger(logger);

        logApiCall('llm:planner', 'anthropic-123', {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          request: {
            systemPrompt: 'You are a video planner...',
            userMessage: 'Plan this reel: ...',
          },
          response: {
            text: '{"shots": [...]}',
            usage: { inputTokens: 1000, outputTokens: 500 },
          },
          durationMs: 2500,
        });

        // Force flush pending uploads
        await logger.persist();

        // Find the API call artifact upload
        const apiCallUpload = mockUpload.mock.calls.find(
          (c: unknown[]) =>
            typeof c[1] === 'string' &&
            (c[1] as string).includes('api-calls/llm:planner/anthropic-123.json')
        );
        expect(apiCallUpload).toBeDefined();

        const parsed = JSON.parse((apiCallUpload![0] as Buffer).toString('utf-8'));
        expect(parsed.provider).toBe('anthropic');
        expect(parsed.model).toBe('claude-sonnet-4-6');
        expect(parsed.request.systemPrompt).toBe('You are a video planner...');
        expect(parsed.response.text).toBe('{"shots": [...]}');
        expect(parsed.response.usage.inputTokens).toBe(1000);
        expect(parsed.durationMs).toBe(2500);
      });
    });

    it('logApiCall is no-op when no logger set', () => {
      runWithJobId('no-logger-job', () => {
        // No setApiCallLogger called — should not throw
        expect(() =>
          logApiCall('llm:planner', 'test-1', {
            provider: 'anthropic',
            model: 'test',
            request: { systemPrompt: 'x', userMessage: 'y' },
            response: { text: 'z' },
            durationMs: 100,
          })
        ).not.toThrow();
      });
    });

    it('logApiCall is no-op outside job context', () => {
      // No runWithJobId — should not throw
      expect(() =>
        logApiCall('llm:planner', 'test-1', {
          provider: 'anthropic',
          model: 'test',
          request: { systemPrompt: 'x', userMessage: 'y' },
          response: { text: 'z' },
          durationMs: 100,
        })
      ).not.toThrow();
    });
  });
});
