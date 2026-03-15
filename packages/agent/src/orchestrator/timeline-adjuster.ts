import type { ProductionPlan, ShotPlan, EffectPlan } from '../types';

/**
 * Adjusts a production plan's timestamps to match the actual TTS audio duration.
 * The planner works with estimated durations; after TTS we know the real length.
 */
export function adjustTimeline(
  plan: ProductionPlan,
  actualDurationSeconds: number,
): ProductionPlan {
  if (plan.shots.length === 0) return plan;

  const allEndTimes = [
    ...plan.shots.map((s) => s.endTime),
    ...plan.effects.map((e) => e.endTime),
    ...plan.zoomSegments.map((z) => z.endTime),
    ...plan.lowerThirds.map((l) => l.endTime),
    ...plan.counters.map((c) => c.endTime),
    ...plan.highlights.map((h) => h.endTime),
    ...plan.ctaSegments.map((c) => c.endTime),
  ];
  const planEnd = Math.max(...allEndTimes);

  // If the plan duration is very close to actual, no adjustment needed
  if (Math.abs(planEnd - actualDurationSeconds) < 0.5) return plan;

  const ratio = actualDurationSeconds / (planEnd || 1);
  const scale = <T extends { startTime: number; endTime: number }>(item: T): T => ({
    ...item,
    startTime: item.startTime * ratio,
    endTime: Math.min(item.endTime * ratio, actualDurationSeconds),
  });
  const inRange = (item: { startTime: number }) => item.startTime < actualDurationSeconds;

  return {
    ...plan,
    shots: plan.shots.map(scale),
    effects: plan.effects.map(scale).filter(inRange),
    zoomSegments: plan.zoomSegments.map(scale).filter(inRange),
    lowerThirds: plan.lowerThirds.map(scale).filter(inRange),
    counters: plan.counters.map(scale).filter(inRange),
    highlights: plan.highlights.map(scale).filter(inRange),
    ctaSegments: plan.ctaSegments.map(scale).filter(inRange),
  };
}
