/**
 * Script Reviewer - fact-checks and validates scripts before production planning.
 *
 * Catches factual errors, logical inconsistencies, and misleading categorizations
 * (e.g. "5 AI tools" but listing n8n which is an automation tool, not AI).
 *
 * Uses a fast/cheap model (Haiku or GPT-5-mini) to keep costs low.
 * Enabled by default, disable with SCRIPT_REVIEW=false.
 */
import { createLogger } from '@reelstack/logger';
import { callLLMWithSystem, detectCheapProvider } from '../llm';
import { loadTemplate } from '../prompts/loader';

const log = createLogger('script-reviewer');

export interface ScriptReview {
  approved: boolean;
  issues: string[];
  suggestions: string[];
  correctedScript?: string;
}

const REVIEWER_SYSTEM_PROMPT = loadTemplate('script-reviewer');

/**
 * Check if script review is enabled.
 * Default: true. Set SCRIPT_REVIEW=false to disable.
 */
export function isScriptReviewEnabled(): boolean {
  const val = process.env.SCRIPT_REVIEW;
  if (val === undefined || val === '') return true;
  return val.toLowerCase() !== 'false' && val !== '0';
}

/**
 * Review a script for factual and logical errors before planning.
 * Uses the scriptReviewer model role (see config/models.ts for defaults).
 */
export async function reviewScript(script: string): Promise<ScriptReview> {
  const provider = detectCheapProvider();
  if (!provider) {
    log.info('No OPENROUTER_API_KEY or ANTHROPIC_API_KEY, skipping script review');
    return { approved: true, issues: [], suggestions: [] };
  }

  log.info({ provider }, 'Reviewing script for factual/logical errors');

  let text: string;
  try {
    text = await callLLMWithSystem(
      provider,
      REVIEWER_SYSTEM_PROMPT,
      `Review this script:\n\n<script>\n${script}\n</script>`,
      { modelRole: 'scriptReviewer', maxTokens: 4096, timeoutMs: 30_000, jsonMode: false }
    );
  } catch (err) {
    log.warn({ error: String(err) }, 'Script review API error, skipping review');
    return { approved: true, issues: [], suggestions: [] };
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      approved?: boolean;
      issues?: unknown[];
      suggestions?: unknown[];
      correctedScript?: string | null;
    };

    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((i): i is string => typeof i === 'string').slice(0, 20)
      : [];

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 20)
      : [];

    const correctedScript =
      typeof parsed.correctedScript === 'string' && parsed.correctedScript.length > 0
        ? parsed.correctedScript
        : undefined;

    const approved = parsed.approved === true && issues.length === 0;

    return { approved, issues, suggestions, correctedScript };
  } catch (e) {
    log.warn({ text: text.substring(0, 300) }, 'Failed to parse script review response');
    return { approved: true, issues: [], suggestions: [] };
  }
}
