import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { ProductionPlan, GeneratedAsset, ToolManifest } from '../../types';

// ── Shared fixtures ─────────────────────────────────────────────

const MOCK_PLAN: ProductionPlan = {
  primarySource: { type: 'none' },
  shots: [
    {
      id: 'shot-1',
      startTime: 0,
      endTime: 5,
      scriptSegment: 'Hello world.',
      visual: { type: 'b-roll', searchQuery: 'city', toolId: 'pexels' },
      transition: { type: 'crossfade', durationMs: 300 },
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
};

const MOCK_ASSETS: GeneratedAsset[] = [
  {
    toolId: 'pexels',
    shotId: 'shot-1',
    url: 'https://storage.example.com/asset.mp4',
    type: 'stock-video',
    durationSeconds: 5,
  },
];

const MOCK_MANIFEST: ToolManifest = {
  tools: [{ id: 'pexels', name: 'Pexels', available: true, capabilities: [] }],
  summary: '1 tool available',
};

const MOCK_TTS_RESULT = {
  voiceoverPath: '/tmp/voiceover.mp3',
  audioDuration: 10,
  transcriptionWords: [
    { text: 'Hello', startTime: 0, endTime: 0.5 },
    { text: 'world.', startTime: 0.5, endTime: 1.0 },
  ],
  cues: [
    {
      id: 'cue-1',
      text: 'Hello world.',
      startTime: 0,
      endTime: 1.0,
      words: [
        { text: 'Hello', startTime: 0, endTime: 0.5 },
        { text: 'world.', startTime: 0.5, endTime: 1.0 },
      ],
    },
  ],
  steps: [{ name: 'TTS', durationMs: 100, detail: 'edge-tts' }],
};

const MOCK_ASSEMBLED_PROPS = {
  layout: 'fullscreen',
  bRollSegments: [],
  effects: [],
  pipSegments: [],
  lowerThirds: [],
  counters: [],
  highlights: [],
  ctaSegments: [],
  captions: [],
};

const MOCK_MONTAGE_PROFILE = {
  id: 'default',
  name: 'Default',
  description: 'Default profile',
  topicKeywords: [],
  shotDuration: { min: 2, max: 5 },
  pacing: 'medium' as const,
  transitionTypes: ['crossfade'],
  effectDensity: 0.5,
  shotVariety: 'medium' as const,
  allowedVisualTypes: ['b-roll' as const],
  supervisorChecks: [],
};

// ── Mock fn references (used in beforeEach to reset implementations) ──

const mockPlanProduction = vi.fn(async (..._args: any[]) => structuredClone(MOCK_PLAN));
const mockPlanComposition = vi.fn(async (..._args: any[]) => structuredClone(MOCK_PLAN));
const mockGenerateAssets = vi.fn(async (..._args: any[]) => [...MOCK_ASSETS]);
const mockAssembleComposition = vi.fn((..._args: any[]) => ({ ...MOCK_ASSEMBLED_PROPS }));
const mockValidatePlan = vi.fn((..._args: any[]) => ({
  valid: true,
  issues: [] as any[],
  fixedPlan: structuredClone(MOCK_PLAN),
}));
const mockSupervisePlan = vi.fn(async (..._args: any[]) => ({
  plan: structuredClone(MOCK_PLAN),
  approved: true,
  iterations: 1,
  reviews: [{ iteration: 1, verdict: 'approved', score: 9, notes: 'Looks good' }],
}));
const mockRunTTSPipeline = vi.fn(async (..._args: any[]) => ({ ...MOCK_TTS_RESULT }));
const mockBuildTimingReference = vi.fn((..._args: any[]) => '[0.0s-1.0s] Hello world.');
const mockResolvePresetConfig = vi.fn((..._args: any[]) => ({
  animationStyle: 'word-highlight',
  maxWordsPerCue: 4,
  maxDurationPerCue: 2,
}));
const mockUploadVoiceover = vi.fn(
  async (..._args: any[]) => 'https://storage.example.com/voiceover.mp3'
);
const mockRenderVideo = vi.fn(async (..._args: any[]) => ({
  outputPath: '/tmp/output.mp4',
  step: { name: 'Render', durationMs: 500, detail: '1024 bytes' },
}));
const mockPersistAssetsToStorage = vi.fn(async (...args: any[]) => [
  ...(args[0] as GeneratedAsset[]),
]);

// ── Imports for spying ──────────────────────────────────────────

import fs from 'fs';
import * as remotionPipeline from '@reelstack/remotion/pipeline';
import * as transcription from '@reelstack/transcription';
import * as loggerModule from '@reelstack/logger';
import { ToolRegistry } from '../../registry/tool-registry';
import * as discovery from '../../registry/discovery';
import * as productionPlanner from '../../planner/production-planner';
import * as assetGenerator from '../asset-generator';
import * as compositionAssembler from '../composition-assembler';
import * as planValidator from '../../planner/plan-validator';
import * as planSupervisor from '../../planner/plan-supervisor';
import * as baseOrchestrator from '../base-orchestrator';
import * as montageProfile from '../../planner/montage-profile';
import * as scriptReviewer from '../../planner/script-reviewer';
import * as promptWriter from '../../planner/prompt-writer';
import * as assetPersistence from '../asset-persistence';
import * as pipelineLoggerModule from '../pipeline-logger';
import * as contextModule from '../../context';

// ── spyOn all module exports (restorable) ───────────────────────

// fs
const spyRmSync = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

// @reelstack/remotion/pipeline
const spyNormalizeAudio = vi
  .spyOn(remotionPipeline, 'normalizeAudioForWhisper')
  .mockReturnValue(Buffer.from('wav'));
const spyGetAudioDuration = vi.spyOn(remotionPipeline, 'getAudioDuration').mockReturnValue(10);
const spyTranscribeAudio = vi.spyOn(remotionPipeline, 'transcribeAudio').mockResolvedValue({
  words: [
    { text: 'Hello', startTime: 0, endTime: 0.5 },
    { text: 'world.', startTime: 0.5, endTime: 1.0 },
  ],
} as any);

// @reelstack/transcription
const spyGroupWordsIntoCues = vi.spyOn(transcription, 'groupWordsIntoCues').mockReturnValue([
  {
    id: 'cue-1',
    text: 'Hello world.',
    startTime: 0,
    endTime: 1.0,
    words: [
      { text: 'Hello', startTime: 0, endTime: 0.5 },
      { text: 'world.', startTime: 0.5, endTime: 1.0 },
    ],
  },
] as any);
const spyAlignWords = vi
  .spyOn(transcription, 'alignWordsWithScript')
  .mockImplementation(((words: unknown[]) => words) as any);

// @reelstack/logger
const spyCreateLogger = vi.spyOn(loggerModule, 'createLogger').mockReturnValue({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
} as any);
const spyCreateRequestLogger = vi.spyOn(loggerModule, 'createRequestLogger').mockReturnValue({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any);

// ToolRegistry — spy on prototype methods
const spyRegistryRegister = vi
  .spyOn(ToolRegistry.prototype, 'register')
  .mockImplementation(vi.fn());
const spyRegistryDiscover = vi
  .spyOn(ToolRegistry.prototype, 'discover')
  .mockResolvedValue(undefined);
const spyRegistryGetToolManifest = vi
  .spyOn(ToolRegistry.prototype, 'getToolManifest')
  .mockReturnValue(MOCK_MANIFEST);

// discovery
const spyDiscoverTools = vi.spyOn(discovery, 'discoverTools').mockReturnValue([] as any);

// planner/production-planner
const spyPlanProduction = vi
  .spyOn(productionPlanner, 'planProduction')
  .mockImplementation((...args: any[]) => mockPlanProduction(...args));
const spyPlanComposition = vi
  .spyOn(productionPlanner, 'planComposition')
  .mockImplementation((...args: any[]) => mockPlanComposition(...args));
const spyIsPublicUrl = vi.spyOn(productionPlanner, 'isPublicUrl').mockReturnValue(true);

// orchestrator/asset-generator
const spyGenerateAssets = vi
  .spyOn(assetGenerator, 'generateAssets')
  .mockImplementation((...args: any[]) => mockGenerateAssets(...args));

// orchestrator/composition-assembler
const spyAssembleComposition = vi
  .spyOn(compositionAssembler, 'assembleComposition')
  .mockImplementation(((...args: any[]) => mockAssembleComposition(...args)) as any);

// planner/plan-validator
const spyValidatePlan = vi
  .spyOn(planValidator, 'validatePlan')
  .mockImplementation(((...args: any[]) => mockValidatePlan(...args)) as any);

// planner/plan-supervisor
const spySupervisePlan = vi
  .spyOn(planSupervisor, 'supervisePlan')
  .mockImplementation(((...args: any[]) => mockSupervisePlan(...args)) as any);

// orchestrator/base-orchestrator
const spyBuildTimingReference = vi
  .spyOn(baseOrchestrator, 'buildTimingReference')
  .mockImplementation(((...args: any[]) => mockBuildTimingReference(...args)) as any);
const spyResolvePresetConfig = vi
  .spyOn(baseOrchestrator, 'resolvePresetConfig')
  .mockImplementation(((...args: any[]) => mockResolvePresetConfig(...args)) as any);
const spyRunTTSPipeline = vi
  .spyOn(baseOrchestrator, 'runTTSPipeline')
  .mockImplementation((...args: any[]) => mockRunTTSPipeline(...args));
const spyUploadVoiceover = vi
  .spyOn(baseOrchestrator, 'uploadVoiceover')
  .mockImplementation((...args: any[]) => mockUploadVoiceover(...args));
const spyRenderVideo = vi
  .spyOn(baseOrchestrator, 'renderVideo')
  .mockImplementation((...args: any[]) => mockRenderVideo(...args));

// planner/montage-profile
const spySelectMontageProfile = vi
  .spyOn(montageProfile, 'selectMontageProfile')
  .mockReturnValue(MOCK_MONTAGE_PROFILE as any);

// planner/script-reviewer
const spyReviewScript = vi
  .spyOn(scriptReviewer, 'reviewScript')
  .mockResolvedValue({ approved: true, issues: [], suggestions: [] } as any);
const spyIsScriptReviewEnabled = vi
  .spyOn(scriptReviewer, 'isScriptReviewEnabled')
  .mockReturnValue(false);

// planner/prompt-writer
const spyWritePrompt = vi.spyOn(promptWriter, 'writePrompt').mockResolvedValue('expanded prompt');
const spyIsPromptWriterEnabled = vi
  .spyOn(promptWriter, 'isPromptWriterEnabled')
  .mockReturnValue(false);

// orchestrator/asset-persistence
const spyPersistAssetsToStorage = vi
  .spyOn(assetPersistence, 'persistAssetsToStorage')
  .mockImplementation((...args: any[]) => mockPersistAssetsToStorage(...args));

// orchestrator/pipeline-logger — spy on PipelineLogger prototype
const spyPLLogStep = vi
  .spyOn(pipelineLoggerModule.PipelineLogger.prototype, 'logStep')
  .mockImplementation(vi.fn());
const spyPLSaveArtifact = vi
  .spyOn(pipelineLoggerModule.PipelineLogger.prototype, 'saveArtifact')
  .mockImplementation(vi.fn());
const spyPLPersist = vi
  .spyOn(pipelineLoggerModule.PipelineLogger.prototype, 'persist')
  .mockResolvedValue(undefined);
const spyPLGetSummary = vi
  .spyOn(pipelineLoggerModule.PipelineLogger.prototype, 'getSummary')
  .mockReturnValue({
    stepCount: 3,
    totalDurationMs: 1000,
    toolsUsed: ['pexels'],
    steps: [],
  });

// context
const spyRunWithJobId = vi
  .spyOn(contextModule, 'runWithJobId')
  .mockImplementation((_id: string, fn: () => unknown) => fn() as any);
const spySetApiCallLogger = vi.spyOn(contextModule, 'setApiCallLogger').mockImplementation(vi.fn());

// ── Restore ALL spies after this file ───────────────────────────

afterAll(() => {
  spyRmSync.mockRestore();
  spyNormalizeAudio.mockRestore();
  spyGetAudioDuration.mockRestore();
  spyTranscribeAudio.mockRestore();
  spyGroupWordsIntoCues.mockRestore();
  spyAlignWords.mockRestore();
  spyCreateLogger.mockRestore();
  spyCreateRequestLogger.mockRestore();
  spyRegistryRegister.mockRestore();
  spyRegistryDiscover.mockRestore();
  spyRegistryGetToolManifest.mockRestore();
  spyDiscoverTools.mockRestore();
  spyPlanProduction.mockRestore();
  spyPlanComposition.mockRestore();
  spyIsPublicUrl.mockRestore();
  spyGenerateAssets.mockRestore();
  spyAssembleComposition.mockRestore();
  spyValidatePlan.mockRestore();
  spySupervisePlan.mockRestore();
  spyBuildTimingReference.mockRestore();
  spyResolvePresetConfig.mockRestore();
  spyRunTTSPipeline.mockRestore();
  spyUploadVoiceover.mockRestore();
  spyRenderVideo.mockRestore();
  spySelectMontageProfile.mockRestore();
  spyReviewScript.mockRestore();
  spyIsScriptReviewEnabled.mockRestore();
  spyWritePrompt.mockRestore();
  spyIsPromptWriterEnabled.mockRestore();
  spyPersistAssetsToStorage.mockRestore();
  spyPLLogStep.mockRestore();
  spyPLSaveArtifact.mockRestore();
  spyPLPersist.mockRestore();
  spyPLGetSummary.mockRestore();
  spyRunWithJobId.mockRestore();
  spySetApiCallLogger.mockRestore();
});

// ── Import under test (AFTER all spies) ─────────────────────────

import { produce, produceComposition } from '../production-orchestrator';

// ── Tests ───────────────────────────────────────────────────────

describe('produce()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanProduction.mockResolvedValue(structuredClone(MOCK_PLAN));
    mockGenerateAssets.mockResolvedValue([...MOCK_ASSETS]);
    mockRunTTSPipeline.mockResolvedValue({ ...MOCK_TTS_RESULT });
    mockRenderVideo.mockResolvedValue({
      outputPath: '/tmp/output.mp4',
      step: { name: 'Render', durationMs: 500, detail: '1024 bytes' },
    });
    mockSupervisePlan.mockResolvedValue({
      plan: structuredClone(MOCK_PLAN),
      approved: true,
      iterations: 1,
      reviews: [{ iteration: 1, verdict: 'approved', score: 9, notes: 'ok' }],
    });
    mockValidatePlan.mockReturnValue({
      valid: true,
      issues: [],
      fixedPlan: structuredClone(MOCK_PLAN),
    });
    mockAssembleComposition.mockReturnValue({ ...MOCK_ASSEMBLED_PROPS });
    mockPersistAssetsToStorage.mockResolvedValue([...MOCK_ASSETS]);
  });

  // ── Input validation ────────────────────────────────────────

  it('rejects empty script', async () => {
    await expect(produce({ script: '' })).rejects.toThrow(
      'Script must be between 1 and 50000 characters'
    );
  });

  it('rejects script exceeding max length', async () => {
    const longScript = 'x'.repeat(50_001);
    await expect(produce({ script: longScript })).rejects.toThrow(
      'Script must be between 1 and 50000 characters'
    );
  });

  // ── Happy path ──────────────────────────────────────────────

  it('returns outputPath and durationSeconds on success', async () => {
    const result = await produce({ script: 'Hello world.' });

    expect(result.outputPath).toBe('/tmp/output.mp4');
    expect(result.durationSeconds).toBe(10);
    expect(result.plan).toBeDefined();
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.generatedAssets).toHaveLength(1);
  });

  it('calls TTS pipeline with script and tmpDir', async () => {
    await produce({ script: 'Test script' });

    expect(mockRunTTSPipeline).toHaveBeenCalledTimes(1);
    const [ttsInput, tmpDir] = mockRunTTSPipeline.mock.calls[0] as any[];
    expect(ttsInput).toEqual(expect.objectContaining({ script: 'Test script' }));
    expect(tmpDir).toEqual(expect.any(String));
  });

  it('passes tool manifest to planner', async () => {
    await produce({ script: 'Test script' });

    expect(mockPlanProduction).toHaveBeenCalledTimes(1);
    expect(mockPlanProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        script: 'Test script',
        toolManifest: MOCK_MANIFEST,
      })
    );
  });

  it('passes timing reference from TTS words to planner', async () => {
    await produce({ script: 'Test script' });

    expect(mockBuildTimingReference).toHaveBeenCalledWith(MOCK_TTS_RESULT.transcriptionWords);
    expect(mockPlanProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        timingReference: '[0.0s-1.0s] Hello world.',
      })
    );
  });

  it('calls asset generator with plan and registry', async () => {
    await produce({ script: 'Test script' });

    expect(mockGenerateAssets).toHaveBeenCalledTimes(1);
    const [plan, registry] = mockGenerateAssets.mock.calls[0] as any[];
    expect(plan).toEqual(expect.objectContaining({ layout: 'fullscreen' }));
    expect(registry).toBeDefined();
  });

  it('persists assets to storage after generation', async () => {
    await produce({ script: 'Test script' });

    expect(mockPersistAssetsToStorage).toHaveBeenCalledTimes(1);
    expect(mockPersistAssetsToStorage).toHaveBeenCalledWith(
      MOCK_ASSETS,
      undefined, // jobId
      expect.anything() // logger
    );
  });

  it('calls assembler with plan, assets, cues, and voiceover URL', async () => {
    await produce({ script: 'Test script' });

    expect(mockAssembleComposition).toHaveBeenCalledTimes(1);
    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        cues: MOCK_TTS_RESULT.cues,
        voiceoverFilename: 'https://storage.example.com/voiceover.mp3',
      })
    );
  });

  it('calls renderVideo with assembled props', async () => {
    await produce({ script: 'Test script' });

    expect(mockRenderVideo).toHaveBeenCalledTimes(1);
    const [props, outputPath] = mockRenderVideo.mock.calls[0] as any[];
    expect(props).toEqual(expect.objectContaining({ layout: 'fullscreen' }));
    expect(outputPath).toBeUndefined();
  });

  // ── Pipeline step ordering ──────────────────────────────────

  it('calls pipeline steps in correct order: TTS -> plan -> supervisor -> assets -> persist -> validate -> assemble -> render', async () => {
    const callOrder: string[] = [];

    mockRunTTSPipeline.mockImplementation(async () => {
      callOrder.push('tts');
      return { ...MOCK_TTS_RESULT };
    });
    mockPlanProduction.mockImplementation(async () => {
      callOrder.push('plan');
      return structuredClone(MOCK_PLAN);
    });
    mockSupervisePlan.mockImplementation(async () => {
      callOrder.push('supervisor');
      return {
        plan: structuredClone(MOCK_PLAN),
        approved: true,
        iterations: 1,
        reviews: [],
      };
    });
    mockGenerateAssets.mockImplementation(async () => {
      callOrder.push('assets');
      return [...MOCK_ASSETS];
    });
    mockPersistAssetsToStorage.mockImplementation(async () => {
      callOrder.push('persist');
      return [...MOCK_ASSETS];
    });
    mockValidatePlan.mockImplementation(() => {
      callOrder.push('validate');
      return { valid: true, issues: [], fixedPlan: structuredClone(MOCK_PLAN) };
    });
    mockAssembleComposition.mockImplementation(() => {
      callOrder.push('assemble');
      return { ...MOCK_ASSEMBLED_PROPS };
    });
    mockRenderVideo.mockImplementation(async () => {
      callOrder.push('render');
      return {
        outputPath: '/tmp/output.mp4',
        step: { name: 'Render', durationMs: 500, detail: '1024' },
      };
    });

    await produce({ script: 'Test ordering' });

    expect(callOrder.indexOf('tts')).toBeLessThan(callOrder.indexOf('plan'));
    expect(callOrder.indexOf('plan')).toBeLessThan(callOrder.indexOf('supervisor'));
    expect(callOrder.indexOf('supervisor')).toBeLessThan(callOrder.indexOf('assets'));
    expect(callOrder.indexOf('assets')).toBeLessThan(callOrder.indexOf('persist'));
    expect(callOrder.indexOf('persist')).toBeLessThan(callOrder.indexOf('validate'));
    expect(callOrder.indexOf('validate')).toBeLessThan(callOrder.indexOf('assemble'));
    expect(callOrder.indexOf('assemble')).toBeLessThan(callOrder.indexOf('render'));
  });

  // ── Error handling ──────────────────────────────────────────

  it('propagates TTS pipeline errors', async () => {
    mockRunTTSPipeline.mockRejectedValue(new Error('TTS provider unreachable'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('TTS provider unreachable');
  });

  it('propagates planner errors', async () => {
    mockPlanProduction.mockRejectedValue(new Error('LLM timeout'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('LLM timeout');
  });

  it('propagates asset generation errors', async () => {
    mockGenerateAssets.mockRejectedValue(new Error('Pexels API down'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('Pexels API down');
  });

  it('propagates render errors', async () => {
    mockRenderVideo.mockRejectedValue(new Error('Render failed'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('Render failed');
  });

  it('propagates supervisor errors', async () => {
    mockSupervisePlan.mockRejectedValue(new Error('Supervisor LLM failed'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('Supervisor LLM failed');
  });

  // ── Progress callbacks ──────────────────────────────────────

  it('calls onProgress with pipeline stage messages', async () => {
    const progress: string[] = [];
    await produce({
      script: 'Test',
      onProgress: (msg) => progress.push(msg),
    });

    expect(progress).toContain('Discovering tools and generating voiceover...');
    expect(progress).toContain('Planning production (with exact speech timing)...');
    expect(progress).toContain('Generating visual assets...');
    expect(progress).toContain('Assembling composition...');
    expect(progress.some((p) => p.startsWith('Done!'))).toBe(true);
  });

  // ── Plan validation auto-fix ────────────────────────────────

  it('uses fixedPlan from validator when issues are found', async () => {
    const fixedPlan = {
      ...MOCK_PLAN,
      reasoning: 'fixed plan',
    };
    mockValidatePlan.mockReturnValue({
      valid: false,
      issues: [
        { severity: 'warning', type: 'overlap', message: 'Effects overlap', autoFixed: true },
      ] as any[],
      fixedPlan,
    });

    const result = await produce({ script: 'Test' });

    // The assembler should receive the fixed plan
    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ reasoning: 'fixed plan' }),
      })
    );
  });

  // ── Optional params ─────────────────────────────────────────

  it('passes style to planner (defaults to dynamic)', async () => {
    await produce({ script: 'Test' });
    expect(mockPlanProduction).toHaveBeenCalledWith(expect.objectContaining({ style: 'dynamic' }));
  });

  it('passes custom style to planner', async () => {
    await produce({ script: 'Test', style: 'cinematic' });
    expect(mockPlanProduction).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'cinematic' })
    );
  });

  it('passes layout to planner', async () => {
    await produce({ script: 'Test', layout: 'split-screen' });
    const plannerInput = (mockPlanProduction.mock.calls[0] as any[])[0] as Record<string, unknown>;
    expect(plannerInput.layout).toBe('split-screen');
  });

  it('passes outputPath to renderVideo', async () => {
    await produce({ script: 'Test', outputPath: '/custom/out.mp4' });
    const [, outputPath] = mockRenderVideo.mock.calls[0] as any[];
    expect(outputPath).toBe('/custom/out.mp4');
  });

  // ── Job context ─────────────────────────────────────────────

  it('wraps pipeline in runWithJobId when jobId is provided', async () => {
    await produce({ script: 'Test', jobId: 'job-123' });

    expect(spyRunWithJobId).toHaveBeenCalledWith('job-123', expect.any(Function));
  });

  it('includes pipelineLogSummary when jobId is provided', async () => {
    const result = await produce({ script: 'Test', jobId: 'job-456' });

    expect(result.pipelineLogSummary).toBeDefined();
    expect(result.pipelineLogSummary!.stepCount).toBe(3);
  });
});

// ── produceComposition() ────────────────────────────────────────

describe('produceComposition()', () => {
  const baseComposeRequest = {
    script: 'Hello world.',
    assets: [
      {
        id: 'asset-1',
        url: 'https://example.com/video.mp4',
        type: 'video' as const,
        description: 'Talking head',
        durationSeconds: 10,
        isPrimary: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanComposition.mockResolvedValue(structuredClone(MOCK_PLAN));
    mockRunTTSPipeline.mockResolvedValue({ ...MOCK_TTS_RESULT });
    mockRenderVideo.mockResolvedValue({
      outputPath: '/tmp/output.mp4',
      step: { name: 'Render', durationMs: 500, detail: '1024 bytes' },
    });
    mockValidatePlan.mockReturnValue({
      valid: true,
      issues: [],
      fixedPlan: structuredClone(MOCK_PLAN),
    });
    mockAssembleComposition.mockReturnValue({ ...MOCK_ASSEMBLED_PROPS });
    mockPersistAssetsToStorage.mockResolvedValue([...MOCK_ASSETS]);
    mockUploadVoiceover.mockResolvedValue('https://storage.example.com/voiceover.mp3');
  });

  // ── Input validation ────────────────────────────────────────

  it('rejects empty script', async () => {
    await expect(produceComposition({ ...baseComposeRequest, script: '' })).rejects.toThrow(
      'Script must be between 1 and 50000 characters'
    );
  });

  it('rejects missing assets', async () => {
    await expect(produceComposition({ script: 'Test', assets: [] })).rejects.toThrow(
      'At least one asset is required'
    );
  });

  it('rejects more than 50 assets', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      id: `asset-${i}`,
      url: `https://example.com/${i}.mp4`,
      type: 'video' as const,
      description: `Asset ${i}`,
    }));
    await expect(produceComposition({ script: 'Test', assets: tooMany })).rejects.toThrow(
      'Maximum 50 assets allowed'
    );
  });

  // ── Happy path ──────────────────────────────────────────────

  it('returns outputPath and durationSeconds on success', async () => {
    const result = await produceComposition(baseComposeRequest);

    expect(result.outputPath).toBe('/tmp/output.mp4');
    expect(result.durationSeconds).toBe(10);
  });

  it('calls planComposition instead of planProduction', async () => {
    await produceComposition(baseComposeRequest);

    expect(mockPlanComposition).toHaveBeenCalledTimes(1);
    expect(mockPlanProduction).not.toHaveBeenCalled();
  });

  it('does NOT call generateAssets (user provides assets)', async () => {
    await produceComposition(baseComposeRequest);

    expect(mockGenerateAssets).not.toHaveBeenCalled();
  });

  it('calls planComposition with assets and directorNotes', async () => {
    await produceComposition({
      ...baseComposeRequest,
      directorNotes: 'Show screenshot when talking about analytics',
    });

    expect(mockPlanComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        assets: baseComposeRequest.assets,
        directorNotes: 'Show screenshot when talking about analytics',
      })
    );
  });

  // ── Existing voiceover + cues (skip TTS) ────────────────────

  it('skips TTS when existingVoiceoverPath and existingCues provided', async () => {
    const existingCues = [
      {
        id: 'cue-1',
        text: 'Hello',
        startTime: 0,
        endTime: 1.0,
        words: [{ text: 'Hello', startTime: 0, endTime: 1.0 }],
      },
    ];

    await produceComposition({
      ...baseComposeRequest,
      existingVoiceoverPath: '/tmp/existing.mp3',
      existingCues,
    });

    expect(mockRunTTSPipeline).not.toHaveBeenCalled();
  });

  it('computes audioDuration from max cue end time and max asset duration', async () => {
    const cues = [
      {
        id: 'c1',
        text: 'Hello',
        startTime: 0,
        endTime: 8.0,
        words: [{ text: 'Hello', startTime: 0, endTime: 8.0 }],
      },
    ];

    const result = await produceComposition({
      ...baseComposeRequest,
      existingVoiceoverPath: '/tmp/existing.mp3',
      existingCues: cues,
    });

    // max(cue end=8.0, asset duration=10) = 10
    expect(result.durationSeconds).toBe(10);
  });

  // ── Layout override ─────────────────────────────────────────

  it('overrides LLM layout with request layout when they differ', async () => {
    const planWithSplit = { ...MOCK_PLAN, layout: 'split-screen' as const };
    mockPlanComposition.mockResolvedValue(structuredClone(planWithSplit));

    await produceComposition({
      ...baseComposeRequest,
      layout: 'anchor-bottom',
    });

    // Assembler should receive the request's layout, not the LLM's
    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ layout: 'anchor-bottom' }),
      })
    );
  });

  // ── Error handling ──────────────────────────────────────────

  it('propagates render errors', async () => {
    mockRenderVideo.mockRejectedValue(new Error('Lambda timeout'));

    await expect(produceComposition(baseComposeRequest)).rejects.toThrow('Lambda timeout');
  });

  it('propagates planComposition errors', async () => {
    mockPlanComposition.mockRejectedValue(new Error('LLM API error'));

    await expect(produceComposition(baseComposeRequest)).rejects.toThrow('LLM API error');
  });

  // ── Progress callbacks ──────────────────────────────────────

  it('calls onProgress with composition stage messages', async () => {
    const progress: string[] = [];
    await produceComposition({
      ...baseComposeRequest,
      onProgress: (msg) => progress.push(msg),
    });

    expect(progress).toContain('LLM composing timeline (with exact speech timing)...');
    expect(progress).toContain('Assembling composition...');
    expect(progress.some((p) => p.startsWith('Done!'))).toBe(true);
  });

  // ── Primary video framing ──────────────────────────────────

  it('passes primaryVideoObjectPosition from asset metadata to assembler', async () => {
    const request = {
      ...baseComposeRequest,
      assets: [
        {
          id: 'cam',
          url: 'https://example.com/cam.mp4',
          type: 'video' as const,
          description: 'Talking head',
          durationSeconds: 10,
          isPrimary: true,
          metadata: { avatarFraming: 'bottom-aligned' },
        },
      ],
    };

    await produceComposition(request);

    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryVideoObjectPosition: 'center 85%',
      })
    );
  });

  it('defaults avatarFraming to center when not specified', async () => {
    await produceComposition(baseComposeRequest);

    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryVideoObjectPosition: 'center',
      })
    );
  });

  // ── Job context ─────────────────────────────────────────────

  it('wraps pipeline in runWithJobId when jobId is provided', async () => {
    await produceComposition({ ...baseComposeRequest, jobId: 'compose-job' });

    expect(spyRunWithJobId).toHaveBeenCalledWith('compose-job', expect.any(Function));
  });
});
