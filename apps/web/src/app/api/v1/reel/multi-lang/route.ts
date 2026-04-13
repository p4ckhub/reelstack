import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import {
  createReelJob,
  consumeCredits,
  getCreditCost,
  updateReelJobStatus,
} from '@reelstack/database';
import { getTierLimits } from '@/lib/api/validation';
import { createQueue } from '@reelstack/queue';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { multiLangReelSchema } from '@/lib/api/v1/reel-schemas';
import { translateText } from '@/lib/api/v1/translate';
import type { AuthContext } from '@/lib/api/v1/types';
import { randomUUID } from 'crypto';
import { createLogger } from '@reelstack/logger';

const log = createLogger('reel-multi-lang');

/** TTS language code mapping: short code -> BCP-47 */
const TTS_LANG_MAP: Record<string, string> = {
  pl: 'pl-PL',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  pt: 'pt-BR',
  nl: 'nl-NL',
  ru: 'ru-RU',
  uk: 'uk-UA',
  cs: 'cs-CZ',
  sk: 'sk-SK',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
  ar: 'ar-SA',
  hi: 'hi-IN',
  sv: 'sv-SE',
  da: 'da-DK',
  no: 'nb-NO',
  fi: 'fi-FI',
  hu: 'hu-HU',
  ro: 'ro-RO',
  bg: 'bg-BG',
  hr: 'hr-HR',
  sr: 'sr-RS',
  sl: 'sl-SI',
  tr: 'tr-TR',
  vi: 'vi-VN',
  th: 'th-TH',
};

/**
 * POST /api/v1/reel/multi-lang
 *
 * Create reels in multiple languages from a single script.
 * Translates the script, then queues one reel per target language.
 * Each language consumes one render credit.
 */
export const POST = withAuth(
  { scope: API_SCOPES.REEL_WRITE, rateLimit: { maxRequests: 3, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = multiLangReelSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    // Check AI API availability
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return errorResponse('SERVICE_UNAVAILABLE', 'Translation service unavailable', 503);
    }

    const limits = await getTierLimits(ctx.user.tier as import('@/lib/api/validation').TierName);
    const cost = await getCreditCost('video_multilang');
    const batchId = randomUUID();
    const results: Array<
      { language: string; jobId: string; status: 'queued' } | { language: string; error: string }
    > = [];

    let queue: Awaited<ReturnType<typeof createQueue>> | null = null;
    try {
      queue = await createQueue();
    } catch {
      return errorResponse('SERVICE_UNAVAILABLE', 'Reel render queue unavailable', 503);
    }

    // Translate and queue each language sequentially (avoid translation API rate limits)
    // Order: translate → consume credit → create job → enqueue
    // Credit is consumed only after successful translation to avoid waste
    for (const targetLang of parsed.data.targetLanguages) {
      // Translate script first (before consuming credit)
      let translatedScript: string;
      if (targetLang === parsed.data.sourceLanguage) {
        translatedScript = parsed.data.script;
      } else {
        try {
          translatedScript = await translateText(
            parsed.data.script,
            parsed.data.sourceLanguage,
            targetLang
          );
          log.info({ targetLang, scriptLen: translatedScript.length }, 'Translation complete');
        } catch (err) {
          log.error({ targetLang, err }, 'Translation failed');
          results.push({ language: targetLang, error: 'Translation failed' });
          continue;
        }
      }

      // Check credit only after successful translation
      const { consumed } = await consumeCredits(ctx.user.id, limits.creditsPerMonth, cost);
      if (!consumed) {
        results.push({ language: targetLang, error: 'Quota exceeded - no credits remaining' });
        continue;
      }

      // Create reel job with target language TTS config
      const ttsLanguage = TTS_LANG_MAP[targetLang] ?? `${targetLang}-${targetLang.toUpperCase()}`;
      const job = await createReelJob({
        userId: ctx.user.id,
        script: translatedScript,
        reelConfig: {
          layout: parsed.data.layout,
          style: parsed.data.style,
          tts: {
            provider: parsed.data.tts?.provider ?? 'edge-tts',
            voice: parsed.data.tts?.voice,
            language: ttsLanguage,
          },
          brandPreset: parsed.data.brandPreset,
        },
        apiKeyId: ctx.apiKeyId ?? undefined,
        creditCost: cost,
        callbackUrl: parsed.data.callbackUrl,
        parentJobId: batchId,
        language: targetLang,
      });

      try {
        await queue.enqueue(job.id, { jobId: job.id }, 'reel-render');
        results.push({ language: targetLang, jobId: job.id, status: 'queued' });
      } catch {
        await updateReelJobStatus(job.id, { status: 'FAILED', error: 'Queue unavailable' }).catch(
          () => {}
        );
        results.push({ language: targetLang, error: 'Queue unavailable' });
      }
    }

    const queued = results.filter((r) => 'jobId' in r).length;
    const failed = results.filter((r) => 'error' in r).length;

    return successResponse(
      {
        batchId,
        sourceLanguage: parsed.data.sourceLanguage,
        total: parsed.data.targetLanguages.length,
        queued,
        failed,
        jobs: results,
      },
      201
    );
  }
);
