/**
 * Production Plan Validator
 *
 * Deterministic validation + auto-fix of LLM-generated plans.
 * Catches issues that the LLM prompt guidelines ask for but don't enforce:
 * - Effect time overlaps
 * - Counter/effect/CTA collisions
 * - B-roll gaps in faceless reels
 * - Caption zone conflicts
 * - Duplicate representations (text-emphasis + counter for same concept)
 *
 * Run AFTER planning, BEFORE asset generation.
 */
import type { ProductionPlan } from '../types';

export interface ValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly type: string;
  readonly message: string;
  readonly autoFixed: boolean;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly fixedPlan: ProductionPlan;
}

/** All timed elements from a plan, normalized for overlap checking */
interface TimedElement {
  readonly source: string; // 'effect', 'counter', 'cta', 'lowerThird'
  readonly index: number;
  readonly type: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly position?: string; // 'top', 'center', 'bottom'
}

const MIN_GAP_BETWEEN_EFFECTS = 0.3; // seconds

export function validatePlan(plan: ProductionPlan, audioDuration: number): ValidationResult {
  const issues: ValidationIssue[] = [];
  let fixedPlan = { ...plan };

  // ── 1. Effect overlap detection & fix ──────────────────────────
  const allTimed = collectTimedElements(plan);
  const overlaps = findOverlaps(allTimed);

  if (overlaps.length > 0) {
    const { fixed, fixIssues } = fixOverlaps(plan, overlaps);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 2. B-roll gap detection (faceless reels) ───────────────────
  if (plan.primarySource.type === 'none') {
    const gapIssues = findBRollGaps(plan.shots, audioDuration);
    issues.push(...gapIssues);
  }

  // ── 3. Bottom-screen collisions ────────────────────────────────
  const bottomCollisions = findBottomScreenCollisions(fixedPlan);
  if (bottomCollisions.length > 0) {
    const { fixed, fixIssues } = fixBottomCollisions(fixedPlan, bottomCollisions);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 4. Effects out of bounds ───────────────────────────────────
  const outOfBounds = findOutOfBoundsElements(fixedPlan, audioDuration);
  if (outOfBounds.length > 0) {
    const { fixed, fixIssues } = fixOutOfBounds(fixedPlan, outOfBounds, audioDuration);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 5. Text-emphasis duplication (narration text in effects) ──
  const textDupIssues = findTextEmphasisDuplication(fixedPlan);
  if (textDupIssues.effectsToRemove.size > 0) {
    fixedPlan = {
      ...fixedPlan,
      effects: fixedPlan.effects.filter((_, i) => !textDupIssues.effectsToRemove.has(i)),
    };
  }
  issues.push(...textDupIssues.issues);

  // ── 6. Hybrid-anchor shotLayout enforcement ─────────────────────
  if (fixedPlan.layout === 'hybrid-anchor') {
    const { fixed, fixIssues } = enforceShotLayoutVariety(fixedPlan);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 7. Deduplicate consecutive same-asset shots ─────────────────
  {
    const { fixed, fixIssues } = deduplicateConsecutiveAssets(fixedPlan);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 8. Max shot duration clamp (4s max) ─────────────────────────
  if (fixedPlan.layout === 'hybrid-anchor') {
    const { fixed, fixIssues } = clampShotDurations(fixedPlan, 4);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 9. Highlight timing validation ─────────────────────────────
  if (fixedPlan.layout === 'hybrid-anchor' && fixedPlan.highlights?.length > 0) {
    const { fixed, fixIssues } = validateHighlightTiming(fixedPlan);
    fixedPlan = fixed;
    issues.push(...fixIssues);
  }

  // ── 10. CTA limit (max 1) ──────────────────────────────────────
  if (fixedPlan.ctaSegments && fixedPlan.ctaSegments.length > 1) {
    fixedPlan = {
      ...fixedPlan,
      ctaSegments: [fixedPlan.ctaSegments[fixedPlan.ctaSegments.length - 1]],
    };
    issues.push({
      severity: 'warning',
      type: 'cta-limit',
      message: `Removed ${plan.ctaSegments.length - 1} extra CTA(s) — max 1 allowed`,
      autoFixed: true,
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error' && !i.autoFixed);

  return {
    valid: !hasErrors,
    issues,
    fixedPlan,
  };
}

/** Enforce shotLayout variety in hybrid-anchor mode. Auto-assigns missing shotLayouts. */
function enforceShotLayoutVariety(plan: ProductionPlan): {
  fixed: ProductionPlan;
  fixIssues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const layoutPattern = ['head', 'split', 'content', 'head', 'split', 'content'] as const;
  let patternIdx = 0;

  const fixedShots = plan.shots.map((shot) => {
    if (shot.shotLayout) return shot;
    // Auto-assign based on visual type and rotating pattern
    let assigned: 'head' | 'content' | 'split' | 'montage' | 'anchor' | 'fullscreen';
    if (shot.visual.type === 'primary') {
      assigned = 'head';
    } else {
      assigned = layoutPattern[patternIdx % layoutPattern.length];
      patternIdx++;
    }
    return { ...shot, shotLayout: assigned };
  });

  const layouts = new Set(fixedShots.map((s) => s.shotLayout).filter(Boolean));
  if (!layouts.has('split')) {
    issues.push({
      severity: 'warning',
      type: 'no-split-layout',
      message: 'No "split" shotLayout found — auto-assigning to every other content shot',
      autoFixed: true,
    });
    let contentIdx = 0;
    for (let i = 0; i < fixedShots.length; i++) {
      if (fixedShots[i].visual.type !== 'primary' && fixedShots[i].shotLayout !== 'head') {
        if (contentIdx % 2 === 0) {
          fixedShots[i] = { ...fixedShots[i], shotLayout: 'split' };
        }
        contentIdx++;
      }
    }
  }

  // Enforce distribution: min 60% content/split
  const total = fixedShots.length;
  const contentSplitCount = fixedShots.filter(
    (s) => s.shotLayout === 'content' || s.shotLayout === 'split'
  ).length;
  if (total > 3 && contentSplitCount / total < 0.6) {
    let converted = 0;
    for (let i = 0; i < fixedShots.length; i++) {
      if (fixedShots[i].shotLayout === 'head' && fixedShots[i].visual.type !== 'primary') {
        fixedShots[i] = { ...fixedShots[i], shotLayout: converted % 2 === 0 ? 'split' : 'content' };
        converted++;
        const newRatio =
          fixedShots.filter((s) => s.shotLayout === 'content' || s.shotLayout === 'split').length /
          total;
        if (newRatio >= 0.6) break;
      }
    }
    if (converted > 0) {
      issues.push({
        severity: 'warning',
        type: 'layout-distribution-enforced',
        message: `Converted ${converted} "head" shots to content/split to reach 60% minimum`,
        autoFixed: true,
      });
    }
  }

  // Enforce max 2 consecutive head shots
  for (let i = 2; i < fixedShots.length; i++) {
    if (
      fixedShots[i].shotLayout === 'head' &&
      fixedShots[i - 1].shotLayout === 'head' &&
      fixedShots[i - 2].shotLayout === 'head'
    ) {
      fixedShots[i] = { ...fixedShots[i], shotLayout: 'split' };
      issues.push({
        severity: 'warning',
        type: 'consecutive-head-limit',
        message: `Shot ${fixedShots[i].id}: converted 3rd consecutive "head" to "split"`,
        autoFixed: true,
      });
    }
  }

  const anyChanged = fixedShots.some((s, i) => s !== plan.shots[i]);
  if (anyChanged) {
    issues.push({
      severity: 'warning',
      type: 'shotLayout-auto-assigned',
      message: `Auto-assigned/adjusted shotLayout on ${fixedShots.filter((s, i) => s !== plan.shots[i]).length} shot(s)`,
      autoFixed: true,
    });
  }

  return { fixed: { ...plan, shots: fixedShots }, fixIssues: issues };
}

/** Remove duplicate uses of the same asset. Keep first occurrence, remove subsequent. */
function deduplicateConsecutiveAssets(plan: ProductionPlan): {
  fixed: ProductionPlan;
  fixIssues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const shots = [...plan.shots];
  const toRemove = new Set<number>();
  const seenAssets = new Set<string>();

  for (let i = 0; i < shots.length; i++) {
    if (shots[i].visual.type === 'primary') continue;
    const visual = shots[i].visual as Record<string, unknown>;
    const assetKey = `${visual.toolId}:${visual.searchQuery}`;
    if (!visual.searchQuery) continue;

    if (seenAssets.has(assetKey)) {
      // Duplicate — extend previous primary shot or remove
      toRemove.add(i);
    } else {
      seenAssets.add(assetKey);
    }
  }

  if (toRemove.size > 0) {
    // Redistribute time: extend neighboring shots to fill gaps
    const fixedShots = shots.filter((_, i) => !toRemove.has(i));
    issues.push({
      severity: 'warning',
      type: 'duplicate-asset-removed',
      message: `Removed ${toRemove.size} duplicate asset shot(s) — each board asset used once`,
      autoFixed: true,
    });
    return { fixed: { ...plan, shots: fixedShots }, fixIssues: issues };
  }

  return { fixed: plan, fixIssues: issues };
}

/** Truncate shots longer than maxSeconds. Excess time is absorbed by the next shot. */
function clampShotDurations(
  plan: ProductionPlan,
  maxSeconds: number
): { fixed: ProductionPlan; fixIssues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const shots = [...plan.shots] as Array<(typeof plan.shots)[number]>;
  let clampCount = 0;

  for (let i = 0; i < shots.length; i++) {
    const dur = shots[i].endTime - shots[i].startTime;
    if (dur > maxSeconds) {
      shots[i] = { ...shots[i], endTime: shots[i].startTime + maxSeconds };
      clampCount++;
      // Push remaining time to next shot's start (close the gap)
      if (i + 1 < shots.length) {
        shots[i + 1] = { ...shots[i + 1], startTime: shots[i].endTime };
      }
    }
  }

  if (clampCount > 0) {
    issues.push({
      severity: 'warning',
      type: 'shot-duration-clamped',
      message: `Clamped ${clampCount} shot(s) to max ${maxSeconds}s`,
      autoFixed: true,
    });
  }

  return { fixed: { ...plan, shots }, fixIssues: issues };
}

/** Remove highlights that overlap with head-only shots (no content to highlight). */
function validateHighlightTiming(plan: ProductionPlan): {
  fixed: ProductionPlan;
  fixIssues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const contentSplitRanges = plan.shots
    .filter((s) => s.shotLayout === 'content' || s.shotLayout === 'split')
    .map((s) => ({ start: s.startTime, end: s.endTime }));

  const validHighlights = plan.highlights.filter((h) => {
    const overlapsContent = contentSplitRanges.some(
      (r) => h.startTime < r.end && h.endTime > r.start
    );
    return overlapsContent;
  });

  const removed = plan.highlights.length - validHighlights.length;
  if (removed > 0) {
    issues.push({
      severity: 'warning',
      type: 'highlight-on-head-removed',
      message: `Removed ${removed} highlight(s) that appeared during head-only shots`,
      autoFixed: true,
    });
  }

  return { fixed: { ...plan, highlights: validHighlights }, fixIssues: issues };
}

// ── Helpers ──────────────────────────────────────────────────────

function collectTimedElements(plan: ProductionPlan): TimedElement[] {
  const elements: TimedElement[] = [];

  plan.effects.forEach((e, i) => {
    elements.push({
      source: 'effect',
      index: i,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
      position: (e.config as Record<string, unknown> | undefined)?.position as string | undefined,
    });
  });

  (plan.counters ?? []).forEach((c, i) => {
    elements.push({
      source: 'counter',
      index: i,
      type: 'counter',
      startTime: c.startTime,
      endTime: c.endTime,
      position: c.position ?? 'center',
    });
  });

  (plan.ctaSegments ?? []).forEach((c, i) => {
    elements.push({
      source: 'cta',
      index: i,
      type: 'cta',
      startTime: c.startTime,
      endTime: c.endTime,
      position: c.position ?? 'bottom',
    });
  });

  (plan.lowerThirds ?? []).forEach((lt, i) => {
    elements.push({
      source: 'lowerThird',
      index: i,
      type: 'lowerThird',
      startTime: lt.startTime,
      endTime: lt.endTime,
      position: 'bottom',
    });
  });

  return elements.sort((a, b) => a.startTime - b.startTime);
}

interface Overlap {
  a: TimedElement;
  b: TimedElement;
  overlapStart: number;
  overlapEnd: number;
}

function findOverlaps(elements: TimedElement[]): Overlap[] {
  const overlaps: Overlap[] = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];

      // Check if they overlap in time (with minimum gap)
      const overlapStart = Math.max(a.startTime, b.startTime);
      const overlapEnd = Math.min(a.endTime, b.endTime);

      if (overlapEnd - overlapStart > -MIN_GAP_BETWEEN_EFFECTS) {
        // They overlap or are too close
        overlaps.push({ a, b, overlapStart, overlapEnd });
      }
    }
  }

  return overlaps;
}

function fixOverlaps(
  plan: ProductionPlan,
  overlaps: Overlap[]
): { fixed: ProductionPlan; fixIssues: ValidationIssue[] } {
  const fixIssues: ValidationIssue[] = [];
  const effectsToRemove = new Set<number>();
  const countersToRemove = new Set<number>();

  for (const { a, b } of overlaps) {
    const desc = `${a.source}[${a.index}] "${a.type}" [${a.startTime.toFixed(1)}s-${a.endTime.toFixed(1)}s] overlaps with ${b.source}[${b.index}] "${b.type}" [${b.startTime.toFixed(1)}s-${b.endTime.toFixed(1)}s]`;

    // Strategy: remove the less important element
    // Priority: counter > text-emphasis > emoji-popup > subscribe-banner > screen-shake > color-flash > glitch-transition > cta > lowerThird
    const priority: Record<string, number> = {
      counter: 10,
      'text-emphasis': 9,
      'emoji-popup': 7,
      'subscribe-banner': 6,
      'screen-shake': 5,
      'color-flash': 4,
      'glitch-transition': 3,
      cta: 2,
      lowerThird: 1,
    };

    const aPriority = priority[a.type] ?? 0;
    const bPriority = priority[b.type] ?? 0;

    // Remove the lower-priority one
    const toRemove = aPriority >= bPriority ? b : a;

    if (toRemove.source === 'effect') {
      effectsToRemove.add(toRemove.index);
    } else if (toRemove.source === 'counter') {
      countersToRemove.add(toRemove.index);
    }
    // CTA and lowerThird: just warn, don't remove

    fixIssues.push({
      severity: 'warning',
      type: 'effect-overlap',
      message: `${desc} → removed ${toRemove.source}[${toRemove.index}] "${toRemove.type}"`,
      autoFixed: true,
    });
  }

  return {
    fixed: {
      ...plan,
      effects: plan.effects.filter((_, i) => !effectsToRemove.has(i)),
      counters: (plan.counters ?? []).filter((_, i) => !countersToRemove.has(i)),
    },
    fixIssues,
  };
}

function findBRollGaps(shots: ProductionPlan['shots'], audioDuration: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (shots.length === 0) {
    issues.push({
      severity: 'error',
      type: 'no-shots',
      message: 'Faceless reel has no shots — will be entirely black screen',
      autoFixed: false,
    });
    return issues;
  }

  // Check first shot starts at 0
  if (shots[0].startTime > 0.5) {
    issues.push({
      severity: 'warning',
      type: 'broll-gap-start',
      message: `First shot starts at ${shots[0].startTime.toFixed(1)}s, not 0s — ${shots[0].startTime.toFixed(1)}s of black screen at start`,
      autoFixed: false,
    });
  }

  // Check gaps between shots
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const curr = shots[i];
    const gap = curr.startTime - prev.endTime;

    if (gap > 0.5) {
      issues.push({
        severity: 'warning',
        type: 'broll-gap',
        message: `${gap.toFixed(1)}s gap between shot-${i} (ends ${prev.endTime.toFixed(1)}s) and shot-${i + 1} (starts ${curr.startTime.toFixed(1)}s)`,
        autoFixed: false,
      });
    }
  }

  // Check last shot covers end
  const lastShot = shots[shots.length - 1];
  if (audioDuration - lastShot.endTime > 0.5) {
    issues.push({
      severity: 'warning',
      type: 'broll-gap-end',
      message: `Last shot ends at ${lastShot.endTime.toFixed(1)}s but audio is ${audioDuration.toFixed(1)}s — ${(audioDuration - lastShot.endTime).toFixed(1)}s of black screen at end`,
      autoFixed: false,
    });
  }

  return issues;
}

function findBottomScreenCollisions(plan: ProductionPlan): Overlap[] {
  const bottomElements: TimedElement[] = [];

  plan.effects.forEach((e, i) => {
    if (e.type === 'subscribe-banner') {
      bottomElements.push({
        source: 'effect',
        index: i,
        type: e.type,
        startTime: e.startTime,
        endTime: e.endTime,
        position: 'bottom',
      });
    }
  });

  (plan.ctaSegments ?? []).forEach((c, i) => {
    bottomElements.push({
      source: 'cta',
      index: i,
      type: 'cta',
      startTime: c.startTime,
      endTime: c.endTime,
      position: 'bottom',
    });
  });

  (plan.lowerThirds ?? []).forEach((lt, i) => {
    bottomElements.push({
      source: 'lowerThird',
      index: i,
      type: 'lowerThird',
      startTime: lt.startTime,
      endTime: lt.endTime,
      position: 'bottom',
    });
  });

  return findOverlaps(bottomElements);
}

function fixBottomCollisions(
  plan: ProductionPlan,
  collisions: Overlap[]
): { fixed: ProductionPlan; fixIssues: ValidationIssue[] } {
  const fixIssues: ValidationIssue[] = [];

  for (const { a, b } of collisions) {
    fixIssues.push({
      severity: 'warning',
      type: 'bottom-collision',
      message: `Bottom-screen collision: ${a.source} "${a.type}" and ${b.source} "${b.type}" overlap at ${a.startTime.toFixed(1)}s-${b.endTime.toFixed(1)}s`,
      autoFixed: false,
    });
  }

  return { fixed: plan, fixIssues };
}

/**
 * Detect text-emphasis effects that duplicate narration/caption text.
 * - WARN + auto-remove if text has more than 3 words
 * - WARN + auto-remove if text is a substring of any shot's scriptSegment
 */
function findTextEmphasisDuplication(plan: ProductionPlan): {
  effectsToRemove: Set<number>;
  issues: ValidationIssue[];
} {
  const effectsToRemove = new Set<number>();
  const issues: ValidationIssue[] = [];

  const scriptTexts = plan.shots
    .map((s) => s.scriptSegment?.toLowerCase().trim())
    .filter((t): t is string => !!t && t.length > 0);

  plan.effects.forEach((effect, index) => {
    if (effect.type !== 'text-emphasis') return;

    const text = ((effect.config as Record<string, unknown>)?.text as string) ?? '';
    if (!text) return;

    const wordCount = text.trim().split(/\s+/).length;

    if (wordCount > 3) {
      effectsToRemove.add(index);
      issues.push({
        severity: 'warning',
        type: 'text-emphasis-too-long',
        message: `effect[${index}] text-emphasis "${text}" has ${wordCount} words (max 3) - removed`,
        autoFixed: true,
      });
      return;
    }

    const lowerText = text.toLowerCase().trim();
    if (lowerText.length >= 4) {
      for (const script of scriptTexts) {
        if (script.includes(lowerText)) {
          effectsToRemove.add(index);
          issues.push({
            severity: 'warning',
            type: 'text-emphasis-duplicates-narration',
            message: `effect[${index}] text-emphasis "${text}" duplicates narration - removed`,
            autoFixed: true,
          });
          break;
        }
      }
    }
  });

  return { effectsToRemove, issues };
}

function findOutOfBoundsElements(plan: ProductionPlan, audioDuration: number): TimedElement[] {
  const allTimed = collectTimedElements(plan);
  return allTimed.filter((e) => e.endTime > audioDuration + 0.5 || e.startTime < -0.5);
}

function fixOutOfBounds(
  plan: ProductionPlan,
  outOfBounds: TimedElement[],
  audioDuration: number
): { fixed: ProductionPlan; fixIssues: ValidationIssue[] } {
  const fixIssues: ValidationIssue[] = [];
  const effectsToRemove = new Set<number>();

  for (const elem of outOfBounds) {
    fixIssues.push({
      severity: 'warning',
      type: 'out-of-bounds',
      message: `${elem.source}[${elem.index}] "${elem.type}" at ${elem.startTime.toFixed(1)}s-${elem.endTime.toFixed(1)}s is outside audio duration (${audioDuration.toFixed(1)}s) → removed`,
      autoFixed: true,
    });
    if (elem.source === 'effect') {
      effectsToRemove.add(elem.index);
    }
  }

  return {
    fixed: {
      ...plan,
      effects: plan.effects.filter((_, i) => !effectsToRemove.has(i)),
    },
    fixIssues,
  };
}
