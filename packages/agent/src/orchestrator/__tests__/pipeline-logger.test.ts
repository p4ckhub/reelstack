import { describe, it, expect, vi, beforeEach } from 'vitest';

import { storageMockFactory, mockUpload } from '../../__test-utils__/storage-mock';
vi.mock('@reelstack/storage', storageMockFactory);
mockUpload.mockResolvedValue('uploaded-key');

import { PipelineLogger } from '../pipeline-logger';

describe('PipelineLogger', () => {
  beforeEach(() => {
    mockUpload.mockClear();
    mockUpload.mockResolvedValue('uploaded-key');
  });

  it('logs steps with name, duration, input, and output', () => {
    const logger = new PipelineLogger('job-123');

    logger.logStep('script-review', 150, { script: 'Hello' }, { approved: true });
    logger.logStep('plan', 200, { style: 'dynamic' }, { shots: 3 });

    const steps = logger.getSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0].name).toBe('script-review');
    expect(steps[0].durationMs).toBe(150);
    expect(steps[0].input).toEqual({ script: 'Hello' });
    expect(steps[0].output).toEqual({ approved: true });
    expect(steps[0].error).toBeUndefined();
    expect(steps[1].name).toBe('plan');
  });

  it('logs steps with error', () => {
    const logger = new PipelineLogger('job-err');

    logger.logStep('tts', 50, { script: 'test' }, undefined, 'TTS provider failed');

    const steps = logger.getSteps();
    expect(steps[0].error).toBe('TTS provider failed');
  });

  it('getSteps returns a copy, not a reference', () => {
    const logger = new PipelineLogger('job-copy');
    logger.logStep('step-1', 10);

    const steps1 = logger.getSteps();
    logger.logStep('step-2', 20);
    const steps2 = logger.getSteps();

    expect(steps1).toHaveLength(1);
    expect(steps2).toHaveLength(2);
  });

  it('persist uploads pipeline.json to storage', async () => {
    const logger = new PipelineLogger('job-persist');
    logger.logStep('test-step', 100, { in: 1 }, { out: 2 });

    await logger.persist();

    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'jobs/job-persist/pipeline.json');

    // Verify the uploaded JSON is valid and contains expected data
    const uploadedBuffer = mockUpload.mock.calls.find(
      (c: unknown[]) => c[1] === 'jobs/job-persist/pipeline.json'
    )?.[0] as Buffer;
    const parsed = JSON.parse(uploadedBuffer.toString('utf-8'));
    expect(parsed.jobId).toBe('job-persist');
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0].name).toBe('test-step');
    expect(parsed.startedAt).toBeGreaterThan(0);
    expect(parsed.completedAt).toBeGreaterThanOrEqual(parsed.startedAt);
    expect(parsed.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('saveArtifact uploads to jobs/{jobId}/{key}', async () => {
    const logger = new PipelineLogger('job-artifact');

    logger.saveArtifact('02-plan.json', JSON.stringify({ shots: [] }));

    // Wait for the fire-and-forget upload via persist
    await logger.persist();

    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'jobs/job-artifact/02-plan.json');
  });

  it('saveArtifact handles string data', async () => {
    const logger = new PipelineLogger('job-text');

    logger.saveArtifact('04-prompts/shot-1-brief.txt', 'A robot walking in rain');

    await logger.persist();

    const briefCall = mockUpload.mock.calls.find(
      (c: unknown[]) => c[1] === 'jobs/job-text/04-prompts/shot-1-brief.txt'
    );
    expect(briefCall).toBeDefined();
    expect((briefCall![0] as Buffer).toString('utf-8')).toBe('A robot walking in rain');
  });

  it('saveArtifact handles Buffer data', async () => {
    const logger = new PipelineLogger('job-buf');
    const buf = Buffer.from('binary data');

    logger.saveArtifact('05-assets/shot-1.jpg', buf);

    await logger.persist();

    const assetCall = mockUpload.mock.calls.find(
      (c: unknown[]) => c[1] === 'jobs/job-buf/05-assets/shot-1.jpg'
    );
    expect(assetCall).toBeDefined();
    expect(assetCall![0]).toEqual(buf);
  });

  it('getSummary returns step count, duration, and tool usage', () => {
    const logger = new PipelineLogger('job-summary');
    logger.logStep('tts', 100);
    logger.logStep('asset-generation', 500, { toolId: 'seedance' });
    logger.logStep('asset-generation', 300, { toolId: 'pexels-video' });
    logger.logStep('asset-generation', 200, { toolId: 'seedance' }); // duplicate tool

    const summary = logger.getSummary();
    expect(summary.stepCount).toBe(4);
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(summary.toolsUsed).toContain('seedance');
    expect(summary.toolsUsed).toContain('pexels-video');
    expect(summary.toolsUsed).toHaveLength(2); // deduped
    expect(summary.steps).toHaveLength(4);
    expect(summary.steps[0]).toEqual({ name: 'tts', durationMs: 100, hasError: false });
  });

  it('getSummary marks steps with errors', () => {
    const logger = new PipelineLogger('job-err-summary');
    logger.logStep('tts', 100, undefined, undefined, 'failed');

    const summary = logger.getSummary();
    expect(summary.steps[0].hasError).toBe(true);
  });

  it('saveArtifact does not throw when storage upload fails', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Storage down'));

    const logger = new PipelineLogger('job-fail');
    // Should not throw
    logger.saveArtifact('test.json', '{}');

    // persist also should not throw even if pipeline.json upload fails
    mockUpload.mockRejectedValueOnce(new Error('Storage still down'));
    // Should resolve without throwing
    await logger.persist();
  });
});
