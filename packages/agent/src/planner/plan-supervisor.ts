/**
 * Plan Supervisor — "James Cameron" of reels.
 *
 * An LLM-powered creative director that reviews production plans for quality.
 * Reviews the plan holistically: pacing, visual storytelling, effect placement,
 * B-roll relevance, emotional arc, and technical correctness.
 *
 * Flow: Director (planner) creates plan → Supervisor reviews → if issues found,
 * sends notes back to Director for revision → max N iterations.
 */
import type { ProductionPlan, ToolManifest } from '../types';
import type { MontageProfileEntry } from '@reelstack/remotion/catalog';
import { revisePlan } from './production-planner';
import { buildProfileSupervisorChecks } from './montage-profile';
import { getModel } from '../config/models';
import { createLogger } from '@reelstack/logger';
import { renderTemplate } from '../prompts/renderer';
import { loadTemplate } from '../prompts/loader';

const log = createLogger('plan-supervisor');

const MAX_REVISIONS = 2;

export interface SupervisorInput {
  readonly plan: ProductionPlan;
  readonly script: string;
  readonly audioDuration: number;
  readonly style: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  readonly toolManifest: ToolManifest;
  readonly timingReference?: string;
  /** Montage profile for per-profile supervisor checks */
  readonly montageProfile?: MontageProfileEntry;
}

export interface SupervisorResult {
  readonly plan: ProductionPlan;
  readonly approved: boolean;
  readonly iterations: number;
  readonly reviews: readonly SupervisorReview[];
}

export interface SupervisorReview {
  readonly iteration: number;
  readonly verdict: 'approved' | 'needs-revision';
  readonly score: number; // 1-10
  readonly notes: string;
}

function buildSupervisorPrompt(input: SupervisorInput): string {
  const timingSection = input.timingReference
    ? `\nSPEECH TIMING:\n<timing>\n${input.timingReference}\n</timing>`
    : '';

  const profileChecks = input.montageProfile
    ? `\n\n${buildProfileSupervisorChecks(input.montageProfile)}`
    : '';

  const template = loadTemplate('supervisor');
  return renderTemplate(template, {
    script: input.script,
    duration: input.audioDuration.toFixed(1) + 's',
    style: input.style,
    timingSection,
    profileChecks,
  });
}

function buildReviewMessage(plan: ProductionPlan): string {
  return `Review this production plan:\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nReturn your review as JSON.`;
}

/**
 * Deterministic pre-check for text-emphasis duplication issues.
 * Runs BEFORE the LLM supervisor call to catch obvious problems cheaply.
 *
 * Rules:
 * - WARN if any text-emphasis text field contains more than 3 words
 * - REJECT if any text-emphasis text is a substring of a caption cue (shot scriptSegment)
 */
export interface TextEmphasisCheck {
  readonly passed: boolean;
  readonly issues: readonly string[];
}

export function checkTextEmphasisDuplication(plan: ProductionPlan): TextEmphasisCheck {
  const issues: string[] = [];

  const textEmphasisEffects = plan.effects.filter((e) => e.type === 'text-emphasis');
  if (textEmphasisEffects.length === 0) return { passed: true, issues: [] };

  // Collect all script segments (narration/caption text) from shots
  const scriptTexts = plan.shots
    .map((s) => s.scriptSegment?.toLowerCase().trim())
    .filter((t): t is string => !!t && t.length > 0);

  for (const effect of textEmphasisEffects) {
    const text = ((effect.config as Record<string, unknown>)?.text as string) ?? '';
    if (!text) continue;

    const wordCount = text.trim().split(/\s+/).length;

    // WARN: text-emphasis with more than 3 words is likely duplicating narration
    if (wordCount > 3) {
      issues.push(
        `text-emphasis "${text}" has ${wordCount} words (max 3). Use short keywords only, not narration text.`
      );
    }

    // REJECT: text-emphasis text is a substring of any caption/narration text
    const lowerText = text.toLowerCase().trim();
    if (lowerText.length >= 4) {
      for (const script of scriptTexts) {
        if (script.includes(lowerText)) {
          issues.push(
            `text-emphasis "${text}" duplicates narration text "${script.substring(0, 60)}...". Captions already show spoken words. Use text-emphasis for keywords/labels only.`
          );
          break;
        }
      }
    }
  }

  return { passed: issues.length === 0, issues };
}

interface ReviewResponse {
  verdict: 'approved' | 'needs-revision';
  score: number;
  notes: string;
}

async function callSupervisor(systemPrompt: string, userMessage: string): Promise<ReviewResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No API key — auto-approve
    return { verdict: 'approved', score: 8, notes: 'Auto-approved (no API key for supervisor)' };
  }

  const model = getModel('supervisor');
  log.info({ model }, 'Calling supervisor');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(60_000),
    redirect: 'error',
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown');
    log.warn(
      { status: res.status, errorPreview: errorText.substring(0, 200) },
      'Supervisor API error'
    );
    return {
      verdict: 'approved',
      score: 7,
      notes: `Supervisor API error (${res.status}) — auto-approved`,
    };
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((b) => b.type === 'text')?.text ?? '';

  try {
    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]) as ReviewResponse;
    return {
      verdict: parsed.score >= 7 ? 'approved' : 'needs-revision',
      score: parsed.score ?? 5,
      notes: parsed.notes ?? '',
    };
  } catch (e) {
    log.warn({ text: text.substring(0, 300) }, 'Failed to parse supervisor response');
    return {
      verdict: 'needs-revision',
      score: 5,
      notes: 'Supervisor response parse error - requesting revision for safety',
    };
  }
}

/**
 * Supervise a production plan. Reviews it and iterates with the director if needed.
 */
export async function supervisePlan(input: SupervisorInput): Promise<SupervisorResult> {
  const reviews: SupervisorReview[] = [];
  let currentPlan = input.plan;

  const systemPrompt = buildSupervisorPrompt(input);

  for (let iteration = 1; iteration <= MAX_REVISIONS + 1; iteration++) {
    // Deterministic pre-check: catch text-emphasis duplication before LLM call
    const textCheck = checkTextEmphasisDuplication(currentPlan);
    if (!textCheck.passed) {
      log.warn({ issues: textCheck.issues }, 'Text-emphasis duplication detected');
      // Auto-fix: remove offending text-emphasis effects
      const offendingTexts = new Set(
        textCheck.issues
          .map((issue) => {
            const match = issue.match(/^text-emphasis "([^"]+)"/);
            return match?.[1]?.toLowerCase();
          })
          .filter((t): t is string => !!t)
      );
      currentPlan = {
        ...currentPlan,
        effects: currentPlan.effects.filter((e) => {
          if (e.type !== 'text-emphasis') return true;
          const text = ((e.config as Record<string, unknown>)?.text as string) ?? '';
          return !offendingTexts.has(text.toLowerCase());
        }),
      };
      log.info({ removedCount: offendingTexts.size }, 'Removed duplicate text-emphasis effects');
    }

    log.info({ iteration }, 'Supervisor reviewing plan');
    const review = await callSupervisor(systemPrompt, buildReviewMessage(currentPlan));

    reviews.push({
      iteration,
      verdict: review.verdict,
      score: review.score,
      notes: review.notes,
    });

    log.info(
      {
        iteration,
        verdict: review.verdict,
        score: review.score,
        notes: review.notes.substring(0, 200),
      },
      'Supervisor review'
    );

    if (review.verdict === 'approved' || iteration > MAX_REVISIONS) {
      return {
        plan: currentPlan,
        approved: review.verdict === 'approved',
        iterations: iteration,
        reviews,
      };
    }

    // Send back to director for revision
    log.info({ iteration }, 'Sending plan back to director for revision');
    const revisedPlan = await revisePlan({
      originalPlan: currentPlan,
      directorNotes: review.notes,
      script: input.script,
      durationEstimate: input.audioDuration,
      style: input.style,
      toolManifest: input.toolManifest,
    });

    currentPlan = revisedPlan;
  }

  // Shouldn't reach here but just in case
  return {
    plan: currentPlan,
    approved: false,
    iterations: MAX_REVISIONS + 1,
    reviews,
  };
}
