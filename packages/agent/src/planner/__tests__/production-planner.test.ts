import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { planProduction, revisePlan } from '../production-planner';
import type { PlannerInput, RevisePlanInput } from '../production-planner';
import type { ProductionPlan, ToolManifest } from '../../types';

// ── Mocks ────────────────────────────────────────────────────

// NOTE: prompt-builder is NOT mocked — it's synchronous and deterministic.
// Mocking it would contaminate prompt-builder.test.ts in bun's shared process.

// NOTE: Use spyOn instead of vi.mock to avoid contaminating other test files
// in bun's shared process. vi.mock is hoisted and persists globally.
import * as llmModule from '../../llm';

const mockDetectProvider = vi.spyOn(llmModule, 'detectProvider' as any);
const mockCallLLM = vi.spyOn(llmModule, 'callLLMWithSystem' as any);

afterAll(() => {
  mockDetectProvider.mockRestore();
  mockCallLLM.mockRestore();
});

// ── Fixtures ─────────────────────────────────────────────────

const baseManifest: ToolManifest = {
  tools: [
    {
      id: 'seedance2-piapi',
      name: 'Seedance 2',
      available: true,
      capabilities: [
        {
          assetType: 'ai-video',
          supportsPrompt: true,
          supportsScript: false,
          maxDurationSeconds: 10,
          estimatedLatencyMs: 30000,
          isAsync: true,
          costTier: 'moderate',
        },
      ],
    },
    {
      id: 'nanobanana2-kie',
      name: 'NanoBanana 2',
      available: true,
      capabilities: [
        {
          assetType: 'ai-image',
          supportsPrompt: true,
          supportsScript: false,
          estimatedLatencyMs: 5000,
          isAsync: true,
          costTier: 'cheap',
        },
      ],
    },
    {
      id: 'pexels',
      name: 'Pexels',
      available: true,
      capabilities: [
        {
          assetType: 'stock-video',
          supportsPrompt: false,
          supportsScript: false,
          estimatedLatencyMs: 2000,
          isAsync: false,
          costTier: 'free',
        },
      ],
    },
  ],
  summary: 'Test manifest',
};

const baseInput: PlannerInput = {
  script: 'This is a test script. It has two sentences.',
  durationEstimate: 10,
  style: 'dynamic',
  toolManifest: baseManifest,
};

function makeValidPlanJson(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots: [
      {
        id: 'shot-1',
        startTime: 0,
        endTime: 5,
        scriptSegment: 'This is a test script',
        visual: { type: 'ai-video', prompt: 'test prompt', toolId: 'seedance2-piapi' },
        transition: { type: 'crossfade', durationMs: 400 },
        reason: 'Opening shot',
      },
      {
        id: 'shot-2',
        startTime: 5,
        endTime: 10,
        scriptSegment: 'It has two sentences',
        visual: { type: 'primary' },
        transition: { type: 'crossfade', durationMs: 300 },
        reason: 'Closing shot',
      },
    ],
    effects: [],
    zoomSegments: [],
    lowerThirds: [],
    counters: [],
    highlights: [],
    ctaSegments: [],
    layout: 'fullscreen',
    reasoning: 'Test plan',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('planProduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset spies to default (undefined) before each test
    mockDetectProvider.mockReset();
    mockCallLLM.mockReset();
  });

  it('calls LLM and parses valid JSON response', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    const plan = makeValidPlanJson();
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);

    expect(mockCallLLM).toHaveBeenCalledOnce();
    expect(result.shots).toHaveLength(2);
    expect(result.layout).toBe('fullscreen');
    expect(result.reasoning).toBe('Test plan');
  });

  it('passes system prompt from buildPlannerPrompt and user message to LLM', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockResolvedValue(JSON.stringify(makeValidPlanJson()));

    await planProduction(baseInput);

    const [, systemPrompt, userMessage] = mockCallLLM.mock.calls[0];
    // Real prompt-builder output contains planner template content
    expect(systemPrompt).toContain('AI video production planner');
    expect(userMessage).toContain('This is a test script');
    expect(userMessage).toContain('Style: dynamic');
    expect(userMessage).toContain('Duration: 10.0s');
  });

  it('falls back to ruleBasedPlan when no API key is configured', async () => {
    mockDetectProvider.mockReturnValue(null);

    const result = await planProduction(baseInput);

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(result.reasoning).toContain('Rule-based');
    expect(result.shots.length).toBeGreaterThan(0);
  });

  it('falls back to ruleBasedPlan when LLM throws', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockRejectedValue(new Error('API timeout'));

    const result = await planProduction(baseInput);

    expect(result.reasoning).toContain('Rule-based');
  });

  it('includes primaryVideoUrl in user message', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockResolvedValue(JSON.stringify(makeValidPlanJson()));

    await planProduction({
      ...baseInput,
      primaryVideoUrl: 'https://example.com/video.mp4',
    });

    const userMessage = mockCallLLM.mock.calls[0][2];
    expect(userMessage).toContain('https://example.com/video.mp4');
    expect(userMessage).toContain('user-recording');
  });

  it('includes layout in user message when provided', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockResolvedValue(JSON.stringify(makeValidPlanJson()));

    await planProduction({
      ...baseInput,
      layout: 'split-screen',
    });

    const userMessage = mockCallLLM.mock.calls[0][2];
    expect(userMessage).toContain('Requested layout: split-screen');
  });

  it('includes userAssets section in user message', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockResolvedValue(JSON.stringify(makeValidPlanJson()));

    await planProduction({
      ...baseInput,
      userAssets: [
        {
          id: 'dashboard-ss',
          path: '/tmp/dash.png',
          url: 'https://cdn.example.com/dash.png',
          type: 'image',
          description: 'Screenshot of analytics dashboard',
        },
      ],
    });

    const userMessage = mockCallLLM.mock.calls[0][2];
    expect(userMessage).toContain('USER-PROVIDED ASSETS');
    expect(userMessage).toContain('dashboard-ss');
    expect(userMessage).toContain('Screenshot of analytics dashboard');
    expect(userMessage).toContain('user-upload');
  });

  it('includes timingReference in user message', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockResolvedValue(JSON.stringify(makeValidPlanJson()));

    const timing = '0.00-2.50: This is a test script.\n2.50-5.00: It has two sentences.';
    await planProduction({
      ...baseInput,
      timingReference: timing,
    });

    const userMessage = mockCallLLM.mock.calls[0][2];
    expect(userMessage).toContain('<timing>');
    expect(userMessage).toContain(timing);
    expect(userMessage).toContain('EXACT SPEECH TIMING');
  });
});

describe('revisePlan', () => {
  const originalPlan = makeValidPlanJson();
  const baseReviseInput: RevisePlanInput = {
    originalPlan,
    directorNotes: 'Make it more dynamic, add zoom effects',
    script: 'This is a test script. It has two sentences.',
    durationEstimate: 10,
    style: 'dynamic',
    toolManifest: baseManifest,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends revision prompt with original plan and director notes to LLM', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    const revisedPlan = makeValidPlanJson({ reasoning: 'Revised plan with zoom' });
    mockCallLLM.mockResolvedValue(JSON.stringify(revisedPlan));

    const result = await revisePlan(baseReviseInput);

    // Real prompt-builder used (not mocked) - just verify LLM was called
    const [, systemPrompt] = mockCallLLM.mock.calls[0];
    expect(systemPrompt).toContain('revising an existing plan');
    expect(systemPrompt).toContain('Make it more dynamic, add zoom effects');
    expect(result.reasoning).toBe('Revised plan with zoom');
  });

  it('includes script and duration in revision user message', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockResolvedValue(JSON.stringify(makeValidPlanJson()));

    await revisePlan(baseReviseInput);

    const userMessage = mockCallLLM.mock.calls[0][2];
    expect(userMessage).toContain('Revise the production plan');
    expect(userMessage).toContain('10s video');
    expect(userMessage).toContain('This is a test script');
    expect(userMessage).toContain('Style: dynamic');
  });

  it('returns original plan when no API key', async () => {
    mockDetectProvider.mockReturnValue(null);

    const result = await revisePlan(baseReviseInput);

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(result).toBe(originalPlan);
  });

  it('returns original plan when LLM throws', async () => {
    mockDetectProvider.mockReturnValue('anthropic');
    mockCallLLM.mockRejectedValue(new Error('Rate limit'));

    const result = await revisePlan(baseReviseInput);

    expect(result).toBe(originalPlan);
  });
});

describe('parseResponse (via planProduction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectProvider.mockReturnValue('anthropic');
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    const plan = makeValidPlanJson();
    mockCallLLM.mockResolvedValue('```json\n' + JSON.stringify(plan) + '\n```');

    const result = await planProduction(baseInput);
    expect(result.shots).toHaveLength(2);
  });

  it('parses JSON wrapped in plain code fences', async () => {
    const plan = makeValidPlanJson();
    mockCallLLM.mockResolvedValue('```\n' + JSON.stringify(plan) + '\n```');

    const result = await planProduction(baseInput);
    expect(result.shots).toHaveLength(2);
  });

  it('extracts JSON object from surrounding text', async () => {
    const plan = makeValidPlanJson();
    mockCallLLM.mockResolvedValue(
      'Here is the plan:\n' + JSON.stringify(plan) + '\nHope this helps!'
    );

    const result = await planProduction(baseInput);
    expect(result.shots).toHaveLength(2);
  });

  it('falls back to rule-based on completely malformed response', async () => {
    mockCallLLM.mockResolvedValue('This is not JSON at all, no braces anywhere');

    const result = await planProduction(baseInput);
    expect(result.reasoning).toContain('Rule-based');
  });

  it('falls back to rule-based on invalid JSON inside fences', async () => {
    mockCallLLM.mockResolvedValue('```json\n{not valid json\n```');

    const result = await planProduction(baseInput);
    expect(result.reasoning).toContain('Rule-based');
  });

  it('caps shots at 50', async () => {
    const manyShots = Array.from({ length: 60 }, (_, i) => ({
      id: `shot-${i + 1}`,
      startTime: i,
      endTime: i + 1,
      scriptSegment: `Segment ${i + 1}`,
      visual: { type: 'primary' },
      transition: { type: 'crossfade', durationMs: 400 },
      reason: `Shot ${i + 1}`,
    }));
    const plan = makeValidPlanJson({ shots: manyShots } as unknown as Partial<ProductionPlan>);
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.shots).toHaveLength(50);
  });

  it('filters out shots with invalid timing', async () => {
    const plan = makeValidPlanJson({
      shots: [
        {
          id: 'good',
          startTime: 0,
          endTime: 5,
          scriptSegment: 'Good shot',
          visual: { type: 'primary' },
          transition: { type: 'crossfade', durationMs: 400 },
          reason: 'Valid',
        },
        {
          id: 'bad-negative',
          startTime: -1,
          endTime: 5,
          scriptSegment: 'Bad',
          visual: { type: 'primary' },
          transition: { type: 'crossfade', durationMs: 400 },
          reason: 'Invalid start',
        },
        {
          id: 'bad-reversed',
          startTime: 5,
          endTime: 3,
          scriptSegment: 'Bad',
          visual: { type: 'primary' },
          transition: { type: 'crossfade', durationMs: 400 },
          reason: 'Reversed timing',
        },
      ],
    } as unknown as Partial<ProductionPlan>);
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].id).toBe('good');
  });

  it('sanitizes invalid transition type to crossfade', async () => {
    const plan = makeValidPlanJson({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 5,
          scriptSegment: 'Test',
          visual: { type: 'primary' },
          transition: { type: 'invalid-transition', durationMs: 400 },
          reason: 'Test',
        },
      ],
    } as unknown as Partial<ProductionPlan>);
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.shots[0].transition.type).toBe('crossfade');
  });

  it('validates layout against allowed values', async () => {
    const plan = makeValidPlanJson({ layout: 'invalid-layout' as ProductionPlan['layout'] });
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.layout).toBe('fullscreen');
  });

  it('accepts valid layout from LLM', async () => {
    const plan = makeValidPlanJson({ layout: 'split-screen' });
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.layout).toBe('split-screen');
  });

  it('forces user-recording primarySource when primaryVideoUrl is provided', async () => {
    const plan = makeValidPlanJson({
      primarySource: { type: 'avatar', toolId: 'heygen', script: 'test' },
    } as unknown as Partial<ProductionPlan>);
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction({
      ...baseInput,
      primaryVideoUrl: 'https://cdn.example.com/my-video.mp4',
    });

    expect(result.primarySource.type).toBe('user-recording');
    if (result.primarySource.type === 'user-recording') {
      expect(result.primarySource.url).toBe('https://cdn.example.com/my-video.mp4');
    }
  });

  it('rejects non-public primaryVideoUrl', async () => {
    const plan = makeValidPlanJson();
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction({
      ...baseInput,
      primaryVideoUrl: 'http://localhost:3000/video.mp4',
    });

    expect(result.primarySource.type).toBe('none');
  });

  it('enforces tool preferences on ai-video shots', async () => {
    const plan = makeValidPlanJson({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 5,
          scriptSegment: 'Test',
          visual: { type: 'ai-video', prompt: 'test', toolId: 'pexels' },
          transition: { type: 'crossfade', durationMs: 400 },
          reason: 'Test',
        },
      ],
    } as unknown as Partial<ProductionPlan>);
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);

    // seedance2-piapi is available and highest priority among available tools
    expect(result.shots[0].visual).toHaveProperty('toolId', 'seedance2-piapi');
  });

  it('enforces tool preferences on ai-image shots', async () => {
    const plan = makeValidPlanJson({
      shots: [
        {
          id: 'shot-1',
          startTime: 0,
          endTime: 5,
          scriptSegment: 'Test',
          visual: { type: 'ai-image', prompt: 'test', toolId: 'pexels' },
          transition: { type: 'crossfade', durationMs: 400 },
          reason: 'Test',
        },
      ],
    } as unknown as Partial<ProductionPlan>);
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);

    // nanobanana2-kie is available and highest priority among available image tools
    expect(result.shots[0].visual).toHaveProperty('toolId', 'nanobanana2-kie');
  });

  it('parses zoomSegments from LLM response', async () => {
    const plan = makeValidPlanJson({
      zoomSegments: [
        {
          startTime: 2,
          endTime: 4,
          scale: 1.5,
          focusPoint: { x: 50, y: 50 },
          easing: 'smooth',
        },
      ],
    });
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.zoomSegments).toHaveLength(1);
    expect(result.zoomSegments[0].scale).toBe(1.5);
    expect(result.zoomSegments[0].easing).toBe('smooth');
  });

  it('parses lowerThirds from LLM response', async () => {
    const plan = makeValidPlanJson({
      lowerThirds: [
        {
          startTime: 1,
          endTime: 3,
          title: 'Pawel Jurczyk',
          subtitle: 'Founder',
        },
      ],
    });
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.lowerThirds).toHaveLength(1);
    expect(result.lowerThirds[0].title).toBe('Pawel Jurczyk');
  });

  it('parses ctaSegments from LLM response', async () => {
    const plan = makeValidPlanJson({
      ctaSegments: [
        {
          startTime: 8,
          endTime: 10,
          text: 'Follow for more',
          style: 'pill',
        },
      ],
    });
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.ctaSegments).toHaveLength(1);
    expect(result.ctaSegments[0].text).toBe('Follow for more');
    expect(result.ctaSegments[0].style).toBe('pill');
  });

  it('handles empty response object gracefully', async () => {
    mockCallLLM.mockResolvedValue('{}');

    const result = await planProduction(baseInput);
    expect(result.shots).toEqual([]);
    expect(result.effects).toEqual([]);
    expect(result.primarySource.type).toBe('none');
    expect(result.layout).toBe('fullscreen');
  });

  it('sanitizes caption style and strips dangerous CSS', async () => {
    const plan = makeValidPlanJson({
      captionStyle: {
        fontSize: 48,
        fontColor: '#ffffff',
        backgroundColor: 'url(javascript:alert(1))',
        unknownProp: 'ignored',
      },
    });
    mockCallLLM.mockResolvedValue(JSON.stringify(plan));

    const result = await planProduction(baseInput);
    expect(result.captionStyle).toBeDefined();
    expect(result.captionStyle!.fontSize).toBe(48);
    expect(result.captionStyle!.fontColor).toBe('#ffffff');
    // url() and javascript: should be stripped
    const bgValue = result.captionStyle!.backgroundColor as string;
    expect(bgValue).not.toContain('url');
    expect(bgValue).not.toContain('javascript');
    // unknownProp should be filtered out
    expect(result.captionStyle!).not.toHaveProperty('unknownProp');
  });
});

describe('ruleBasedPlan (via planProduction fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectProvider.mockReturnValue(null);
  });

  it('creates shots from script sentences', async () => {
    const result = await planProduction(baseInput);

    expect(result.shots.length).toBeGreaterThan(0);
    result.shots.forEach((shot) => {
      expect(shot.startTime).toBeGreaterThanOrEqual(0);
      expect(shot.endTime).toBeGreaterThan(shot.startTime);
      expect(shot.transition.type).toBe('crossfade');
    });
  });

  it('adds text-emphasis effect for dynamic style', async () => {
    const result = await planProduction(baseInput);
    const emphasis = result.effects.find((e) => e.type === 'text-emphasis');
    expect(emphasis).toBeDefined();
  });

  it('adds emoji-popup for dynamic style with long video', async () => {
    const result = await planProduction({
      ...baseInput,
      durationEstimate: 15,
    });
    const popup = result.effects.find((e) => e.type === 'emoji-popup');
    expect(popup).toBeDefined();
  });

  it('does not add emoji-popup for short videos', async () => {
    const result = await planProduction({
      ...baseInput,
      durationEstimate: 8,
    });
    const popup = result.effects.find((e) => e.type === 'emoji-popup');
    expect(popup).toBeUndefined();
  });

  it('uses requested layout', async () => {
    const result = await planProduction({
      ...baseInput,
      layout: 'picture-in-picture',
    });
    expect(result.layout).toBe('picture-in-picture');
  });

  it('sets user-recording primarySource when primaryVideoUrl is valid', async () => {
    const result = await planProduction({
      ...baseInput,
      primaryVideoUrl: 'https://cdn.example.com/video.mp4',
    });
    expect(result.primarySource.type).toBe('user-recording');
  });

  it('sets none primarySource when primaryVideoUrl is not public', async () => {
    const result = await planProduction({
      ...baseInput,
      primaryVideoUrl: 'http://192.168.1.1/video.mp4',
    });
    expect(result.primarySource.type).toBe('none');
  });
});

// isPublicUrl tests moved to utils/__tests__/url-validation.test.ts
// to avoid vi.mock contamination from asset-generator.test.ts
