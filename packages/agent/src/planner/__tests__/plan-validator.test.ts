import { describe, it, expect } from 'vitest';
import { validatePlan, type ValidationResult } from '../plan-validator';
import type {
  ProductionPlan,
  ShotPlan,
  EffectPlan,
  CounterPlan,
  CtaPlan,
  LowerThirdPlan,
  HighlightPlan,
} from '../../types';

// ── Helpers ──────────────────────────────────────────────────

function makeShot(overrides: Partial<ShotPlan> = {}): ShotPlan {
  return {
    id: 'shot-1',
    startTime: 0,
    endTime: 5,
    scriptSegment: 'Test segment',
    visual: { type: 'b-roll', searchQuery: 'city', toolId: 'pexels' },
    transition: { type: 'crossfade', durationMs: 300 },
    reason: 'test',
    ...overrides,
  };
}

function makeEffect(overrides: Partial<EffectPlan> = {}): EffectPlan {
  return {
    type: 'emoji-popup',
    startTime: 1,
    endTime: 3,
    config: {},
    reason: 'test',
    ...overrides,
  };
}

function makeCounter(overrides: Partial<CounterPlan> = {}): CounterPlan {
  return {
    startTime: 2,
    endTime: 4,
    value: 100,
    ...overrides,
  };
}

function makeCta(overrides: Partial<CtaPlan> = {}): CtaPlan {
  return {
    startTime: 8,
    endTime: 10,
    text: 'Follow me!',
    ...overrides,
  };
}

function makeLowerThird(overrides: Partial<LowerThirdPlan> = {}): LowerThirdPlan {
  return {
    startTime: 0,
    endTime: 3,
    title: 'John Doe',
    ...overrides,
  };
}

function makePlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots: [makeShot()],
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

// ── Tests ────────────────────────────────────────────────────

describe('validatePlan', () => {
  describe('valid plans', () => {
    it('returns no issues for a minimal valid plan', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
      });
      const result = validatePlan(plan, 10);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('returns no issues for a plan with non-overlapping effects', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [
          makeEffect({ startTime: 0, endTime: 2 }),
          makeEffect({ startTime: 3, endTime: 5 }),
          makeEffect({ startTime: 6, endTime: 8 }),
        ],
      });
      const result = validatePlan(plan, 10);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('effect overlap detection', () => {
    it('detects overlapping effects and removes lower-priority one', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [
          makeEffect({ type: 'text-emphasis', startTime: 2, endTime: 5, config: { text: 'Hi' } }),
          makeEffect({ type: 'screen-shake', startTime: 3, endTime: 6 }),
        ],
      });

      const result = validatePlan(plan, 10);

      const overlapIssues = result.issues.filter((i) => i.type === 'effect-overlap');
      expect(overlapIssues.length).toBeGreaterThan(0);
      expect(overlapIssues[0].autoFixed).toBe(true);
      // screen-shake (priority 5) is lower than text-emphasis (priority 9), so it gets removed
      expect(result.fixedPlan.effects).toHaveLength(1);
      expect(result.fixedPlan.effects[0].type).toBe('text-emphasis');
    });

    it('detects overlap between effects and counters', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [makeEffect({ type: 'emoji-popup', startTime: 2, endTime: 5 })],
        counters: [makeCounter({ startTime: 3, endTime: 6 })],
      });

      const result = validatePlan(plan, 10);

      const overlapIssues = result.issues.filter((i) => i.type === 'effect-overlap');
      expect(overlapIssues.length).toBeGreaterThan(0);
      // Counter has priority 10, emoji-popup has priority 7 -> emoji-popup removed
      expect(result.fixedPlan.effects).toHaveLength(0);
      expect(result.fixedPlan.counters).toHaveLength(1);
    });

    it('detects overlap between effects and CTAs', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [makeEffect({ type: 'screen-shake', startTime: 7, endTime: 10 })],
        ctaSegments: [makeCta({ startTime: 8, endTime: 10 })],
      });

      const result = validatePlan(plan, 10);

      const overlapIssues = result.issues.filter((i) => i.type === 'effect-overlap');
      expect(overlapIssues.length).toBeGreaterThan(0);
    });

    it('detects elements overlapping by just 0.1s (within MIN_GAP threshold)', () => {
      // MIN_GAP_BETWEEN_EFFECTS is 0.3s, so elements that are within 0.3s are flagged
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [
          makeEffect({ type: 'emoji-popup', startTime: 1, endTime: 3 }),
          makeEffect({ type: 'screen-shake', startTime: 3.1, endTime: 5 }),
        ],
      });

      const result = validatePlan(plan, 10);

      // Gap is 0.1s which is less than MIN_GAP (0.3s), so it should be flagged
      const overlapIssues = result.issues.filter((i) => i.type === 'effect-overlap');
      expect(overlapIssues.length).toBeGreaterThan(0);
    });

    it('does NOT flag effects separated by more than MIN_GAP', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [
          makeEffect({ type: 'emoji-popup', startTime: 1, endTime: 3 }),
          makeEffect({ type: 'screen-shake', startTime: 3.5, endTime: 5 }),
        ],
      });

      const result = validatePlan(plan, 10);

      const overlapIssues = result.issues.filter((i) => i.type === 'effect-overlap');
      expect(overlapIssues).toHaveLength(0);
    });

    it('detects overlap between lowerThirds and effects', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [makeEffect({ type: 'screen-shake', startTime: 1, endTime: 3 })],
        lowerThirds: [makeLowerThird({ startTime: 2, endTime: 4 })],
      });

      const result = validatePlan(plan, 10);

      const overlapIssues = result.issues.filter((i) => i.type === 'effect-overlap');
      expect(overlapIssues.length).toBeGreaterThan(0);
    });
  });

  describe('B-roll gap detection (faceless reels)', () => {
    it('detects gap at start when first shot does not start at 0', () => {
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [makeShot({ startTime: 2, endTime: 10 })],
      });

      const result = validatePlan(plan, 10);

      const gapIssue = result.issues.find((i) => i.type === 'broll-gap-start');
      expect(gapIssue).toBeDefined();
      expect(gapIssue!.severity).toBe('warning');
    });

    it('detects gap between shots', () => {
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [
          makeShot({ id: 'shot-1', startTime: 0, endTime: 3 }),
          makeShot({ id: 'shot-2', startTime: 5, endTime: 10 }),
        ],
      });

      const result = validatePlan(plan, 10);

      const gapIssue = result.issues.find((i) => i.type === 'broll-gap');
      expect(gapIssue).toBeDefined();
      expect(gapIssue!.message).toContain('2.0s gap');
    });

    it('detects gap at end when last shot does not cover audio duration', () => {
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [makeShot({ startTime: 0, endTime: 7 })],
      });

      const result = validatePlan(plan, 10);

      const gapIssue = result.issues.find((i) => i.type === 'broll-gap-end');
      expect(gapIssue).toBeDefined();
    });

    it('reports error for empty shots in faceless reel', () => {
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [],
      });

      const result = validatePlan(plan, 10);

      const noShotsIssue = result.issues.find((i) => i.type === 'no-shots');
      expect(noShotsIssue).toBeDefined();
      expect(noShotsIssue!.severity).toBe('error');
      expect(result.valid).toBe(false);
    });

    it('does NOT check gaps for non-faceless reels (avatar primary source)', () => {
      const plan = makePlan({
        primarySource: { type: 'avatar', toolId: 'heygen', script: 'Hello' },
        shots: [
          makeShot({ id: 'shot-1', startTime: 0, endTime: 3 }),
          makeShot({ id: 'shot-2', startTime: 7, endTime: 10 }),
        ],
      });

      const result = validatePlan(plan, 10);

      const gapIssues = result.issues.filter(
        (i) => i.type === 'broll-gap' || i.type === 'broll-gap-start' || i.type === 'broll-gap-end'
      );
      expect(gapIssues).toHaveLength(0);
    });

    it('does NOT flag small gaps under 0.5s', () => {
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [
          makeShot({ id: 'shot-1', startTime: 0, endTime: 5 }),
          makeShot({ id: 'shot-2', startTime: 5.3, endTime: 10 }),
        ],
      });

      const result = validatePlan(plan, 10);

      const gapIssues = result.issues.filter((i) => i.type === 'broll-gap');
      expect(gapIssues).toHaveLength(0);
    });

    it('passes when shots cover full duration with no gaps', () => {
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [
          makeShot({ id: 'shot-1', startTime: 0, endTime: 5 }),
          makeShot({ id: 'shot-2', startTime: 5, endTime: 10 }),
        ],
      });

      const result = validatePlan(plan, 10);

      const gapIssues = result.issues.filter(
        (i) =>
          i.type === 'broll-gap' ||
          i.type === 'broll-gap-start' ||
          i.type === 'broll-gap-end' ||
          i.type === 'no-shots'
      );
      expect(gapIssues).toHaveLength(0);
    });
  });

  describe('out-of-bounds timing validation', () => {
    it('removes effects that extend beyond audio duration', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [makeEffect({ type: 'emoji-popup', startTime: 9, endTime: 12 })],
      });

      const result = validatePlan(plan, 10);

      const oobIssue = result.issues.find((i) => i.type === 'out-of-bounds');
      expect(oobIssue).toBeDefined();
      expect(oobIssue!.autoFixed).toBe(true);
      expect(result.fixedPlan.effects).toHaveLength(0);
    });

    it('removes effects that start before 0 (negative time)', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [makeEffect({ type: 'emoji-popup', startTime: -2, endTime: 1 })],
      });

      const result = validatePlan(plan, 10);

      const oobIssue = result.issues.find((i) => i.type === 'out-of-bounds');
      expect(oobIssue).toBeDefined();
      expect(result.fixedPlan.effects).toHaveLength(0);
    });

    it('allows effects within 0.5s tolerance of audio boundary', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10.3 })],
        effects: [makeEffect({ type: 'emoji-popup', startTime: 8, endTime: 10.3 })],
      });

      const result = validatePlan(plan, 10);

      // 10.3 is within 0.5s of 10, so it should NOT be flagged
      const oobIssues = result.issues.filter((i) => i.type === 'out-of-bounds');
      expect(oobIssues).toHaveLength(0);
    });
  });

  describe('text-emphasis duplication check', () => {
    it('removes text-emphasis with more than 3 words', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [
          makeEffect({
            type: 'text-emphasis',
            startTime: 1,
            endTime: 3,
            config: { text: 'This is too many words here' },
          }),
        ],
      });

      const result = validatePlan(plan, 10);

      const dupIssue = result.issues.find((i) => i.type === 'text-emphasis-too-long');
      expect(dupIssue).toBeDefined();
      expect(dupIssue!.autoFixed).toBe(true);
      expect(result.fixedPlan.effects).toHaveLength(0);
    });

    it('removes text-emphasis that duplicates narration (scriptSegment)', () => {
      const plan = makePlan({
        shots: [
          makeShot({ startTime: 0, endTime: 10, scriptSegment: 'Learn about automation tools' }),
        ],
        effects: [
          makeEffect({
            type: 'text-emphasis',
            startTime: 1,
            endTime: 3,
            config: { text: 'automation' },
          }),
        ],
      });

      const result = validatePlan(plan, 10);

      const dupIssue = result.issues.find((i) => i.type === 'text-emphasis-duplicates-narration');
      expect(dupIssue).toBeDefined();
      expect(dupIssue!.autoFixed).toBe(true);
      expect(result.fixedPlan.effects).toHaveLength(0);
    });

    it('keeps short text-emphasis that does NOT match narration', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10, scriptSegment: 'Learn about automation' })],
        effects: [
          makeEffect({
            type: 'text-emphasis',
            startTime: 1,
            endTime: 3,
            config: { text: 'WOW' },
          }),
        ],
      });

      const result = validatePlan(plan, 10);

      // "WOW" is 3 chars, below 4-char threshold for narration matching, and <= 3 words
      const dupIssues = result.issues.filter(
        (i) =>
          i.type === 'text-emphasis-too-long' || i.type === 'text-emphasis-duplicates-narration'
      );
      expect(dupIssues).toHaveLength(0);
      expect(result.fixedPlan.effects).toHaveLength(1);
    });

    it('does NOT flag non-text-emphasis effects', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10, scriptSegment: 'emoji fun time' })],
        effects: [
          makeEffect({
            type: 'emoji-popup',
            startTime: 1,
            endTime: 3,
            config: { text: 'emoji fun time is the best ever' },
          }),
        ],
      });

      const result = validatePlan(plan, 10);

      const dupIssues = result.issues.filter(
        (i) =>
          i.type === 'text-emphasis-too-long' || i.type === 'text-emphasis-duplicates-narration'
      );
      expect(dupIssues).toHaveLength(0);
    });
  });

  describe('CTA limit enforcement', () => {
    it('removes extra CTAs keeping only the last one', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 15 })],
        ctaSegments: [
          makeCta({ startTime: 2, endTime: 4, text: 'First CTA' }),
          makeCta({ startTime: 6, endTime: 8, text: 'Second CTA' }),
          makeCta({ startTime: 12, endTime: 14, text: 'Last CTA' }),
        ],
      });

      const result = validatePlan(plan, 15);

      const ctaIssue = result.issues.find((i) => i.type === 'cta-limit');
      expect(ctaIssue).toBeDefined();
      expect(result.fixedPlan.ctaSegments).toHaveLength(1);
      expect(result.fixedPlan.ctaSegments[0].text).toBe('Last CTA');
    });

    it('keeps single CTA unchanged', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        ctaSegments: [makeCta({ startTime: 8, endTime: 10 })],
      });

      const result = validatePlan(plan, 10);

      const ctaIssue = result.issues.find((i) => i.type === 'cta-limit');
      expect(ctaIssue).toBeUndefined();
      expect(result.fixedPlan.ctaSegments).toHaveLength(1);
    });
  });

  describe('bottom-screen collision detection', () => {
    it('warns when subscribe-banner and CTA overlap at bottom', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [makeEffect({ type: 'subscribe-banner', startTime: 7, endTime: 10 })],
        ctaSegments: [makeCta({ startTime: 8, endTime: 10 })],
      });

      const result = validatePlan(plan, 10);

      const collisionIssues = result.issues.filter((i) => i.type === 'bottom-collision');
      expect(collisionIssues.length).toBeGreaterThan(0);
    });

    it('warns when lowerThird and CTA overlap', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        lowerThirds: [makeLowerThird({ startTime: 1, endTime: 4 })],
        ctaSegments: [makeCta({ startTime: 2, endTime: 5 })],
      });

      const result = validatePlan(plan, 10);

      const collisionIssues = result.issues.filter((i) => i.type === 'bottom-collision');
      expect(collisionIssues.length).toBeGreaterThan(0);
    });
  });

  describe('hybrid-anchor shot layout enforcement', () => {
    it('auto-assigns shotLayout when missing', () => {
      const plan = makePlan({
        layout: 'hybrid-anchor',
        shots: [
          makeShot({ id: 'shot-1', startTime: 0, endTime: 2, visual: { type: 'primary' } }),
          makeShot({ id: 'shot-2', startTime: 2, endTime: 4 }),
          makeShot({ id: 'shot-3', startTime: 4, endTime: 6 }),
          makeShot({ id: 'shot-4', startTime: 6, endTime: 8, visual: { type: 'primary' } }),
          makeShot({ id: 'shot-5', startTime: 8, endTime: 10 }),
        ],
      });

      const result = validatePlan(plan, 10);

      // Every shot should have a shotLayout assigned
      for (const shot of result.fixedPlan.shots) {
        expect(shot.shotLayout).toBeDefined();
      }
    });

    it('enforces max 2 consecutive head shots', () => {
      // Need 60%+ content/split to avoid distribution enforcement converting heads first
      // 10 shots: 3 head + 7 content/split = 70% content/split -> distribution OK
      const plan = makePlan({
        layout: 'hybrid-anchor',
        shots: [
          makeShot({
            id: 'shot-1',
            startTime: 0,
            endTime: 1,
            shotLayout: 'head',
            visual: { type: 'primary' },
          }),
          makeShot({
            id: 'shot-2',
            startTime: 1,
            endTime: 2,
            shotLayout: 'head',
            visual: { type: 'primary' },
          }),
          makeShot({
            id: 'shot-3',
            startTime: 2,
            endTime: 3,
            shotLayout: 'head',
            visual: { type: 'primary' },
          }),
          makeShot({
            id: 'shot-4',
            startTime: 3,
            endTime: 4,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'a', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-5',
            startTime: 4,
            endTime: 5,
            shotLayout: 'split',
            visual: { type: 'b-roll', searchQuery: 'b', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-6',
            startTime: 5,
            endTime: 6,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'c', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-7',
            startTime: 6,
            endTime: 7,
            shotLayout: 'split',
            visual: { type: 'b-roll', searchQuery: 'd', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-8',
            startTime: 7,
            endTime: 8,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'e', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-9',
            startTime: 8,
            endTime: 9,
            shotLayout: 'split',
            visual: { type: 'b-roll', searchQuery: 'f', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-10',
            startTime: 9,
            endTime: 10,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'g', toolId: 'pexels' },
          }),
        ],
      });

      const result = validatePlan(plan, 10);

      const consecutiveIssue = result.issues.find((i) => i.type === 'consecutive-head-limit');
      expect(consecutiveIssue).toBeDefined();
      // Third consecutive head shot should be converted to split
      expect(result.fixedPlan.shots[2].shotLayout).toBe('split');
    });
  });

  describe('shot duration clamping (hybrid-anchor)', () => {
    it('clamps shots longer than 4s and adjusts next shot start time', () => {
      const plan = makePlan({
        layout: 'hybrid-anchor',
        shots: [
          makeShot({
            id: 'shot-1',
            startTime: 0,
            endTime: 6,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'nature', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-2',
            startTime: 6,
            endTime: 10,
            shotLayout: 'split',
            visual: { type: 'b-roll', searchQuery: 'tech', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-3',
            startTime: 10,
            endTime: 14,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'office', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-4',
            startTime: 14,
            endTime: 18,
            shotLayout: 'split',
            visual: { type: 'b-roll', searchQuery: 'sky', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-5',
            startTime: 18,
            endTime: 20,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'sea', toolId: 'pexels' },
          }),
        ],
      });

      const result = validatePlan(plan, 20);

      const clampIssue = result.issues.find((i) => i.type === 'shot-duration-clamped');
      expect(clampIssue).toBeDefined();
      // First shot (6s) should be clamped to 4s
      expect(result.fixedPlan.shots[0].endTime).toBe(4);
      // Next shot start should be adjusted to fill the gap
      expect(result.fixedPlan.shots[1].startTime).toBe(4);
    });

    it('does NOT clamp in non-hybrid-anchor layouts', () => {
      const plan = makePlan({
        layout: 'fullscreen',
        shots: [makeShot({ id: 'shot-1', startTime: 0, endTime: 8 })],
      });

      const result = validatePlan(plan, 10);

      const clampIssues = result.issues.filter((i) => i.type === 'shot-duration-clamped');
      expect(clampIssues).toHaveLength(0);
    });
  });

  describe('highlight timing validation (hybrid-anchor)', () => {
    it('removes highlights during head-only shots', () => {
      // Need 60%+ content/split and enough shots to avoid distribution re-assignment
      const plan = makePlan({
        layout: 'hybrid-anchor',
        shots: [
          makeShot({
            id: 'shot-1',
            startTime: 0,
            endTime: 2,
            shotLayout: 'head',
            visual: { type: 'primary' },
          }),
          makeShot({
            id: 'shot-2',
            startTime: 2,
            endTime: 4,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'a', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-3',
            startTime: 4,
            endTime: 6,
            shotLayout: 'split',
            visual: { type: 'b-roll', searchQuery: 'b', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-4',
            startTime: 6,
            endTime: 8,
            shotLayout: 'content',
            visual: { type: 'b-roll', searchQuery: 'c', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-5',
            startTime: 8,
            endTime: 10,
            shotLayout: 'split',
            visual: { type: 'b-roll', searchQuery: 'd', toolId: 'pexels' },
          }),
        ],
        highlights: [
          {
            startTime: 0.5,
            endTime: 1.5,
            x: 100,
            y: 100,
            width: 200,
            height: 200,
          } as HighlightPlan,
          { startTime: 3, endTime: 3.5, x: 100, y: 100, width: 200, height: 200 } as HighlightPlan,
        ],
      });

      const result = validatePlan(plan, 10);

      const highlightIssue = result.issues.find((i) => i.type === 'highlight-on-head-removed');
      expect(highlightIssue).toBeDefined();
      // First highlight (0.5-1.5) is during head-only shot -> removed
      // Second highlight (3-3.5) is during content shot -> kept
      expect(result.fixedPlan.highlights).toHaveLength(1);
      expect(result.fixedPlan.highlights[0].startTime).toBe(3);
    });
  });

  describe('duplicate consecutive assets', () => {
    it('removes shots with duplicate asset search queries', () => {
      const plan = makePlan({
        shots: [
          makeShot({
            id: 'shot-1',
            startTime: 0,
            endTime: 3,
            visual: { type: 'b-roll', searchQuery: 'city', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-2',
            startTime: 3,
            endTime: 6,
            visual: { type: 'b-roll', searchQuery: 'forest', toolId: 'pexels' },
          }),
          makeShot({
            id: 'shot-3',
            startTime: 6,
            endTime: 10,
            visual: { type: 'b-roll', searchQuery: 'city', toolId: 'pexels' },
          }),
        ],
      });

      const result = validatePlan(plan, 10);

      const dupIssue = result.issues.find((i) => i.type === 'duplicate-asset-removed');
      expect(dupIssue).toBeDefined();
      expect(result.fixedPlan.shots).toHaveLength(2);
    });

    it('does NOT flag primary visual type shots as duplicates', () => {
      const plan = makePlan({
        shots: [
          makeShot({ id: 'shot-1', startTime: 0, endTime: 3, visual: { type: 'primary' } }),
          makeShot({ id: 'shot-2', startTime: 3, endTime: 6, visual: { type: 'primary' } }),
          makeShot({ id: 'shot-3', startTime: 6, endTime: 10, visual: { type: 'primary' } }),
        ],
      });

      const result = validatePlan(plan, 10);

      const dupIssues = result.issues.filter((i) => i.type === 'duplicate-asset-removed');
      expect(dupIssues).toHaveLength(0);
      expect(result.fixedPlan.shots).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    it('handles a single shot plan', () => {
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [makeShot({ startTime: 0, endTime: 10 })],
      });

      const result = validatePlan(plan, 10);

      expect(result.valid).toBe(true);
    });

    it('handles plan with all element types present', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 20 })],
        effects: [makeEffect({ startTime: 1, endTime: 3 })],
        counters: [makeCounter({ startTime: 5, endTime: 7 })],
        ctaSegments: [makeCta({ startTime: 15, endTime: 18 })],
        lowerThirds: [makeLowerThird({ startTime: 10, endTime: 13 })],
      });

      const result = validatePlan(plan, 20);

      // No overlaps, everything in bounds
      expect(result.valid).toBe(true);
    });

    it('returns valid=true when all issues are autoFixed', () => {
      const plan = makePlan({
        shots: [makeShot({ startTime: 0, endTime: 10 })],
        effects: [
          makeEffect({ type: 'emoji-popup', startTime: 1, endTime: 4 }),
          makeEffect({ type: 'screen-shake', startTime: 2, endTime: 5 }),
        ],
      });

      const result = validatePlan(plan, 10);

      // Overlap is auto-fixed by removing lower-priority effect
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.every((i) => i.autoFixed)).toBe(true);
      expect(result.valid).toBe(true);
    });
  });
});
