import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  databaseMockFactory,
  mockGetReelJobInternal,
  mockUpdateReelJobStatus,
  mockMarkCallbackSent,
  mockResetCallbackSent,
} from '@/__test-utils__/database-mock';

vi.mock('@reelstack/database', databaseMockFactory);

const mockAgentProduce = vi.fn();
const mockProduceComposition = vi.fn();
const mockGetModule = vi.fn();
const mockModuleOrchestrate = vi.fn();
const mockPipelineEngineRunAll = vi.fn();
const mockRenderVideo = vi.fn();
vi.mock('@reelstack/agent', () => ({
  produce: (...args: unknown[]) => mockAgentProduce(...args),
  produceComposition: (...args: unknown[]) => mockProduceComposition(...args),
  getModule: (...args: unknown[]) => mockGetModule(...args),
  isCoreMode: (mode: string) => ['generate', 'compose'].includes(mode),
  listModules: () => [],
  registerModule: vi.fn(),
  callLLM: vi.fn(),
  PipelineEngine: vi.fn().mockImplementation(() => ({
    runAll: mockPipelineEngineRunAll,
  })),
  createGeneratePipeline: vi.fn().mockReturnValue({
    id: 'generate',
    name: 'Full Auto Generate',
    steps: [],
  }),
  // Functions used by createGenerateDeps()
  reviewScript: vi.fn(),
  isScriptReviewEnabled: vi.fn().mockReturnValue(false),
  runTTSPipeline: vi.fn(),
  buildTimingReference: vi.fn().mockReturnValue(''),
  selectMontageProfile: vi.fn().mockReturnValue({ id: 'default', name: 'Default' }),
  planProduction: vi.fn(),
  supervisePlan: vi.fn(),
  isPromptWriterEnabled: vi.fn().mockReturnValue(false),
  writePrompt: vi.fn(),
  generateAssets: vi.fn(),
  persistAssetsToStorage: vi.fn().mockResolvedValue([]),
  validatePlan: vi.fn().mockReturnValue({ valid: true, issues: [], fixedPlan: {} }),
  assembleComposition: vi.fn(),
  uploadVoiceover: vi.fn(),
  renderVideo: (...args: unknown[]) => mockRenderVideo(...args),
  discoverTools: vi.fn().mockReturnValue([]),
  ToolRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    discover: vi.fn().mockResolvedValue(undefined),
    getToolManifest: vi.fn().mockReturnValue({ tools: [], summary: '' }),
  })),
  getCostSummary: vi.fn().mockReturnValue({ totalUSD: 0, byType: {}, byProvider: {}, entries: [] }),
  resolvePresetConfig: vi.fn().mockReturnValue({
    maxWordsPerCue: 5,
    maxDurationPerCue: 3,
  }),
}));

const mockUpload = vi.fn();
const mockGetSignedUrl = vi.fn();
vi.mock('@reelstack/storage', () => ({
  createStorage: () =>
    Promise.resolve({
      upload: mockUpload,
      getSignedUrl: mockGetSignedUrl,
    }),
}));

const mockReadFile = vi.fn();
const mockUnlink = vi.fn();
vi.mock('fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  readFile: (...args: unknown[]) => mockReadFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

const { processReelPipelineJob } = await import('../reel-pipeline-worker');

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'reel-1',
  script: 'Hello world',
  callbackUrl: null,
  language: null,
  parentJobId: null,
  reelConfig: {
    mode: 'generate',
    layout: 'split-screen',
    style: 'cinematic',
  },
  ...overrides,
});

/** Helper: configure mockPipelineEngineRunAll for generate mode */
function mockGeneratePipelineResult() {
  mockPipelineEngineRunAll.mockResolvedValue({
    jobId: 'reel-1',
    status: 'completed',
    steps: [{ id: 'composition', name: 'Composition', status: 'completed' }],
    context: {
      jobId: 'reel-1',
      results: {
        composition: {
          reelProps: { compositionId: 'ReelVideo' },
          plan: {
            layout: 'split-screen',
            primarySource: { type: 'ai' },
            reasoning: '',
            shots: [],
            effects: [],
          },
        },
        'asset-persist': { assets: [] },
        tts: { audioDuration: 10 },
      },
      input: {},
    },
  });
}

/** Helper: configure mockPipelineEngineRunAll for compose mode (single-step) */
function mockComposePipelineResult() {
  mockPipelineEngineRunAll.mockResolvedValue({
    jobId: 'reel-1',
    status: 'completed',
    steps: [{ id: 'compose', name: 'Run compose orchestrator', status: 'completed' }],
    context: {
      jobId: 'reel-1',
      results: {
        compose: { outputPath: '/tmp/out.mp4', steps: [] },
      },
      input: {},
    },
  });
}

/** Helper: configure mockPipelineEngineRunAll for module mode (single-step) */
function mockModulePipelineResult() {
  mockPipelineEngineRunAll.mockResolvedValue({
    jobId: 'reel-1',
    status: 'completed',
    steps: [{ id: 'orchestrate', name: 'Run module', status: 'completed' }],
    context: {
      jobId: 'reel-1',
      results: {
        orchestrate: { outputPath: '/tmp/out.mp4', durationSeconds: 10 },
      },
      input: {},
    },
  });
}

describe('processReelPipelineJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReelJobStatus.mockResolvedValue({});
    mockMarkCallbackSent.mockResolvedValue(true);
    mockResetCallbackSent.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from('fake-mp4'));
    mockUpload.mockResolvedValue(undefined);
    mockGetSignedUrl.mockResolvedValue('https://storage.example.com/signed-url');
    mockUnlink.mockResolvedValue(undefined);
    mockAgentProduce.mockResolvedValue({
      outputPath: '/tmp/out.mp4',
      steps: [],
      generatedAssets: [],
    });
    mockProduceComposition.mockResolvedValue({ outputPath: '/tmp/out.mp4', steps: [] });
    mockModuleOrchestrate.mockResolvedValue({ outputPath: '/tmp/out.mp4', durationSeconds: 10 });
    mockRenderVideo.mockResolvedValue({
      outputPath: '/tmp/out.mp4',
      step: { name: 'render', durationMs: 1000, detail: '' },
    });
    mockGeneratePipelineResult();
    // Default: no module found (generate path will be used)
    mockGetModule.mockReturnValue(undefined);
  });

  it('throws when job not found', async () => {
    mockGetReelJobInternal.mockResolvedValue(null);
    await expect(processReelPipelineJob('nonexistent')).rejects.toThrow('not found');
  });

  it('sets status to PROCESSING on start', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith(
      'reel-1',
      expect.objectContaining({
        status: 'PROCESSING',
        progress: 0,
      })
    );
  });

  // ── generate mode ─────────────────────────────────────────

  it('uses PipelineEngine for mode=generate by default', async () => {
    mockGetReelJobInternal.mockResolvedValue(
      makeJob({ reelConfig: { mode: 'generate', layout: 'split-screen', style: 'cinematic' } })
    );

    await processReelPipelineJob('reel-1');

    expect(mockPipelineEngineRunAll).toHaveBeenCalled();
    expect(mockRenderVideo).toHaveBeenCalled();
    expect(mockAgentProduce).not.toHaveBeenCalled();
  });

  it('defaults to generate mode when reelConfig is null', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob({ reelConfig: null }));

    await processReelPipelineJob('reel-1');

    expect(mockPipelineEngineRunAll).toHaveBeenCalled();
  });

  // ── compose mode ──────────────────────────────────────────

  it('routes mode=compose through PipelineEngine', async () => {
    mockComposePipelineResult();
    mockGetReelJobInternal.mockResolvedValue(
      makeJob({
        reelConfig: {
          mode: 'compose',
          assets: [
            {
              id: 'v1',
              url: 'https://example.com/v.mp4',
              type: 'video',
              description: 'Video',
              isPrimary: true,
            },
          ],
        },
      })
    );

    await processReelPipelineJob('reel-1');

    // Compose now goes through PipelineEngine
    expect(mockPipelineEngineRunAll).toHaveBeenCalled();
    expect(mockAgentProduce).not.toHaveBeenCalled();
  });

  // ── captions mode (module, routed through PipelineEngine) ─────────

  it('routes mode=captions through PipelineEngine wrapping module', async () => {
    const captionsModule = {
      id: 'captions',
      name: 'Captions',
      compositionId: 'VideoClip',
      configFields: [],
      progressSteps: {},
      orchestrate: mockModuleOrchestrate,
    };
    mockGetModule.mockReturnValue(captionsModule);
    mockModulePipelineResult();
    mockGetReelJobInternal.mockResolvedValue(
      makeJob({
        script: 'Hello world',
        reelConfig: {
          mode: 'captions',
          videoUrl: 'https://example.com/video.mp4',
          script: 'Hello world',
        },
      })
    );

    await processReelPipelineJob('reel-1');

    expect(mockGetModule).toHaveBeenCalledWith('captions');
    // Captions now goes through PipelineEngine
    expect(mockPipelineEngineRunAll).toHaveBeenCalled();
    expect(mockAgentProduce).not.toHaveBeenCalled();
  });

  it('passes config to captions module via pipeline context', async () => {
    const cues = [{ id: '1', text: 'Hello', startTime: 0, endTime: 1.5 }];
    const captionsModule = {
      id: 'captions',
      name: 'Captions',
      compositionId: 'VideoClip',
      configFields: [],
      progressSteps: {},
      orchestrate: mockModuleOrchestrate,
    };
    mockGetModule.mockReturnValue(captionsModule);
    mockModulePipelineResult();
    mockGetReelJobInternal.mockResolvedValue(
      makeJob({
        reelConfig: {
          mode: 'captions',
          videoUrl: 'https://example.com/video.mp4',
          cues,
        },
      })
    );

    await processReelPipelineJob('reel-1');

    // Pipeline engine is called with initial input containing config
    expect(mockPipelineEngineRunAll).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'captions' }),
      expect.objectContaining({
        videoUrl: 'https://example.com/video.mp4',
        cues,
      }),
      'reel-1',
      expect.any(Function)
    );
  });

  // ── post-render ───────────────────────────────────────────

  it('uploads output to storage', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/out.mp4');
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'reels/reel-1/output.mp4');
  });

  it('gets signed URL with 24h expiry', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockGetSignedUrl).toHaveBeenCalledWith('reels/reel-1/output.mp4', 86400);
  });

  it('sets status to COMPLETED with output URL', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith(
      'reel-1',
      expect.objectContaining({
        status: 'COMPLETED',
        progress: 100,
        outputUrl: 'https://storage.example.com/signed-url',
      })
    );
  });

  it('cleans up local file after upload', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());

    await processReelPipelineJob('reel-1');

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/out.mp4');
  });

  it('sets status to FAILED on error', async () => {
    mockGetReelJobInternal.mockResolvedValue(makeJob());
    mockPipelineEngineRunAll.mockResolvedValue({
      jobId: 'reel-1',
      status: 'failed',
      failedStepId: 'tts',
      steps: [{ id: 'tts', name: 'TTS', status: 'failed', error: 'render crashed' }],
      context: { jobId: 'reel-1', results: {}, input: {} },
    });

    await expect(processReelPipelineJob('reel-1')).rejects.toThrow('Pipeline failed at step "tts"');

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith(
      'reel-1',
      expect.objectContaining({
        status: 'FAILED',
        error: expect.stringContaining('Pipeline failed'),
      })
    );
  });

  // ── pipeline engine integration ─────────────────────────────

  describe('pipeline engine integration', () => {
    it('throws when pipeline fails', async () => {
      mockGetReelJobInternal.mockResolvedValue(
        makeJob({ reelConfig: { mode: 'generate', layout: 'split-screen', style: 'cinematic' } })
      );
      mockPipelineEngineRunAll.mockResolvedValue({
        jobId: 'reel-1',
        status: 'failed',
        failedStepId: 'tts',
        steps: [{ id: 'tts', name: 'TTS', status: 'failed', error: 'TTS provider error' }],
        context: { jobId: 'reel-1', results: {}, input: {} },
      });

      await expect(processReelPipelineJob('reel-1')).rejects.toThrow(
        'Pipeline failed at step "tts"'
      );
    });

    it('renders after pipeline completes and uploads output', async () => {
      mockGetReelJobInternal.mockResolvedValue(
        makeJob({ reelConfig: { mode: 'generate', layout: 'split-screen', style: 'cinematic' } })
      );

      await processReelPipelineJob('reel-1');

      // Pipeline engine runs first
      expect(mockPipelineEngineRunAll).toHaveBeenCalled();
      // Then render is called with composition result
      expect(mockRenderVideo).toHaveBeenCalledWith(
        expect.objectContaining({ compositionId: 'ReelVideo' })
      );
      // Then output is uploaded
      expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'reels/reel-1/output.mp4');
    });

    it('routes all module modes through PipelineEngine', async () => {
      const captionsModule = {
        id: 'captions',
        name: 'Captions',
        compositionId: 'VideoClip',
        configFields: [],
        progressSteps: {},
        orchestrate: mockModuleOrchestrate,
      };
      mockGetModule.mockReturnValue(captionsModule);
      mockModulePipelineResult();
      mockGetReelJobInternal.mockResolvedValue(
        makeJob({
          reelConfig: {
            mode: 'captions',
            videoUrl: 'https://example.com/video.mp4',
          },
        })
      );

      await processReelPipelineJob('reel-1');

      // All modes (including modules) now go through PipelineEngine
      expect(mockPipelineEngineRunAll).toHaveBeenCalled();
      expect(mockAgentProduce).not.toHaveBeenCalled();
    });

    it('falls back to legacy produce() when PIPELINE_ENGINE=false for core modes', async () => {
      process.env.PIPELINE_ENGINE = 'false';
      mockGetReelJobInternal.mockResolvedValue(
        makeJob({ reelConfig: { mode: 'generate', layout: 'split-screen', style: 'cinematic' } })
      );

      await processReelPipelineJob('reel-1');

      // Legacy path: uses agentProduce instead of PipelineEngine
      expect(mockAgentProduce).toHaveBeenCalledWith(
        expect.objectContaining({
          script: 'Hello world',
          layout: 'split-screen',
          style: 'cinematic',
        })
      );
      expect(mockPipelineEngineRunAll).not.toHaveBeenCalled();

      delete process.env.PIPELINE_ENGINE;
    });

    it('still uses PipelineEngine for modules when PIPELINE_ENGINE=false', async () => {
      process.env.PIPELINE_ENGINE = 'false';
      const captionsModule = {
        id: 'captions',
        name: 'Captions',
        compositionId: 'VideoClip',
        configFields: [],
        progressSteps: {},
        orchestrate: mockModuleOrchestrate,
      };
      mockGetModule.mockReturnValue(captionsModule);
      mockModulePipelineResult();
      mockGetReelJobInternal.mockResolvedValue(
        makeJob({
          reelConfig: {
            mode: 'captions',
            videoUrl: 'https://example.com/video.mp4',
          },
        })
      );

      await processReelPipelineJob('reel-1');

      // PIPELINE_ENGINE=false only affects core modes, modules always use pipeline
      expect(mockPipelineEngineRunAll).toHaveBeenCalled();
      expect(mockAgentProduce).not.toHaveBeenCalled();

      delete process.env.PIPELINE_ENGINE;
    });
  });
});
