/**
 * Script Writer — doctors the user's script BEFORE planning. Catches
 * filler openers, missing hooks, absent stakes, weak CTAs. Rewrites
 * conservatively (≤30% edit, preserves voice + facts).
 *
 * This is a pre-planner step: the rewritten script is what the director
 * works from. If disabled or unavailable, the original script flows
 * through unchanged.
 *
 * Enabled by default, disable with SCRIPT_WRITER=false.
 */
import { createLogger } from '@reelstack/logger';
import { callLLMWithSystem, detectCheapProvider } from '../llm';
import { loadTemplate } from '../prompts/loader';
import { renderTemplate } from '../prompts/renderer';

const log = createLogger('script-writer');

export interface ScriptRewriteAssessment {
  readonly hook: 'pass' | 'weak' | 'missing';
  readonly stakes: 'pass' | 'weak' | 'missing';
  readonly arc: 'pass' | 'weak' | 'missing';
  readonly cta: 'pass' | 'weak' | 'missing';
  readonly issues: readonly string[];
}

export interface ScriptRewriteResult {
  /** The script to use for planning — either rewritten or passthrough. */
  readonly script: string;
  /** True if the content was actually changed. */
  readonly rewritten: boolean;
  /** One-sentence-per-change explanation of what was changed and why. */
  readonly changeNotes: string;
  /** Structured assessment of the original script. */
  readonly assessment: ScriptRewriteAssessment;
}

const WRITER_SYSTEM_PROMPT_TEMPLATE = loadTemplate('script-writer');

/** Default: enabled. Disable with SCRIPT_WRITER=false. */
export function isScriptWriterEnabled(): boolean {
  const val = process.env.SCRIPT_WRITER;
  if (val === undefined || val === '') return true;
  return val.toLowerCase() !== 'false' && val !== '0';
}

const PASS_THROUGH_ASSESSMENT: ScriptRewriteAssessment = {
  hook: 'pass',
  stakes: 'pass',
  arc: 'pass',
  cta: 'pass',
  issues: [],
};

function passThrough(script: string): ScriptRewriteResult {
  return {
    script,
    rewritten: false,
    changeNotes: '',
    assessment: PASS_THROUGH_ASSESSMENT,
  };
}

export async function rewriteScript(
  script: string,
  options: { readonly durationSeconds?: number; readonly style?: string } = {}
): Promise<ScriptRewriteResult> {
  const provider = detectCheapProvider();
  if (!provider) {
    log.info('No LLM provider available, passing script through unchanged');
    return passThrough(script);
  }

  const systemPrompt = renderTemplate(
    WRITER_SYSTEM_PROMPT_TEMPLATE,
    {
      script,
      duration: options.durationSeconds ? String(options.durationSeconds) : 'unknown',
      style: options.style ?? 'unspecified',
    },
    {}
  );

  log.info(
    { provider, scriptLength: script.length, duration: options.durationSeconds },
    'Running script doctor'
  );

  let text: string;
  try {
    text = await callLLMWithSystem(
      provider,
      systemPrompt,
      `Doctor this script per the rules above and return the JSON.`,
      { modelRole: 'scriptReviewer', maxTokens: 4096, timeoutMs: 45_000, jsonMode: false }
    );
  } catch (err) {
    log.warn({ error: String(err) }, 'Script writer API error, passing through');
    return passThrough(script);
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      assessment?: Partial<ScriptRewriteAssessment>;
      rewritten?: boolean;
      script?: string;
      changeNotes?: string;
    };

    const assessment: ScriptRewriteAssessment = {
      hook: normalizeVerdict(parsed.assessment?.hook),
      stakes: normalizeVerdict(parsed.assessment?.stakes),
      arc: normalizeVerdict(parsed.assessment?.arc),
      cta: normalizeVerdict(parsed.assessment?.cta),
      issues: Array.isArray(parsed.assessment?.issues)
        ? parsed.assessment.issues.filter((i): i is string => typeof i === 'string').slice(0, 10)
        : [],
    };

    const rewritten = parsed.rewritten === true;
    const returnedScript =
      typeof parsed.script === 'string' && parsed.script.trim().length > 0
        ? parsed.script.trim()
        : script;

    // Guard against hallucinated extensions: if LLM claims "not rewritten"
    // but returned a different script, trust the rewritten flag and keep
    // the original so we don't secretly mutate the user's voice.
    const finalScript = rewritten ? returnedScript : script;
    const changeNotes =
      rewritten && typeof parsed.changeNotes === 'string' ? parsed.changeNotes : '';

    if (rewritten) {
      log.info(
        {
          originalLength: script.length,
          rewrittenLength: finalScript.length,
          deltaPct: Math.round(((finalScript.length - script.length) / script.length) * 100),
          issues: assessment.issues,
        },
        'Script rewritten by doctor'
      );
    } else {
      log.info({ assessment }, 'Script approved as-is by doctor');
    }

    return {
      script: finalScript,
      rewritten,
      changeNotes,
      assessment,
    };
  } catch (e) {
    log.warn(
      { text: text.substring(0, 300), err: String(e) },
      'Failed to parse script writer response, passing through'
    );
    return passThrough(script);
  }
}

function normalizeVerdict(v: unknown): 'pass' | 'weak' | 'missing' {
  if (v === 'pass' || v === 'weak' || v === 'missing') return v;
  return 'pass';
}
