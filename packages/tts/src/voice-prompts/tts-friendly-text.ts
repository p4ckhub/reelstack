/**
 * TTS-friendly text transforms for Gemini 3.1 Flash TTS narration scripts.
 *
 * Two well-known failure modes when narration text is fed raw to TTS:
 *
 * 1. Acronyms (API, URL, JSON, n8n, SDK, CSS) get pronounced English-style
 *    even in Polish narration ("ej-pi-aj" instead of "a-pi"). Fix:
 *    `phoneticizeAcronyms(text, lang)` rewrites the well-known offenders.
 *
 * 2. Numbers (327, 1500, 2026) get pronounced English-style. Fix:
 *    `spellOutNumbers(text, lang)` converts cardinals > 50 to words.
 *
 * These are best-effort guards. The LLM script generator should already
 * follow the `gemini-tts.md` guideline; these helpers are a second-line
 * defense for scripts that slipped through (or were user-supplied).
 *
 * Polish-only for now. English passes through unchanged because the model
 * already pronounces those acronyms / numbers correctly.
 */

/** Well-known acronyms that misfire in Polish narration. */
const PL_ACRONYM_PHONETIC: Record<string, string> = {
  API: 'a-pi',
  URL: 'u-er-el',
  JSON: 'dżejson',
  SDK: 'es-de-ka',
  CSS: 'ce-es-es',
  HTML: 'ha-te-em-el',
  HTTP: 'ha-te-te-pe',
  HTTPS: 'ha-te-te-pe-es',
  REST: 'rest',
  GUI: 'gu-i',
  CLI: 'ce-el-i',
  IDE: 'i-de-e',
  AI: 'a-i',
  ML: 'em-el',
  LLM: 'el-el-em',
  GPU: 'gie-pe-u',
  CPU: 'ce-pe-u',
  RAM: 'ram',
  SQL: 'es-ku-el',
  AWS: 'a-wu-es',
  GCP: 'gie-ce-pe',
  S3: 's-trzy',
  EC2: 'i-ce-dwa',
  // n8n is special — pronounce as letters + numeral, not "ejt"
  n8n: 'en-osiem-en',
};

/**
 * Replace well-known tech acronyms with phonetic Polish spellings.
 * Match is case-sensitive and word-bounded so "API" isn't replaced inside
 * "ApiKey" or "rapid".
 *
 * No-op for non-Polish languages — caller is expected to pass `'pl'` or
 * `'pl-PL'` to opt in.
 */
export function phoneticizeAcronyms(text: string, language: string): string {
  if (!isPolish(language)) return text;

  let result = text;
  for (const [acronym, phonetic] of Object.entries(PL_ACRONYM_PHONETIC)) {
    // Word boundary on both sides — avoids replacing inside camelCase / mixed words.
    const pattern = new RegExp(`\\b${escapeRegex(acronym)}\\b`, 'g');
    result = result.replace(pattern, phonetic);
  }
  return result;
}

/**
 * Convert standalone integers > 50 to Polish words. Integers ≤ 50 typically
 * pronounce correctly even when the model treats them numerically.
 *
 * Floats, negatives, and numbers attached to units ("3GB", "5MB") are left
 * alone — those need their own treatment and false-positives are worse than
 * misses for prototype quality.
 *
 * No-op for non-Polish.
 */
export function spellOutNumbers(text: string, language: string): string {
  if (!isPolish(language)) return text;

  return text.replace(/\b(\d+)\b/g, (match, digits: string) => {
    const n = parseInt(digits, 10);
    if (Number.isNaN(n) || n <= 50) return match;
    if (n > 99_999) return match; // very large numbers: leave as-is, edge case
    return polishCardinal(n);
  });
}

/**
 * Apply both guards. Cheap to run on every TTS call. Order matters —
 * acronym replacement first (fewer false-positives) then numbers.
 */
export function makeTTSFriendly(text: string, language: string): string {
  return spellOutNumbers(phoneticizeAcronyms(text, language), language);
}

/**
 * Strip Gemini-style audio tags from text. For non-Gemini TTS providers
 * (edge-tts, OpenAI TTS, ElevenLabs) the model reads `[excitedly]` literally
 * as "excitedly" — useless and breaks the flow.
 *
 * Pacing tags collapse into punctuation that all TTS engines respect:
 *   `[short pause]`  → `, `
 *   `[medium pause]` → `. `
 *   `[long pause]`   → `... `
 * Everything else inside square brackets is dropped wholesale.
 *
 * Provider-agnostic: callers route based on TTS provider (preserve tags
 * only when sending to Gemini, strip otherwise).
 */
export function stripAudioTags(text: string): string {
  return text
    .replace(/\[\s*short\s+pause\s*\]/gi, ', ')
    .replace(/\[\s*medium\s+pause\s*\]/gi, '. ')
    .replace(/\[\s*long\s+pause\s*\]/gi, '... ')
    .replace(/\[[^\]\n]{1,40}\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Drop emotional / mood tags ("[excitedly]", "[curious]", "[serious]" …)
 * while preserving timing tags ("[short pause]", "[medium pause]",
 * "[long pause]"). Use for tutorial / explainer narrations where the
 * voicePrompt already carries the right tone — extra mood directives
 * push voices like Sulafat or Aoede into a poetic, slow delivery that
 * doesn't fit technical content.
 *
 * Keep this server-side and provider-agnostic: it touches only the
 * speech text, not the displayScript used for captions.
 */
const DRAMATIC_TAGS = [
  'excitedly',
  'excited',
  'dramatic',
  'dramatically',
  'curious',
  'curiously',
  'serious',
  'seriously',
  'whispers',
  'whispering',
  'whisper',
  'somber',
  'surprised',
  'anxious',
  'sad',
  'sadly',
  'happy',
  'happily',
  'angry',
  'angrily',
  'sarcastic',
  'sarcastically',
  'flirty',
  'flirtatiously',
  'sighs',
  'gasps',
  'laughs',
  'laughing',
  'chuckles',
  'sighing',
];
const DRAMATIC_TAG_REGEX = new RegExp(`\\[\\s*(?:${DRAMATIC_TAGS.join('|')})\\s*\\]`, 'gi');

export function stripDramaticAudioTags(text: string): string {
  return text
    .replace(DRAMATIC_TAG_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── internals ─────────────────────────────────────────────────

function isPolish(language: string): boolean {
  return language.toLowerCase().startsWith('pl');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ONES = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const TEENS = [
  'dziesięć',
  'jedenaście',
  'dwanaście',
  'trzynaście',
  'czternaście',
  'piętnaście',
  'szesnaście',
  'siedemnaście',
  'osiemnaście',
  'dziewiętnaście',
];
const TENS = [
  '',
  '',
  'dwadzieścia',
  'trzydzieści',
  'czterdzieści',
  'pięćdziesiąt',
  'sześćdziesiąt',
  'siedemdziesiąt',
  'osiemdziesiąt',
  'dziewięćdziesiąt',
];
const HUNDREDS = [
  '',
  'sto',
  'dwieście',
  'trzysta',
  'czterysta',
  'pięćset',
  'sześćset',
  'siedemset',
  'osiemset',
  'dziewięćset',
];

/** Convert 1..99_999 to Polish cardinal words. */
function polishCardinal(n: number): string {
  if (n < 10) return ONES[n] ?? '';
  if (n < 20) return TEENS[n - 10] ?? '';
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS[tens]! : `${TENS[tens]} ${ONES[ones]}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return rest === 0 ? HUNDREDS[hundreds]! : `${HUNDREDS[hundreds]} ${polishCardinal(rest)}`;
  }
  if (n < 100_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const thousandWord = thousandsWord(thousands);
    if (rest === 0) return thousandWord;
    return `${thousandWord} ${polishCardinal(rest)}`;
  }
  return String(n);
}

/** Polish thousand declension: 1 tysiąc, 2-4 tysiące, 5+ tysięcy. */
function thousandsWord(n: number): string {
  if (n === 1) return 'tysiąc';
  const lastTwo = n % 100;
  const last = n % 10;
  // 12-14 always "tysięcy"
  if (lastTwo >= 12 && lastTwo <= 14) return `${polishCardinal(n)} tysięcy`;
  if (last >= 2 && last <= 4) return `${polishCardinal(n)} tysiące`;
  return `${polishCardinal(n)} tysięcy`;
}
