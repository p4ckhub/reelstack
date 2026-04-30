/**
 * Structured-script reviewer — generic helper for module pipelines.
 *
 * Pattern: each module has its own script JSON shape (PresenterScript,
 * SlideshowScript, N8nExplainerScript, etc.). They all share the same
 * defect-detection needs:
 *   1. lint flat text fields (hook / sections / cta) for duplication +
 *      Polish calques via the shared `lintScript()` rules
 *   2. when issues are found, ask an LLM to fix ONLY those fields while
 *      preserving non-text structure (boardImageSpec, emotion, layout
 *      hints, etc.)
 *
 * This helper isolates that pattern so each module-specific reviewer
 * collapses to ~10 lines (extractor + patcher) instead of 80.
 */
import type { LintInput, LintReport } from './script-linter';
import { lintScript } from './script-linter';

/** Lift the first JSON object/array out of a possibly-fenced LLM response. */
function parseFirstJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*\n?|\n?```$/g, '');
  // Try direct parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to slice */
  }
  const start = trimmed.search(/[{[]/);
  if (start < 0) throw new Error('No JSON in response');
  // Walk to matching close bracket counting nesting.
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === open) depth++;
    else if (trimmed[i] === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1));
      }
    }
  }
  throw new Error('Unterminated JSON in response');
}

export interface StructuredScriptReview<T> {
  /** Reviewed (possibly LLM-corrected) script. */
  script: T;
  /** Lint report from the original (pre-correction) script. */
  report: LintReport;
  /** True when the LLM produced a correction that we successfully merged. */
  corrected: boolean;
}

export interface ReviewStructuredScriptOptions<T> {
  script: T;
  /** Pull flat text fields out of the structured script for lint. */
  textExtractor: (script: T) => LintInput;
  /**
   * Apply LLM-returned corrections back to the original script. The
   * implementation MUST defensively preserve any non-text fields
   * (assets, layout flags, etc.) — never blindly trust the LLM to
   * return them unchanged.
   */
  textPatcher: (original: T, llmReturnedJson: Record<string, unknown>) => T;
  /**
   * Build the LLM correction prompt. Receives the lint issues + the
   * original script. Should instruct the LLM to return the same JSON
   * shape with only flagged fields modified.
   */
  buildCorrectionPrompt: (script: T, issues: LintReport['issues']) => string;
  llmCall: (prompt: string) => Promise<string>;
  language?: string;
}

export async function reviewStructuredScript<T>(
  opts: ReviewStructuredScriptOptions<T>
): Promise<StructuredScriptReview<T>> {
  const lintInput = opts.textExtractor(opts.script);
  const report = lintScript({ ...lintInput, language: opts.language ?? lintInput.language });

  if (report.passed) {
    return { script: opts.script, report, corrected: false };
  }

  const prompt = opts.buildCorrectionPrompt(opts.script, report.issues);
  const raw = await opts.llmCall(prompt);
  let parsed: unknown;
  try {
    parsed = parseFirstJson(raw);
  } catch {
    // LLM returned junk; surface original script + report so the caller
    // can decide. We never silently ship a broken script — if LLM fix
    // fails the next pipeline step inherits the unfixed report and the
    // caller (or downstream lint) can fail loudly.
    return { script: opts.script, report, corrected: false };
  }

  const corrected = opts.textPatcher(opts.script, parsed as Record<string, unknown>);
  return { script: corrected, report, corrected: true };
}

/**
 * Helper: build a generic correction prompt body. Each module can use
 * this verbatim or tweak — it bakes in the "preserve non-text fields"
 * rule that's common to every module.
 */
export function buildGenericCorrectionPrompt(args: {
  scriptJson: unknown;
  issues: LintReport['issues'];
  /** What fields the LLM is allowed to modify (e.g. ['hook', 'cta', 'sections[].text']) */
  editableFields: string[];
  /** What fields MUST stay byte-equal (e.g. ['sections[].boardImageSpec', 'sections[].emotion']) */
  preserveFields: string[];
}): string {
  const issuesList = args.issues
    .map((i, n) => `${n + 1}. [${i.field}] ${i.message}\n   Offending: "${i.match}"`)
    .join('\n');
  return `You are correcting a video script that was flagged by an automated linter.

Return the SAME JSON shape with ONLY the following fields modified:
${args.editableFields.map((f) => `  - ${f}`).join('\n')}

These fields MUST stay byte-for-byte unchanged:
${args.preserveFields.map((f) => `  - ${f}`).join('\n')}

Original script:
${JSON.stringify(args.scriptJson, null, 2)}

Issues to fix:
${issuesList}

Rules:
- Fix ONLY the listed issues. Do not rephrase anything else.
- Keep the same number of sections / slides / tips.
- Keep approximate length per text field.
- Output ONLY the JSON, no markdown, no commentary.`;
}
