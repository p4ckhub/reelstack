import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ProductionPlan } from '../../types';

// Hoisted mocks for ffmpeg primitives — tests inject return values per-case
// without needing real audio/video files.
const { measureLufsMock, probeMediaMock } = vi.hoisted(() => ({
  measureLufsMock: vi.fn<(p: string) => number | null>(),
  probeMediaMock: vi.fn<
    (p: string) => {
      formatName: string;
      durationSeconds: number;
      streams: Array<{ codecType: string; codecName: string }>;
    }
  >(),
}));

vi.mock('@reelstack/ffmpeg', () => ({
  measureLufs: measureLufsMock,
  probeMedia: probeMediaMock,
}));

import { runPreRenderGates, runPostRenderGates, runTier0Gates } from '../tier0-gates';

beforeEach(() => {
  measureLufsMock.mockReset();
  probeMediaMock.mockReset();
});

const cues = [
  { startTime: 0, endTime: 1.5, text: 'hello' },
  { startTime: 1.5, endTime: 3, text: 'world' },
];

function makePlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots: [
      {
        id: 'shot-1',
        startTime: 0,
        endTime: 3,
        scriptSegment: '',
        reason: 'test',
        visual: { type: 'b-roll', toolId: 'pexels', searchQuery: 'sunset' },
        transition: { type: 'cut', durationMs: 0 },
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
  } as unknown as ProductionPlan;
}

describe('runPreRenderGates', () => {
  test('passes when LUFS in range, durations align, captions present', async () => {
    measureLufsMock.mockReturnValue(-16);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/vo.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
    });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('FAILS on silent audio (LUFS = -inf → null)', async () => {
    measureLufsMock.mockReturnValue(null);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/silent.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('lufs:') && /silent/i.test(f))).toBe(true);
  });

  test('FAILS when LUFS too quiet (-30)', async () => {
    measureLufsMock.mockReturnValue(-30);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/quiet.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('lufs:') && /-30/.test(f))).toBe(true);
  });

  test('FAILS when LUFS too loud (-5)', async () => {
    measureLufsMock.mockReturnValue(-5);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/loud.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('lufs:'))).toBe(true);
  });

  test('FAILS when plan duration drifts > 0.5s from audio', async () => {
    measureLufsMock.mockReturnValue(-16);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/vo.mp3',
      audioDuration: 5, // plan ends at 3s, drift = 2s
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('duration:'))).toBe(true);
  });

  test('FAILS when plan has voiceover but no captions attached', async () => {
    measureLufsMock.mockReturnValue(-16);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/vo.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues: [],
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('captions:'))).toBe(true);
  });

  test('SKIPS LUFS gate when no voiceover path provided', async () => {
    const result = await runPreRenderGates({
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
    });
    const lufs = result.details.find((d) => d.id === 'lufs');
    expect(lufs?.status).toBe('skipped');
    expect(result.passed).toBe(true);
  });

  test('SKIPS captions when primarySource is none (silent reel)', async () => {
    measureLufsMock.mockReturnValue(-16);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/vo.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'none' } }),
      cues: [],
    });
    const captions = result.details.find((d) => d.id === 'captions');
    expect(captions?.status).toBe('skipped');
  });

  test('SKIPS persona-reference gate when no persona configured', async () => {
    measureLufsMock.mockReturnValue(-16);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/vo.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
    });
    const persona = result.details.find((d) => d.id === 'persona-reference');
    expect(persona?.status).toBe('skipped');
    expect(result.passed).toBe(true);
  });

  test('FAILS persona-reference when persona set but reference missing', async () => {
    measureLufsMock.mockReturnValue(-16);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/vo.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
      personaReference: { personaId: 'cyber-retro', hasReference: false },
    });
    const persona = result.details.find((d) => d.id === 'persona-reference');
    expect(persona?.status).toBe('failed');
    expect(persona?.message).toContain('cyber-retro');
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('persona-reference:'))).toBe(true);
  });

  test('PASSES persona-reference when persona set and reference present', async () => {
    measureLufsMock.mockReturnValue(-16);
    const result = await runPreRenderGates({
      voiceoverPath: '/tmp/vo.mp3',
      audioDuration: 3,
      plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
      cues,
      personaReference: { personaId: 'cyber-retro', hasReference: true },
    });
    const persona = result.details.find((d) => d.id === 'persona-reference');
    expect(persona?.status).toBe('passed');
    expect(result.passed).toBe(true);
  });
});

describe('runPostRenderGates', () => {
  test('passes for valid mp4/h264/aac with matching duration and burned captions', async () => {
    probeMediaMock.mockReturnValue({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      durationSeconds: 30,
      streams: [
        { codecType: 'video', codecName: 'h264' },
        { codecType: 'audio', codecName: 'aac' },
      ],
    });
    const result = await runPostRenderGates({
      outputPath: '/tmp/out.mp4',
      expectedDuration: 30,
      expectsCaptions: true,
      assumeBurnedInCaptions: true,
    });
    expect(result.passed).toBe(true);
  });

  test('FAILS on wrong container (webm) and wrong codecs', async () => {
    probeMediaMock.mockReturnValue({
      formatName: 'matroska,webm',
      durationSeconds: 30,
      streams: [
        { codecType: 'video', codecName: 'vp9' },
        { codecType: 'audio', codecName: 'opus' },
      ],
    });
    const result = await runPostRenderGates({
      outputPath: '/tmp/out.webm',
      expectedDuration: 30,
      expectsCaptions: false,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('container:'))).toBe(true);
    expect(result.failures.some((f) => f.startsWith('codec:'))).toBe(true);
  });

  test('FAILS when rendered duration drifts > 0.5s', async () => {
    probeMediaMock.mockReturnValue({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      durationSeconds: 25, // expected 30
      streams: [
        { codecType: 'video', codecName: 'h264' },
        { codecType: 'audio', codecName: 'aac' },
      ],
    });
    const result = await runPostRenderGates({
      outputPath: '/tmp/out.mp4',
      expectedDuration: 30,
      expectsCaptions: false,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('render-duration:'))).toBe(true);
  });

  test('FAILS when captions expected but no stream and no burn-in guarantee', async () => {
    probeMediaMock.mockReturnValue({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      durationSeconds: 30,
      streams: [
        { codecType: 'video', codecName: 'h264' },
        { codecType: 'audio', codecName: 'aac' },
      ],
    });
    const result = await runPostRenderGates({
      outputPath: '/tmp/out.mp4',
      expectedDuration: 30,
      expectsCaptions: true,
      assumeBurnedInCaptions: false,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('captions-output:'))).toBe(true);
  });

  test('passes captions check when subtitle stream present', async () => {
    probeMediaMock.mockReturnValue({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      durationSeconds: 30,
      streams: [
        { codecType: 'video', codecName: 'h264' },
        { codecType: 'audio', codecName: 'aac' },
        { codecType: 'subtitle', codecName: 'mov_text' },
      ],
    });
    const result = await runPostRenderGates({
      outputPath: '/tmp/out.mp4',
      expectedDuration: 30,
      expectsCaptions: true,
    });
    expect(result.passed).toBe(true);
  });

  test('FAILS gracefully when ffprobe throws', async () => {
    probeMediaMock.mockImplementation(() => {
      throw new Error('ffprobe missing');
    });
    const result = await runPostRenderGates({
      outputPath: '/tmp/out.mp4',
      expectedDuration: 30,
      expectsCaptions: false,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.startsWith('probe:'))).toBe(true);
  });
});

describe('runTier0Gates', () => {
  test('combines pre + post and returns aggregated failures', async () => {
    measureLufsMock.mockReturnValue(-30); // pre fails
    probeMediaMock.mockReturnValue({
      formatName: 'matroska,webm', // post fails
      durationSeconds: 30,
      streams: [{ codecType: 'video', codecName: 'vp9' }],
    });
    const result = await runTier0Gates({
      pre: {
        voiceoverPath: '/tmp/vo.mp3',
        audioDuration: 3,
        plan: makePlan({ primarySource: { type: 'avatar', toolId: 'heygen', script: 'x' } }),
        cues,
      },
      post: {
        outputPath: '/tmp/out.webm',
        expectedDuration: 30,
        expectsCaptions: false,
      },
    });
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(2);
  });
});
