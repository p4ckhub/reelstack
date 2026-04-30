/**
 * Slideshow script reviewer — wraps `reviewStructuredScript` with
 * SlideshowScript shape. Lints each slide's narration text + the
 * top-level hook/cta when present.
 */
import { reviewStructuredScript, buildGenericCorrectionPrompt } from '@reelstack/agent';
import type { StructuredScriptReview, LintInput, LintReport } from '@reelstack/agent';
import type { Slide, SlideshowScript } from './types';

export type SlideshowReviewResult = StructuredScriptReview<SlideshowScript>;

export function reviewSlideshowScript(
  script: SlideshowScript,
  opts: { llmCall: (prompt: string) => Promise<string>; language?: string }
): Promise<SlideshowReviewResult> {
  return reviewStructuredScript<SlideshowScript>({
    script,
    language: opts.language,
    llmCall: opts.llmCall,
    textExtractor: (s) =>
      ({
        hook: s.hook,
        cta: s.cta,
        sections: s.slides.map((slide) => slide.text || slide.title),
      }) satisfies LintInput,
    textPatcher: (original, parsed) => {
      const correctedSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
      const slides: Slide[] = original.slides.map((origSlide, i) => {
        const item = correctedSlides[i] as Record<string, unknown> | undefined;
        return {
          ...origSlide,
          title: typeof item?.title === 'string' ? item.title : origSlide.title,
          text: typeof item?.text === 'string' ? item.text : origSlide.text,
        };
      });
      return {
        ...original,
        slides,
        hook: typeof parsed.hook === 'string' ? parsed.hook : original.hook,
        cta: typeof parsed.cta === 'string' ? parsed.cta : original.cta,
      };
    },
    buildCorrectionPrompt: (script, issues: LintReport['issues']) =>
      buildGenericCorrectionPrompt({
        scriptJson: {
          hook: script.hook,
          slides: script.slides.map((s) => ({ title: s.title, text: s.text })),
          cta: script.cta,
        },
        issues,
        editableFields: ['hook', 'slides[].title', 'slides[].text', 'cta'],
        preserveFields: ['slides[].badge', 'slides[].num', 'slides[].template'],
      }),
  });
}
