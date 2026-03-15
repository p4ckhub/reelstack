/**
 * Slideshow script generator.
 *
 * When an LLM is available, generates slides from a topic.
 * When slides are provided manually, wraps them into a SlideshowScript.
 */

import type { Slide, SlideshowScript } from './types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('slideshow-script');

interface GenerateOptions {
  topic: string;
  numberOfSlides?: number;
  language?: string;
  llmCall: (prompt: string) => Promise<string>;
}

export async function generateSlideshowScript(opts: GenerateOptions): Promise<SlideshowScript> {
  const { topic, numberOfSlides = 5, language = 'en', llmCall } = opts;
  const slideCount = Math.min(Math.max(numberOfSlides, 2), 10);

  const prompt = `You are a content creator generating a short educational slideshow about: "${topic}"

Generate exactly ${slideCount} slides for a vertical (9:16) social media reel.
Each slide should be a concise tip, fact, or point about the topic.
Also write a short voiceover narration that covers all slides.

Language: ${language === 'pl' ? 'Polish' : language === 'en' ? 'English' : language}

Return valid JSON only (no markdown, no code fences):
{
  "hook": "Opening sentence for the voiceover (1 sentence, engaging hook)",
  "slides": [
    {
      "title": "Short title (max 6 words)",
      "text": "Brief explanation (1-2 sentences)",
      "badge": "Tip 1"
    }
  ],
  "cta": "Closing call-to-action sentence for the voiceover",
  "fullNarration": "Complete voiceover text covering hook + all slides + cta as flowing speech"
}`;

  const raw = await llmCall(prompt);
  const cleaned = raw
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  let parsed: { hook: string; slides: Slide[]; cta: string; fullNarration: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    log.error({ raw: raw.slice(0, 500) }, 'Failed to parse LLM response');
    throw new Error('LLM returned invalid JSON for slideshow script');
  }

  if (!parsed.slides || parsed.slides.length === 0) {
    throw new Error('LLM returned empty slides array');
  }

  // Add badge numbers if missing
  parsed.slides = parsed.slides.map((s, i) => ({
    ...s,
    badge: s.badge || `${i + 1}`,
    num: `${i + 1}`,
  }));

  return {
    topic,
    hook: parsed.hook,
    slides: parsed.slides,
    cta: parsed.cta,
    fullNarration: parsed.fullNarration,
  };
}

/**
 * Wrap manually provided slides into a SlideshowScript.
 * Creates minimal narration from slide titles.
 */
export function wrapManualSlides(topic: string, slides: Slide[]): SlideshowScript {
  const numbered = slides.map((s, i) => ({
    ...s,
    badge: s.badge || `${i + 1}`,
    num: `${i + 1}`,
  }));

  const narration = numbered.map((s) => s.text || s.title).join('. ');

  return {
    topic,
    hook: topic,
    slides: numbered,
    cta: '',
    fullNarration: narration,
  };
}
