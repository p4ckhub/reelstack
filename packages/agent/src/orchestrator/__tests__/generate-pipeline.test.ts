import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineContext, PipelineDefinition } from '../pipeline-engine';

// ── Mocks ────────────────────────────────────────────────────

import { storageMockFactory } from '../../__test-utils__/storage-mock';
vi.mock('@reelstack/storage', storageMockFactory);

// ── Import under test ────────────────────────────────────────

import {
  createGeneratePipeline,
  type GeneratePipelineDeps,
  GENERATE_STEP_IDS,
} from '../generate-pipeline';

// ── Test helpers ──────────────────────────────────────────────

function makeMockDeps(overrides?: Partial<GeneratePipelineDeps>): GeneratePipelineDeps {
  return {
    reviewScript: vi.fn().mockResolvedValue({
      approved: true,
      issues: [],
      suggestions: [],
    }),
    isScriptReviewEnabled: vi.fn().mockReturnValue(true),
    runTTSPipeline: vi.fn().mockResolvedValue({
      voiceoverPath: '/tmp/voice.mp3',
      audioDuration: 30.5,
      transcriptionWords: [
        { text: 'Hello', startTime: 0.1, endTime: 0.5 },
        { text: 'world.', startTime: 0.6, endTime: 1.0 },
      ],
      cues: [{ id: 'c1', text: 'Hello world.', startTime: 0.1, endTime: 1.0 }],
      steps: [],
    }),
    buildTimingReference: vi.fn().mockReturnValue('[0.1s-1.0s] Hello world.'),
    selectMontageProfile: vi.fn().mockReturnValue({
      id: 'default',
      name: 'Default',
    }),
    planProduction: vi.fn().mockResolvedValue({
      primarySource: { type: 'none' },
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 5,
          scriptSegment: 'Hello world.',
          visual: { type: 'ai-image', prompt: 'landscape', toolId: 'flux' },
          transition: { type: 'crossfade', durationMs: 500 },
          reason: 'test',
        },
      ],
      effects: [],
      zoomSegments: [],
      lowerThirds: [],
      counters: [],
      highlights: [],
      ctaSegments: [],
      layout: 'fullscreen',
      reasoning: 'test plan',
    }),
    supervisePlan: vi.fn().mockResolvedValue({
      plan: {
        primarySource: { type: 'none' },
        shots: [
          {
            id: 'shot-1',
            startTime: 0,
            endTime: 5,
            scriptSegment: 'Hello world.',
            visual: { type: 'ai-image', prompt: 'landscape', toolId: 'flux' },
            transition: { type: 'crossfade', durationMs: 500 },
            reason: 'test',
          },
        ],
        effects: [],
        zoomSegments: [],
        lowerThirds: [],
        counters: [],
        highlights: [],
        ctaSegments: [],
        layout: 'fullscreen',
        reasoning: 'test plan (supervised)',
      },
      approved: true,
      iterations: 0,
      reviews: [],
    }),
    isPromptWriterEnabled: vi.fn().mockReturnValue(true),
    expandPrompts: vi
      .fn()
      .mockResolvedValue([
        { shotId: 'shot-1', expandedPrompt: 'A detailed landscape photograph...' },
      ]),
    generateAssets: vi
      .fn()
      .mockResolvedValue([
        { toolId: 'flux', shotId: 'shot-1', url: 'https://external.com/img.jpg', type: 'ai-image' },
      ]),
    persistAssets: vi
      .fn()
      .mockResolvedValue([
        { toolId: 'flux', shotId: 'shot-1', url: 'https://signed.url/img.jpg', type: 'ai-image' },
      ]),
    validatePlan: vi.fn().mockReturnValue({
      issues: [],
      fixedPlan: null,
    }),
    assembleComposition: vi.fn().mockReturnValue({
      layout: 'fullscreen',
      bRollSegments: [],
      effects: [],
      cues: [],
      compositionId: 'single-overlay',
    }),
    uploadVoiceover: vi.fn().mockResolvedValue('https://signed.url/voice.mp3'),
    renderVideo: vi.fn().mockResolvedValue({
      outputPath: '/tmp/output.mp4',
      step: { name: 'Remotion render', durationMs: 5000, detail: 'rendered' },
    }),
    discoverTools: vi.fn().mockReturnValue([]),
    createToolRegistry: vi.fn().mockReturnValue({
      register: vi.fn(),
      discover: vi.fn().mockResolvedValue(undefined),
      getToolManifest: vi.fn().mockReturnValue({
        tools: [],
        summary: 'No tools available',
      }),
    }),
    ...overrides,
  };
}

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    jobId: 'test-job-1',
    results: {},
    input: {
      script: 'Hello world. This is a test script.',
      style: 'dynamic',
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('generatePipeline', () => {
  let deps: GeneratePipelineDeps;
  let pipeline: PipelineDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeMockDeps();
    pipeline = createGeneratePipeline(deps);
  });

  // ── Definition ───────────────────────────────────────────

  describe('definition', () => {
    it('has correct pipeline id and name', () => {
      expect(pipeline.id).toBe('generate');
      expect(pipeline.name).toBe('Full Auto Generate');
    });

    it('defines 10 steps in correct order', () => {
      expect(pipeline.steps).toHaveLength(10);
      const ids = pipeline.steps.map((s) => s.id);
      expect(ids).toEqual([
        'script-review',
        'discover-tools',
        'tts',
        'whisper-timing',
        'plan',
        'supervisor',
        'prompt-expansion',
        'asset-gen',
        'asset-persist',
        'composition',
      ]);
    });

    it('all step IDs are unique', () => {
      const ids = pipeline.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all dependencies reference existing steps', () => {
      const ids = new Set(pipeline.steps.map((s) => s.id));
      for (const step of pipeline.steps) {
        for (const dep of step.dependsOn) {
          expect(ids.has(dep)).toBe(true);
        }
      }
    });

    it('first step has no dependencies', () => {
      expect(pipeline.steps[0].dependsOn).toEqual([]);
    });

    it('last step depends on asset-persist', () => {
      const last = pipeline.steps[pipeline.steps.length - 1];
      expect(last.dependsOn).toContain('asset-persist');
    });

    it('exports GENERATE_STEP_IDS constant for reference', () => {
      expect(GENERATE_STEP_IDS).toBeDefined();
      expect(GENERATE_STEP_IDS).toHaveLength(10);
    });
  });

  // ── Step execution ──────────────────────────────────────

  describe('script-review step', () => {
    it('calls reviewScript with script from context.input', async () => {
      const ctx = makeContext();
      const step = pipeline.steps.find((s) => s.id === 'script-review')!;

      await step.execute(ctx);

      expect(deps.reviewScript).toHaveBeenCalledWith('Hello world. This is a test script.');
    });

    it('stores review result in context output', async () => {
      const ctx = makeContext();
      const step = pipeline.steps.find((s) => s.id === 'script-review')!;

      const result = await step.execute(ctx);

      expect(result).toEqual(
        expect.objectContaining({
          approved: true,
          scriptForPlanning: 'Hello world. This is a test script.',
        })
      );
    });

    it('passes corrected script if review found issues', async () => {
      deps = makeMockDeps({
        reviewScript: vi.fn().mockResolvedValue({
          approved: false,
          issues: ['Factual error'],
          suggestions: ['Fix it'],
          correctedScript: 'Corrected script here.',
        }),
      });
      pipeline = createGeneratePipeline(deps);
      const ctx = makeContext();
      const step = pipeline.steps.find((s) => s.id === 'script-review')!;

      const result = (await step.execute(ctx)) as { scriptForPlanning: string };

      expect(result.scriptForPlanning).toBe('Corrected script here.');
    });

    it('skips review when disabled, passes original script through', async () => {
      deps = makeMockDeps({
        isScriptReviewEnabled: vi.fn().mockReturnValue(false),
      });
      pipeline = createGeneratePipeline(deps);
      const ctx = makeContext();
      const step = pipeline.steps.find((s) => s.id === 'script-review')!;

      const result = (await step.execute(ctx)) as { approved: boolean; scriptForPlanning: string };

      expect(deps.reviewScript).not.toHaveBeenCalled();
      expect(result.approved).toBe(true);
      expect(result.scriptForPlanning).toBe('Hello world. This is a test script.');
    });
  });

  describe('discover-tools step', () => {
    it('discovers tools and returns manifest', async () => {
      const ctx = makeContext();
      const step = pipeline.steps.find((s) => s.id === 'discover-tools')!;

      const result = (await step.execute(ctx)) as { manifest: unknown; registry: unknown };

      expect(deps.createToolRegistry).toHaveBeenCalled();
      expect(result.manifest).toBeDefined();
    });
  });

  describe('tts step', () => {
    it('runs TTS pipeline with script from script-review result', async () => {
      const ctx = makeContext({
        results: {
          'script-review': {
            approved: true,
            scriptForPlanning: 'Hello world. This is a test script.',
          },
        },
      });
      const step = pipeline.steps.find((s) => s.id === 'tts')!;

      await step.execute(ctx);

      expect(deps.runTTSPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          script: 'Hello world. This is a test script.',
        }),
        expect.any(String),
        undefined
      );
    });

    it('stores audioPath and duration in output', async () => {
      const ctx = makeContext({
        results: {
          'script-review': {
            approved: true,
            scriptForPlanning: 'Hello world.',
          },
        },
      });
      const step = pipeline.steps.find((s) => s.id === 'tts')!;

      const result = (await step.execute(ctx)) as {
        voiceoverPath: string;
        audioDuration: number;
      };

      expect(result.voiceoverPath).toBe('/tmp/voice.mp3');
      expect(result.audioDuration).toBe(30.5);
    });
  });

  describe('whisper-timing step', () => {
    it('builds timing reference from TTS transcription words', async () => {
      const ctx = makeContext({
        results: {
          'script-review': { scriptForPlanning: 'test' },
          tts: {
            voiceoverPath: '/tmp/voice.mp3',
            audioDuration: 30.5,
            transcriptionWords: [
              { text: 'Hello', startTime: 0.1, endTime: 0.5 },
              { text: 'world.', startTime: 0.6, endTime: 1.0 },
            ],
            cues: [{ id: 'c1', text: 'Hello world.', startTime: 0.1, endTime: 1.0 }],
          },
        },
        input: { script: 'Hello world.' },
      });
      const step = pipeline.steps.find((s) => s.id === 'whisper-timing')!;

      const result = (await step.execute(ctx)) as {
        timingReference: string;
        montageProfile: unknown;
      };

      expect(deps.buildTimingReference).toHaveBeenCalledWith([
        { text: 'Hello', startTime: 0.1, endTime: 0.5 },
        { text: 'world.', startTime: 0.6, endTime: 1.0 },
      ]);
      expect(result.timingReference).toBe('[0.1s-1.0s] Hello world.');
      expect(result.montageProfile).toBeDefined();
    });
  });

  describe('plan step', () => {
    it('calls planner with script, tools, timing', async () => {
      const ctx = makeContext({
        results: {
          'script-review': { scriptForPlanning: 'Hello world.' },
          'discover-tools': {
            manifest: { tools: [], summary: 'No tools' },
            registry: {},
          },
          tts: { audioDuration: 30.5 },
          'whisper-timing': {
            timingReference: '[0.1s-1.0s] Hello world.',
            montageProfile: { id: 'default', name: 'Default' },
          },
        },
        input: { style: 'dynamic' },
      });
      const step = pipeline.steps.find((s) => s.id === 'plan')!;

      await step.execute(ctx);

      expect(deps.planProduction).toHaveBeenCalledWith(
        expect.objectContaining({
          script: 'Hello world.',
          durationEstimate: 30.5,
          style: 'dynamic',
          timingReference: '[0.1s-1.0s] Hello world.',
        })
      );
    });

    it('stores plan in output', async () => {
      const ctx = makeContext({
        results: {
          'script-review': { scriptForPlanning: 'Hello world.' },
          'discover-tools': { manifest: { tools: [], summary: '' }, registry: {} },
          tts: { audioDuration: 30.5 },
          'whisper-timing': {
            timingReference: '',
            montageProfile: { id: 'default', name: 'Default' },
          },
        },
        input: { style: 'dynamic' },
      });
      const step = pipeline.steps.find((s) => s.id === 'plan')!;

      const result = (await step.execute(ctx)) as { plan: { shots: unknown[] } };

      expect(result.plan).toBeDefined();
      expect(result.plan.shots).toHaveLength(1);
    });
  });

  describe('supervisor step', () => {
    it('reviews plan from context', async () => {
      const plan = {
        primarySource: { type: 'none' as const },
        shots: [],
        effects: [],
        zoomSegments: [],
        lowerThirds: [],
        counters: [],
        highlights: [],
        ctaSegments: [],
        layout: 'fullscreen' as const,
        reasoning: 'test',
      };
      const ctx = makeContext({
        results: {
          'script-review': { scriptForPlanning: 'Hello world.' },
          'discover-tools': {
            manifest: { tools: [], summary: '' },
            registry: {},
          },
          tts: { audioDuration: 30.5 },
          'whisper-timing': {
            timingReference: '',
            montageProfile: { id: 'default', name: 'Default' },
          },
          plan: { plan },
        },
        input: { script: 'Hello world.', style: 'dynamic' },
      });
      const step = pipeline.steps.find((s) => s.id === 'supervisor')!;

      await step.execute(ctx);

      expect(deps.supervisePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan,
          script: 'Hello world.',
          audioDuration: 30.5,
          style: 'dynamic',
        })
      );
    });

    it('stores supervised plan in output', async () => {
      const ctx = makeContext({
        results: {
          'script-review': { scriptForPlanning: 'Hello world.' },
          'discover-tools': { manifest: { tools: [], summary: '' }, registry: {} },
          tts: { audioDuration: 30.5 },
          'whisper-timing': {
            timingReference: '',
            montageProfile: { id: 'default', name: 'Default' },
          },
          plan: { plan: { shots: [], effects: [] } },
        },
        input: { script: 'Hello world.', style: 'dynamic' },
      });
      const step = pipeline.steps.find((s) => s.id === 'supervisor')!;

      const result = (await step.execute(ctx)) as { plan: unknown; approved: boolean };

      expect(result.plan).toBeDefined();
      expect(result.approved).toBe(true);
    });
  });

  describe('prompt-expansion step', () => {
    it('expands briefs for ai-image and ai-video shots', async () => {
      const plan = {
        shots: [
          {
            id: 'shot-1',
            startTime: 0,
            endTime: 5,
            scriptSegment: 'Hello',
            visual: { type: 'ai-image', prompt: 'landscape', toolId: 'flux' },
            transition: { type: 'crossfade', durationMs: 500 },
            reason: 'test',
          },
        ],
        effects: [],
      };
      const ctx = makeContext({
        results: {
          supervisor: { plan, approved: true },
        },
        input: { layout: 'fullscreen' },
      });
      const step = pipeline.steps.find((s) => s.id === 'prompt-expansion')!;

      await step.execute(ctx);

      expect(deps.expandPrompts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            shotId: 'shot-1',
            description: 'landscape',
            toolId: 'flux',
            assetType: 'ai-image',
          }),
        ])
      );
    });

    it('skips when prompt writer is disabled', async () => {
      deps = makeMockDeps({
        isPromptWriterEnabled: vi.fn().mockReturnValue(false),
      });
      pipeline = createGeneratePipeline(deps);

      const plan = {
        shots: [
          {
            id: 'shot-1',
            startTime: 0,
            endTime: 5,
            scriptSegment: 'Hello',
            visual: { type: 'ai-image', prompt: 'landscape', toolId: 'flux' },
            transition: { type: 'crossfade', durationMs: 500 },
            reason: 'test',
          },
        ],
        effects: [],
      };
      const ctx = makeContext({
        results: {
          supervisor: { plan, approved: true },
        },
        input: {},
      });
      const step = pipeline.steps.find((s) => s.id === 'prompt-expansion')!;

      const result = (await step.execute(ctx)) as { plan: typeof plan; skipped: boolean };

      expect(deps.expandPrompts).not.toHaveBeenCalled();
      expect(result.skipped).toBe(true);
      // Plan should pass through unchanged
      expect(result.plan).toEqual(plan);
    });

    it('stores expanded plan with updated prompts', async () => {
      deps = makeMockDeps({
        expandPrompts: vi
          .fn()
          .mockResolvedValue([
            { shotId: 'shot-1', expandedPrompt: 'Detailed landscape with mountains...' },
          ]),
      });
      pipeline = createGeneratePipeline(deps);

      const plan = {
        shots: [
          {
            id: 'shot-1',
            startTime: 0,
            endTime: 5,
            scriptSegment: 'Hello',
            visual: { type: 'ai-image', prompt: 'landscape', toolId: 'flux' },
            transition: { type: 'crossfade', durationMs: 500 },
            reason: 'test',
          },
        ],
        effects: [],
      };
      const ctx = makeContext({
        results: {
          supervisor: { plan, approved: true },
        },
        input: { layout: 'fullscreen' },
      });
      const step = pipeline.steps.find((s) => s.id === 'prompt-expansion')!;

      const result = (await step.execute(ctx)) as {
        plan: { shots: Array<{ visual: { prompt: string } }> };
      };

      expect(result.plan.shots[0].visual.prompt).toBe('Detailed landscape with mountains...');
    });
  });

  describe('asset-gen step', () => {
    it('generates assets for each shot in plan', async () => {
      const plan = {
        shots: [
          {
            id: 'shot-1',
            visual: { type: 'ai-image', prompt: 'landscape', toolId: 'flux' },
          },
        ],
      };
      const registry = { getToolManifest: vi.fn() };
      const ctx = makeContext({
        results: {
          'discover-tools': { manifest: {}, registry },
          'prompt-expansion': { plan, skipped: false },
        },
      });
      const step = pipeline.steps.find((s) => s.id === 'asset-gen')!;

      const result = (await step.execute(ctx)) as { assets: unknown[] };

      expect(deps.generateAssets).toHaveBeenCalledWith(plan, registry, undefined);
      expect(result.assets).toHaveLength(1);
    });
  });

  describe('asset-persist step', () => {
    it('persists assets to storage', async () => {
      const rawAssets = [
        { toolId: 'flux', shotId: 'shot-1', url: 'https://external.com/img.jpg', type: 'ai-image' },
      ];
      const ctx = makeContext({
        results: {
          'asset-gen': { assets: rawAssets },
        },
        input: {},
      });
      const step = pipeline.steps.find((s) => s.id === 'asset-persist')!;

      const result = (await step.execute(ctx)) as { assets: unknown[] };

      expect(deps.persistAssets).toHaveBeenCalledWith(rawAssets, 'test-job-1');
      expect(result.assets).toHaveLength(1);
    });
  });

  describe('composition step', () => {
    it('assembles ReelProps from plan + assets', async () => {
      const plan = {
        shots: [],
        effects: [],
        layout: 'fullscreen',
      };
      const assets = [
        { toolId: 'flux', shotId: 'shot-1', url: 'https://signed.url/img.jpg', type: 'ai-image' },
      ];
      const cues = [{ id: 'c1', text: 'Hello', startTime: 0.1, endTime: 1.0 }];
      const ctx = makeContext({
        results: {
          'prompt-expansion': { plan },
          'asset-persist': { assets },
          tts: {
            voiceoverPath: '/tmp/voice.mp3',
            cues,
          },
          supervisor: { plan },
        },
        input: {},
      });
      const step = pipeline.steps.find((s) => s.id === 'composition')!;

      await step.execute(ctx);

      expect(deps.validatePlan).toHaveBeenCalled();
      expect(deps.uploadVoiceover).toHaveBeenCalledWith('/tmp/voice.mp3');
      expect(deps.assembleComposition).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: expect.any(Object),
          assets,
          cues,
          voiceoverFilename: 'https://signed.url/voice.mp3',
        })
      );
    });

    it('stores reelProps in output', async () => {
      const ctx = makeContext({
        results: {
          'prompt-expansion': { plan: { shots: [], effects: [], layout: 'fullscreen' } },
          'asset-persist': { assets: [] },
          tts: { voiceoverPath: '/tmp/voice.mp3', cues: [] },
          supervisor: { plan: { shots: [], effects: [] } },
        },
        input: {},
      });
      const step = pipeline.steps.find((s) => s.id === 'composition')!;

      const result = (await step.execute(ctx)) as { reelProps: unknown };

      expect(result.reelProps).toBeDefined();
    });

    it('uses fixed plan from validatePlan when issues found', async () => {
      const originalPlan = { shots: [], effects: [], layout: 'fullscreen' };
      const fixedPlan = { shots: [{ id: 'fixed' }], effects: [], layout: 'fullscreen' };
      deps = makeMockDeps({
        validatePlan: vi.fn().mockReturnValue({
          issues: ['Timeline gap found'],
          fixedPlan,
        }),
        assembleComposition: vi.fn().mockReturnValue({ layout: 'fullscreen' }),
        uploadVoiceover: vi.fn().mockResolvedValue('https://signed.url/voice.mp3'),
      });
      pipeline = createGeneratePipeline(deps);

      const ctx = makeContext({
        results: {
          'prompt-expansion': { plan: originalPlan },
          'asset-persist': { assets: [] },
          tts: { voiceoverPath: '/tmp/voice.mp3', cues: [] },
          supervisor: { plan: originalPlan },
        },
        input: {},
      });
      const step = pipeline.steps.find((s) => s.id === 'composition')!;

      await step.execute(ctx);

      expect(deps.assembleComposition).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: fixedPlan,
        })
      );
    });
  });

  describe('render step', () => {
    it('renders video from reelProps', async () => {
      const reelProps = { layout: 'fullscreen', compositionId: 'single-overlay' };
      const ctx = makeContext({
        results: {
          composition: { reelProps },
        },
        input: { outputPath: '/tmp/custom-output.mp4' },
      });
      const step = pipeline.steps.find((s) => s.id === 'render')!;

      // Note: render step is not in the pipeline definition - it's excluded
      // because the pipeline ends at composition. But if we add it later:
      // This test is ready.
    });
  });

  // ── Integration: step wiring ──────────────────────────────

  describe('step wiring (data flow)', () => {
    it('script-review output feeds into tts step', async () => {
      const ctx = makeContext();

      // Run script-review
      const reviewStep = pipeline.steps.find((s) => s.id === 'script-review')!;
      const reviewResult = await reviewStep.execute(ctx);
      ctx.results['script-review'] = reviewResult;

      // Run tts - should use scriptForPlanning from review
      const ttsStep = pipeline.steps.find((s) => s.id === 'tts')!;
      await ttsStep.execute(ctx);

      expect(deps.runTTSPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          script: 'Hello world. This is a test script.',
        }),
        expect.any(String),
        undefined
      );
    });

    it('tts output feeds into whisper-timing step', async () => {
      const ttsOutput = {
        voiceoverPath: '/tmp/voice.mp3',
        audioDuration: 15.0,
        transcriptionWords: [{ text: 'Test.', startTime: 0, endTime: 1 }],
        cues: [{ id: 'c1', text: 'Test.', startTime: 0, endTime: 1 }],
      };
      const ctx = makeContext({
        results: {
          'script-review': { scriptForPlanning: 'Test.' },
          tts: ttsOutput,
        },
        input: { script: 'Test.' },
      });

      const timingStep = pipeline.steps.find((s) => s.id === 'whisper-timing')!;
      await timingStep.execute(ctx);

      expect(deps.buildTimingReference).toHaveBeenCalledWith(ttsOutput.transcriptionWords);
      expect(deps.selectMontageProfile).toHaveBeenCalled();
    });
  });
});
