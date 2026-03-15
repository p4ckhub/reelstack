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
  return `You are a world-class video director reviewing a production plan for a short-form reel (TikTok/Instagram/YouTube Shorts).

Your standards are EXTREMELY HIGH. You've directed thousands of viral reels. You know exactly what makes content pop.

## THE SCRIPT
<script>
${input.script}
</script>

Duration: ${input.audioDuration.toFixed(1)}s
Style: ${input.style}
${input.timingReference ? `\nSPEECH TIMING:\n<timing>\n${input.timingReference}\n</timing>` : ''}

## REVIEW CRITERIA (check ALL of these)

### 1. PACING & RHYTHM (most important)
- First 1-2 seconds MUST hook the viewer. Is there a visual punch at 0-2s? (text-emphasis, counter, or striking B-roll)
- Shot length should match style: dynamic = 2-4s per shot, calm = 5-8s, cinematic = 3-6s
- Does the visual pace match the narration pace? Fast talking = fast cuts, pauses = slower moments
- Are transitions varied? All-crossfade is BORING. Mix slide-left, zoom-in, wipe, crossfade
- Is there visual variety? Alternating between different B-roll types (images, videos, text-cards) keeps attention

### 2. B-ROLL RELEVANCE (critical)
- Does each B-roll search query make sense for what's being said?
- Are queries concrete enough for Pexels? (1-2 word nouns, NOT metaphors or abstract phrases)
- Bad queries: "magic box glowing", "success achievement", "creative process" (Pexels returns garbage)
- Good queries: "laptop desk", "code screen", "person typing", "chart growth"
- Are image: prefixed queries used where appropriate? Images get Ken Burns animation and look professional
- NO query should contain more than 3 words

### 3. EFFECT & COUNTER & CTA OVERLAP (CRITICAL — check this CAREFULLY)
- **Check EVERY pair of timed elements** (effects, counters, ctaSegments, lowerThirds, subscribe-banners) for time overlap
- Two elements overlap if: elementA.startTime < elementB.endTime AND elementB.startTime < elementA.endTime
- **Even 0.1s overlap is UNACCEPTABLE** — elements render on top of each other and look broken
- Common LLM mistake: text-emphasis at [0.1s-1.5s] + counter at [0.5s-3.5s] = OVERLAP at 0.5s-1.5s
- Common LLM mistake: counter near end + CTA/subscribe-banner near end = OVERLAP
- If you find ANY overlap, verdict MUST be "needs-revision" with exact timestamps to fix
- Counters MUST be present for every number/stat/percentage mentioned in the script
- Text-emphasis should NOT repeat what captions already show (captions show every word)
- Effects should be spaced out — not clustered in one section and absent in another

### 4. ZOOM SEGMENTS
- Dynamic style MUST have 3-5 zoom segments per 30s
- Zooms should land on key moments (stats, reveals, name drops)
- Mix of zoom-in and normal creates visual rhythm

### 5. EMOTIONAL ARC
- Does the visual plan follow: HOOK → PROBLEM → SOLUTION → PAYOFF?
- Is there escalation? (effects/pacing should build toward the conclusion)
- Does the ending have a strong visual moment? (counter, CTA, or impactful B-roll)

### 6. TECHNICAL CORRECTNESS
- For faceless reels (primarySource: "none"): B-roll must cover 100% of duration, NO gaps
- First shot must start at 0s (or within 0.3s)
- Last shot must end at or after audio duration
- Effect times must align with speech timing (if timing data provided)

### 7. VIRALITY SCORING (rate each 0-25, total 0-100)
1. Hook Strength (0-25): 20+ = surprising fact, bold claim, intriguing question
2. Engagement (0-25): 20+ = entertaining, emotional, dramatic pacing
3. Value (0-25): 20+ = actionable insights, unique knowledge
4. Shareability (0-25): 20+ = "I need to send this to someone" content

Score < 50 = REJECT with specific improvement suggestions
Score 50-70 = WARN with notes
Score 70+ = APPROVE

## YOUR OUTPUT

Return a JSON object (no markdown, just raw JSON):
{
  "verdict": "approved" | "needs-revision",
  "score": <1-10>,
  "viralityScore": { "hook": <0-25>, "engagement": <0-25>, "value": <0-25>, "shareability": <0-25>, "total": <0-100> },
  "notes": "<If needs-revision: specific, actionable notes for the director to fix. Be PRECISE about timestamps, shot IDs, and what to change. Include virality improvement suggestions. If approved: brief praise of what works well.>"
}

Score guide:
- 9-10: Viral-worthy. Strong hook, perfect pacing, relevant visuals, well-placed effects. Virality 70+
- 7-8: Good but minor issues. Missing zoom, one weak B-roll query, could use one more effect. Virality 50-70
- 5-6: Mediocre. Several B-roll queries are vague, effects are clustered, pacing is off. Virality < 50
- 3-4: Poor. Wrong B-roll, missing hook, effects overlap, gaps in coverage
- 1-2: Unusable. Fundamentally broken plan

Score 7+ = approved. Score 6 or below = needs-revision.${input.montageProfile ? `\n\n${buildProfileSupervisorChecks(input.montageProfile)}` : ''}`;
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

  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text ?? '';

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
    return { verdict: 'approved', score: 7, notes: 'Parse error — auto-approved' };
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
