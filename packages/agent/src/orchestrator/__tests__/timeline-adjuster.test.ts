import { describe, it, expect } from 'vitest';
import { adjustTimeline } from '../timeline-adjuster';
import type { ProductionPlan } from '../../types';

function makePlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots: [
      {
        id: 'shot-1',
        startTime: 0,
        endTime: 5,
        scriptSegment: 'First part',
        visual: { type: 'primary' },
        transition: { type: 'crossfade', durationMs: 300 },
        reason: 'test',
      },
      {
        id: 'shot-2',
        startTime: 5,
        endTime: 10,
        scriptSegment: 'Second part',
        visual: { type: 'primary' },
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
    ...overrides,
  };
}

describe('adjustTimeline', () => {
  it('returns plan unchanged when empty shots', () => {
    const plan = makePlan({ shots: [] });
    const result = adjustTimeline(plan, 15);
    expect(result).toBe(plan);
  });

  it('returns plan unchanged when duration difference is < 0.5s', () => {
    const plan = makePlan();
    const result = adjustTimeline(plan, 10.3);
    expect(result).toBe(plan);
  });

  it('scales shot timestamps proportionally when actual is longer', () => {
    const plan = makePlan();
    const result = adjustTimeline(plan, 20);

    expect(result.shots[0].startTime).toBeCloseTo(0, 2);
    expect(result.shots[0].endTime).toBeCloseTo(10, 2);
    expect(result.shots[1].startTime).toBeCloseTo(10, 2);
    expect(result.shots[1].endTime).toBeCloseTo(20, 2);
  });

  it('scales shot timestamps proportionally when actual is shorter', () => {
    const plan = makePlan();
    const result = adjustTimeline(plan, 5);

    expect(result.shots[0].startTime).toBeCloseTo(0, 2);
    expect(result.shots[0].endTime).toBeCloseTo(2.5, 2);
    expect(result.shots[1].startTime).toBeCloseTo(2.5, 2);
    expect(result.shots[1].endTime).toBeCloseTo(5, 2);
  });

  it('scales effects timestamps', () => {
    const plan = makePlan({
      effects: [
        { type: 'text-emphasis', startTime: 2, endTime: 4, text: 'wow' },
      ] as unknown as ProductionPlan['effects'],
    });
    const result = adjustTimeline(plan, 20);

    expect(result.effects[0].startTime).toBeCloseTo(4, 2);
    expect(result.effects[0].endTime).toBeCloseTo(8, 2);
  });

  it('scales zoomSegments timestamps', () => {
    const plan = makePlan({
      zoomSegments: [
        { startTime: 0, endTime: 5, scale: 1.5, focusPoint: { x: 50, y: 50 }, easing: 'smooth' },
      ],
    });
    const result = adjustTimeline(plan, 20);

    expect(result.zoomSegments[0].startTime).toBeCloseTo(0, 2);
    expect(result.zoomSegments[0].endTime).toBeCloseTo(10, 2);
  });

  it('scales lowerThirds timestamps', () => {
    const plan = makePlan({
      lowerThirds: [{ startTime: 1, endTime: 3, title: 'Name', subtitle: 'Role' }],
    });
    const result = adjustTimeline(plan, 20);

    expect(result.lowerThirds[0].startTime).toBeCloseTo(2, 2);
    expect(result.lowerThirds[0].endTime).toBeCloseTo(6, 2);
  });

  it('scales ctaSegments timestamps', () => {
    const plan = makePlan({
      ctaSegments: [{ startTime: 8, endTime: 10, text: 'Follow', style: 'pill' }],
    });
    const result = adjustTimeline(plan, 20);

    expect(result.ctaSegments[0].startTime).toBeCloseTo(16, 2);
    expect(result.ctaSegments[0].endTime).toBeCloseTo(20, 2);
  });

  it('filters out effects that start beyond actual duration when shrinking', () => {
    const plan = makePlan({
      effects: [
        { type: 'text-emphasis', startTime: 2, endTime: 4, text: 'early' },
        { type: 'emoji-popup', startTime: 9, endTime: 10, emoji: 'late' },
      ] as unknown as ProductionPlan['effects'],
    });
    const result = adjustTimeline(plan, 5);

    // 9 * 0.5 = 4.5 which is < 5, so both should survive
    expect(result.effects).toHaveLength(2);
  });

  it('clamps endTime to actualDuration', () => {
    const plan = makePlan();
    const result = adjustTimeline(plan, 20);

    for (const shot of result.shots) {
      expect(shot.endTime).toBeLessThanOrEqual(20);
    }
  });

  it('preserves non-timing properties', () => {
    const plan = makePlan();
    const result = adjustTimeline(plan, 20);

    expect(result.shots[0].id).toBe('shot-1');
    expect(result.shots[0].scriptSegment).toBe('First part');
    expect(result.layout).toBe('fullscreen');
    expect(result.reasoning).toBe('test plan');
    expect(result.primarySource.type).toBe('none');
  });
});
