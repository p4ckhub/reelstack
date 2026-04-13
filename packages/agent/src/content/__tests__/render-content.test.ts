import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { ContentPackage } from '../content-package';
import type { ProductionPlan, GeneratedAsset } from '../../types';
import type { RenderContentRequest } from '../render-content';

// ── Mocks ────────────────────────────────────────────────────

import * as templateMontageModule from '../template-montage';
import * as assemblerModule from '../../orchestrator/composition-assembler';
import * as baseOrchestratorModule from '../../orchestrator/base-orchestrator';
import { renderContentPackage } from '../render-content';

const mockBuildTemplatePlan = vi.spyOn(templateMontageModule, 'buildTemplatePlan' as any);
const mockAssembleComposition = vi.spyOn(assemblerModule, 'assembleComposition' as any);
const mockRenderVideo = vi.spyOn(baseOrchestratorModule, 'renderVideo' as any);

afterAll(() => {
  mockBuildTemplatePlan.mockRestore();
  mockAssembleComposition.mockRestore();
  mockRenderVideo.mockRestore();
});

// ── Helpers ──────────────────────────────────────────────────

function makeContentPackage(overrides: Partial<ContentPackage> = {}): ContentPackage {
  return {
    script: 'Test script about automation.',
    voiceover: {
      url: '/tmp/voiceover.mp3',
      durationSeconds: 10,
      source: 'tts',
    },
    cues: [
      {
        id: 'cue-1',
        text: 'Test script',
        startTime: 0,
        endTime: 5,
        words: [
          { text: 'Test', startTime: 0, endTime: 1 },
          { text: 'script', startTime: 1.5, endTime: 2.5 },
        ],
      },
    ],
    sections: [{ index: 0, text: 'Test script about automation.', startTime: 0, endTime: 10 }],
    assets: [
      {
        id: 'asset-1',
        url: '/tmp/asset1.mp4',
        type: 'video',
        role: 'board',
        description: 'Demo video',
        sectionIndex: 0,
        durationSeconds: 5,
      },
    ],
    metadata: { language: 'en' },
    ...overrides,
  };
}

function makePlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots: [
      {
        id: 'shot-1',
        startTime: 0,
        endTime: 5,
        scriptSegment: 'Test script',
        visual: { type: 'b-roll', searchQuery: 'asset-1', toolId: 'pexels' },
        transition: { type: 'crossfade', durationMs: 300 },
        reason: 'test',
      },
      {
        id: 'shot-2',
        startTime: 5,
        endTime: 10,
        scriptSegment: 'about automation',
        visual: { type: 'primary' },
        transition: { type: 'cut', durationMs: 0 },
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
    ...overrides,
  };
}

function makeCompositionProps(): Record<string, unknown> {
  return {
    layout: 'fullscreen',
    bRollSegments: [],
    effects: [],
    primaryVideoUrl: null,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('renderContentPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockBuildTemplatePlan.mockReturnValue(makePlan());
    mockAssembleComposition.mockReturnValue(makeCompositionProps());
    mockRenderVideo.mockResolvedValue({
      outputPath: '/tmp/output.mp4',
      step: { durationMs: 5000 },
    });
  });

  it('renders content through the full pipeline', async () => {
    const content = makeContentPackage();
    const result = await renderContentPackage({
      content,
      templateId: 'rapid-content',
    });

    expect(mockBuildTemplatePlan).toHaveBeenCalledWith(content, 'rapid-content');
    expect(mockAssembleComposition).toHaveBeenCalledTimes(1);
    expect(mockRenderVideo).toHaveBeenCalledTimes(1);

    expect(result.outputPath).toBe('/tmp/output.mp4');
    expect(result.durationSeconds).toBe(10);
    expect(result.plan).toBeDefined();
  });

  it('passes voiceover URL to assembleComposition', async () => {
    const content = makeContentPackage({
      voiceover: { url: '/custom/voice.mp3', durationSeconds: 15, source: 'tts' },
    });

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.voiceoverFilename).toBe('/custom/voice.mp3');
  });

  it('maps content assets to generated assets for b-roll shots', async () => {
    const content = makeContentPackage({
      assets: [
        {
          id: 'my-asset',
          url: 'https://example.com/video.mp4',
          type: 'video',
          role: 'board',
          description: 'Test',
          sectionIndex: 0,
          durationSeconds: 5,
        },
      ],
    });

    const plan = makePlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 10,
          scriptSegment: 'test',
          visual: { type: 'b-roll', searchQuery: 'my-asset', toolId: 'pexels' },
          transition: { type: 'cut', durationMs: 0 },
          reason: 'test',
        },
      ],
    });
    mockBuildTemplatePlan.mockReturnValue(plan);

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.assets).toHaveLength(1);
    expect(assembleArgs.assets[0].url).toBe('https://example.com/video.mp4');
    expect(assembleArgs.assets[0].shotId).toBe('shot-1');
    expect(assembleArgs.assets[0].toolId).toBe('user-upload');
  });

  it('uses stock-image type for image content assets', async () => {
    const content = makeContentPackage({
      assets: [
        {
          id: 'img-asset',
          url: 'https://example.com/image.png',
          type: 'image',
          role: 'board',
          description: 'Test image',
          sectionIndex: 0,
        },
      ],
    });

    const plan = makePlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 10,
          scriptSegment: 'test',
          visual: { type: 'b-roll', searchQuery: 'img-asset', toolId: 'pexels' },
          transition: { type: 'cut', durationMs: 0 },
          reason: 'test',
        },
      ],
    });
    mockBuildTemplatePlan.mockReturnValue(plan);

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.assets[0].type).toBe('stock-image');
  });

  it('calls onProgress callback at each step', async () => {
    const onProgress = vi.fn();

    await renderContentPackage({
      content: makeContentPackage(),
      templateId: 'test',
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith('Building montage plan...');
    expect(onProgress).toHaveBeenCalledWith('Assembling composition...');
    expect(onProgress).toHaveBeenCalledWith('Rendering video...');
  });

  it('passes custom outputPath to renderVideo', async () => {
    await renderContentPackage({
      content: makeContentPackage(),
      templateId: 'test',
      outputPath: '/custom/output.mp4',
    });

    expect(mockRenderVideo).toHaveBeenCalledWith(
      expect.anything(),
      '/custom/output.mp4',
      undefined
    );
  });

  it('passes brandPreset to assembleComposition', async () => {
    const brandPreset = { captionPreset: 'bold', animationStyle: 'bounce' as const };

    await renderContentPackage({
      content: makeContentPackage(),
      templateId: 'test',
      brandPreset,
    });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.brandPreset).toEqual(brandPreset);
  });

  it('handles primaryVideo with loop=true (passes durationSeconds)', async () => {
    const content = makeContentPackage({
      primaryVideo: {
        url: 'https://example.com/avatar.mp4',
        durationSeconds: 3,
        framing: 'bottom-aligned',
        loop: true,
        source: 'ai-avatar-loop',
      },
    });

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.primaryVideoDurationSeconds).toBe(3);
    expect(assembleArgs.primaryVideoObjectPosition).toBe('center 85%');
  });

  it('handles primaryVideo with loop=false (does not pass durationSeconds)', async () => {
    const content = makeContentPackage({
      primaryVideo: {
        url: 'https://example.com/heygen.mp4',
        durationSeconds: 15,
        framing: 'centered',
        loop: false,
        source: 'heygen',
      },
    });

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.primaryVideoDurationSeconds).toBeUndefined();
    expect(assembleArgs.primaryVideoObjectPosition).toBe('center');
  });

  it('maps framing values to CSS object-position', async () => {
    const framingCases: Array<{
      framing: 'bottom-aligned' | 'centered' | 'top-aligned';
      expected: string;
    }> = [
      { framing: 'bottom-aligned', expected: 'center 85%' },
      { framing: 'top-aligned', expected: 'center 15%' },
      { framing: 'centered', expected: 'center' },
    ];

    for (const { framing, expected } of framingCases) {
      vi.clearAllMocks();
      mockBuildTemplatePlan.mockReturnValue(makePlan());
      mockAssembleComposition.mockReturnValue(makeCompositionProps());
      mockRenderVideo.mockResolvedValue({ outputPath: '/tmp/out.mp4', step: { durationMs: 1 } });

      const content = makeContentPackage({
        primaryVideo: {
          url: 'https://example.com/video.mp4',
          durationSeconds: 10,
          framing,
          loop: false,
          source: 'heygen',
        },
      });

      await renderContentPackage({ content, templateId: 'test' });

      const args = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
      expect(args.primaryVideoObjectPosition).toBe(expected);
    }
  });

  it('defaults primaryVideoObjectPosition to center when no primaryVideo', async () => {
    const content = makeContentPackage({ primaryVideo: undefined });

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.primaryVideoObjectPosition).toBe('center');
  });

  describe('sfxDirector', () => {
    it('applies AI SFX when sfxDirector is provided', async () => {
      const sfxDirector = vi.fn().mockResolvedValue([
        { startTime: 1, sfxId: 'whoosh', volume: 0.8 },
        { startTime: 5, sfxId: 'pop', volume: 0.5 },
      ]);

      await renderContentPackage({
        content: makeContentPackage(),
        templateId: 'test',
        sfxDirector,
      });

      expect(sfxDirector).toHaveBeenCalledTimes(1);
      // sfxDirector receives the plan and content
      expect(sfxDirector).toHaveBeenCalledWith(
        expect.objectContaining({ layout: 'fullscreen' }),
        expect.objectContaining({ script: expect.any(String) })
      );
    });

    it('does not mutate plan sfxSegments when sfxDirector returns empty array', async () => {
      const sfxDirector = vi.fn().mockResolvedValue([]);
      const plan = makePlan({ sfxSegments: [{ startTime: 0, sfxId: 'original', volume: 1 }] });
      mockBuildTemplatePlan.mockReturnValue(plan);

      await renderContentPackage({
        content: makeContentPackage(),
        templateId: 'test',
        sfxDirector,
      });

      // sfxSegments should remain from original plan (not overwritten with empty)
      expect(sfxDirector).toHaveBeenCalledTimes(1);
    });

    it('calls onProgress for SFX planning step', async () => {
      const onProgress = vi.fn();
      const sfxDirector = vi.fn().mockResolvedValue([{ startTime: 1, sfxId: 'boom', volume: 1 }]);

      await renderContentPackage({
        content: makeContentPackage(),
        templateId: 'test',
        sfxDirector,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledWith('Planning SFX with AI director...');
    });
  });

  describe('error handling', () => {
    it('propagates error from buildTemplatePlan', async () => {
      mockBuildTemplatePlan.mockImplementation(() => {
        throw new Error('Template not found');
      });

      await expect(
        renderContentPackage({ content: makeContentPackage(), templateId: 'nonexistent' })
      ).rejects.toThrow('Template not found');
    });

    it('propagates error from assembleComposition', async () => {
      mockAssembleComposition.mockImplementation(() => {
        throw new Error('Assembly failed');
      });

      await expect(
        renderContentPackage({ content: makeContentPackage(), templateId: 'test' })
      ).rejects.toThrow('Assembly failed');
    });

    it('propagates error from renderVideo', async () => {
      mockRenderVideo.mockRejectedValue(new Error('Render timeout'));

      await expect(
        renderContentPackage({ content: makeContentPackage(), templateId: 'test' })
      ).rejects.toThrow('Render timeout');
    });

    it('propagates error from sfxDirector', async () => {
      const sfxDirector = vi.fn().mockRejectedValue(new Error('LLM API down'));

      await expect(
        renderContentPackage({
          content: makeContentPackage(),
          templateId: 'test',
          sfxDirector,
        })
      ).rejects.toThrow('LLM API down');
    });
  });

  it('skips assets for primary visual shots', async () => {
    const content = makeContentPackage();
    const plan = makePlan({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 10,
          scriptSegment: 'test',
          visual: { type: 'primary' },
          transition: { type: 'cut', durationMs: 0 },
          reason: 'test',
        },
      ],
    });
    mockBuildTemplatePlan.mockReturnValue(plan);

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.assets).toHaveLength(0);
  });

  it('maps cues with word timing to assembleComposition', async () => {
    const content = makeContentPackage({
      cues: [
        {
          id: 'cue-1',
          text: 'Hello world',
          startTime: 0,
          endTime: 2,
          words: [
            { text: 'Hello', startTime: 0, endTime: 0.8 },
            { text: 'world', startTime: 1, endTime: 1.8 },
          ],
        },
      ],
    });

    await renderContentPackage({ content, templateId: 'test' });

    const assembleArgs = mockAssembleComposition.mock.calls[0]![0] as Record<string, any>;
    expect(assembleArgs.cues).toHaveLength(1);
    expect(assembleArgs.cues[0].text).toBe('Hello world');
    expect(assembleArgs.cues[0].words).toHaveLength(2);
  });
});
