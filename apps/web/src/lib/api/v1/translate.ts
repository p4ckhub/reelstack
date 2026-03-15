import { createLogger } from '@reelstack/logger';

const log = createLogger('translate');

const LANGUAGE_NAMES: Record<string, string> = {
  pl: 'Polish', en: 'English', es: 'Spanish', de: 'German', fr: 'French',
  it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', uk: 'Ukrainian',
  cs: 'Czech', sk: 'Slovak', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', hi: 'Hindi', sv: 'Swedish', da: 'Danish', no: 'Norwegian',
  fi: 'Finnish', hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian',
  hr: 'Croatian', sr: 'Serbian', sl: 'Slovenian', tr: 'Turkish',
  vi: 'Vietnamese', th: 'Thai',
};

/**
 * Translate text using Claude or OpenAI.
 * Requires ANTHROPIC_API_KEY or OPENAI_API_KEY.
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const srcName = LANGUAGE_NAMES[sourceLang] ?? sourceLang;
  const tgtName = LANGUAGE_NAMES[targetLang] ?? targetLang;

  const systemPrompt = `You are a professional translator. Translate text from ${srcName} to ${tgtName}. Output ONLY the translated text. No explanations, notes, or commentary. Preserve the original formatting and tone.`;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let result: string;
  if (anthropicKey) {
    result = await translateViaAnthropic(systemPrompt, text, anthropicKey);
  } else if (openaiKey) {
    result = await translateViaOpenAI(systemPrompt, text, openaiKey);
  } else {
    throw new Error('Translation service unavailable');
  }

  // Strip any HTML/script tags from LLM output (defense-in-depth against stored XSS)
  result = result.replace(/<[^>]*>/g, '');

  // Validate response: must be non-empty and within script size limits
  if (!result || result.length > 15000) {
    throw new Error('Translation response invalid or too long');
  }

  return result;
}

async function translateViaAnthropic(systemPrompt: string, text: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const err = await response.text();
    log.error({ status: response.status, err }, 'Anthropic translation failed');
    throw new Error(`Translation API error (${response.status})`);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  const translated = data.content.find((b) => b.type === 'text')?.text;
  if (!translated) throw new Error('Empty translation response');
  return translated.trim();
}

async function translateViaOpenAI(systemPrompt: string, text: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const err = await response.text();
    log.error({ status: response.status, err }, 'OpenAI translation failed');
    throw new Error(`Translation API error (${response.status})`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const translated = data.choices[0]?.message?.content;
  if (!translated) throw new Error('Empty translation response');
  return translated.trim();
}
