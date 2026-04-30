/**
 * Script linter — deterministic rule-based check for common script defects.
 *
 * No LLM call. Used to gate before expensive board/TTS work so we either
 * approve a clean script or hand the issues to an LLM for a targeted fix
 * pass. Cheap to run on every script.
 *
 * Two checks today:
 *   1. hook ↔ section[0] duplication (back-to-back paraphrase of the same idea).
 *   2. Polish English-calque patterns ("Obserwuj po więcej", "tipów dla devów",
 *      "robi sens", "weź sobie czas") — see `feedback_no_english_calques.md`.
 *
 * Designed to be reusable across module-specific reviewers (presenter,
 * slideshow, n8n-explainer, ai-tips). Each module wraps this with its own
 * structured-script reviewer that knows how to feed the issues back into
 * an LLM correction prompt.
 */

export interface LintIssue {
  /** Rule id, stable string for filtering / metrics */
  rule: 'duplicate-intro' | 'pl-calque';
  /** Human-readable explanation in English (used in LLM correction prompts) */
  message: string;
  /** Where in the script the issue lives, for targeted correction */
  field: 'hook' | 'cta' | `section[${number}]`;
  /** The offending substring */
  match: string;
}

export interface LintReport {
  passed: boolean;
  issues: LintIssue[];
}

export interface LintInput {
  hook?: string;
  cta?: string;
  /** Section texts in order. Most-impactful for duplicate-intro check. */
  sections: string[];
  /** ISO language code (e.g. "pl", "en"). PL-specific rules only fire on "pl". */
  language?: string;
}

/**
 * Lint a structured script. Returns issues sorted by field.
 * Does not modify input.
 */
export function lintScript(input: LintInput): LintReport {
  const issues: LintIssue[] = [];

  if (input.hook && input.sections[0]) {
    const dupe = detectDuplicateIntro(input.hook, input.sections[0]);
    if (dupe) {
      issues.push({
        rule: 'duplicate-intro',
        message: `section[0] paraphrases the hook (${dupe.reason}). The viewer hears the same idea twice in a row. Rewrite section[0] to drive straight into the first concrete beat without restating the hook.`,
        field: 'section[0]',
        match: input.sections[0],
      });
    }
  }

  if ((input.language ?? 'en').startsWith('pl')) {
    for (const c of detectPolishCalques(input)) issues.push(c);
  }

  return { passed: issues.length === 0, issues };
}

// ── Rules ───────────────────────────────────────────────────────

interface DuplicateIntroResult {
  reason: string;
}

/**
 * Heuristic: `section[0]` is a duplicate of `hook` if it shares the same
 * first content word stem AND a high token overlap. Tuned to catch real
 * cases like:
 *   hook    = "Trzy triki Pythona, które musisz znać"
 *   section = "Trzy triki w Pythonie, które zaoszczędzą ci czas."
 * (Token overlap: trzy/triki/które = 3 of 5 content tokens — same idea.)
 */
function detectDuplicateIntro(hook: string, sectionText: string): DuplicateIntroResult | null {
  const hookTokens = contentTokens(hook);
  const sectionTokens = contentTokens(sectionText);
  if (hookTokens.length === 0 || sectionTokens.length === 0) return null;

  // Same first stem? (e.g. "trzy" === "trzy", "five" === "five")
  const sameFirstStem = stem(hookTokens[0]) === stem(sectionTokens[0]);

  // Token overlap on stems
  const hookSet = new Set(hookTokens.map(stem));
  let overlap = 0;
  for (const t of sectionTokens) if (hookSet.has(stem(t))) overlap++;
  const overlapRatio = overlap / Math.min(hookTokens.length, sectionTokens.length);

  if (sameFirstStem && overlapRatio >= 0.4) {
    return {
      reason: `${overlap} of ${Math.min(hookTokens.length, sectionTokens.length)} content words overlap, both start with "${hookTokens[0]}"`,
    };
  }
  // Strong overlap alone (>= 0.6) without same first stem is also dupe.
  if (overlapRatio >= 0.6) {
    return { reason: `${Math.round(overlapRatio * 100)}% content-word overlap` };
  }
  return null;
}

/** Strip punctuation, lowercase, drop short stopwords. */
function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:—–"„"'()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !PL_STOPWORDS.has(t) && !EN_STOPWORDS.has(t));
}

/** Crude PL/EN stem — strip common suffixes. Good enough for duplicate detection. */
function stem(token: string): string {
  return token
    .replace(/(?:ami|ach|ów|om|ie|em|esz|asz|ach|ami|owie|ego|emu|ymi|imi|nia|cie|ami)$/u, '')
    .replace(/(?:ies|ing|ed|ly|s)$/u, '');
}

const PL_STOPWORDS = new Set([
  'które',
  'którzy',
  'którego',
  'którym',
  'jest',
  'być',
  'tego',
  'tym',
  'tych',
  'tej',
  'oraz',
  'lub',
  'albo',
  'więc',
  'bo',
  'czy',
  'tylko',
  'jeszcze',
  'również',
  'także',
  'jako',
  'aby',
  'przed',
  'pod',
  'nad',
  'przy',
  'przez',
  'jak',
  'ich',
  'jego',
  'jej',
  'nas',
  'was',
  'oni',
  'one',
  'sobie',
  'siebie',
  'cię',
  'mnie',
  'mam',
  'masz',
  'mamy',
  'macie',
  'mają',
]);

const EN_STOPWORDS = new Set([
  'the',
  'and',
  'but',
  'with',
  'for',
  'from',
  'into',
  'this',
  'that',
  'will',
  'are',
  'were',
  'have',
  'has',
  'had',
  'you',
  'your',
  'them',
  'these',
  'those',
]);

// ── PL calque detection ─────────────────────────────────────────

interface CalquePattern {
  /** Compiled regex against lowercased text */
  pattern: RegExp;
  /** Display reason in LintIssue.message */
  hint: string;
}

const PL_CALQUE_PATTERNS: CalquePattern[] = [
  {
    pattern: /\bobserwuj\s+po\b/u,
    hint: '"Obserwuj po (więcej...)" is a literal calque of "Follow for more". Natural Polish: "Wpadnij na profil", "Więcej w bio", "Subskrybuj — będzie więcej."',
  },
  {
    pattern: /\btip[óy]w?\b/u,
    hint: '"tipy / tipów / tipy" is borrowed English. Use "wskazówki" / "wskazówek" or "porady" / "porad".',
  },
  {
    pattern: /\bdev[óy]w?\b/u,
    hint: '"dev / devów" is borrowed English. Use "deweloperów" or "programistów".',
  },
  {
    pattern: /\brobi\s+sens\b/u,
    hint: '"robi sens" is a literal calque of "makes sense". Natural Polish: "ma sens".',
  },
  {
    pattern: /\bweź\s+sobie\s+czas\b/u,
    hint: '"weź sobie czas" is a calque of "take your time". Natural Polish: "nie spiesz się" or "spokojnie".',
  },
  {
    pattern: /\btake\s+aways?\b/u,
    hint: '"take away" / "take aways" is English. Use "wnioski" or "co warto zapamiętać".',
  },
];

function detectPolishCalques(input: LintInput): LintIssue[] {
  const issues: LintIssue[] = [];
  const fields: Array<{ field: LintIssue['field']; text: string }> = [];
  if (input.hook) fields.push({ field: 'hook', text: input.hook });
  input.sections.forEach((s, i) => fields.push({ field: `section[${i}]`, text: s }));
  if (input.cta) fields.push({ field: 'cta', text: input.cta });

  for (const { field, text } of fields) {
    const lower = text.toLowerCase();
    for (const { pattern, hint } of PL_CALQUE_PATTERNS) {
      const m = lower.match(pattern);
      if (m) {
        issues.push({
          rule: 'pl-calque',
          message: hint,
          field,
          match: m[0],
        });
      }
    }
  }
  return issues;
}
