/**
 * Top-level dispatcher for HF card overlays. Looks up the per-slug
 * builder, wraps its output in a scoped `<div>`, and emits a `<script>`
 * that registers the attach function on
 * `window.__hfAttachCardInstances[instanceId]`.
 *
 * Host composition contract:
 *
 *   <body>
 *     {{cardBlock}}
 *
 *     <script>
 *       const tl = gsap.timeline({ paused: true });
 *       // … host tweens …
 *       Object.values(window.__hfAttachCardInstances || {})
 *         .forEach(fn => fn(tl));
 *       window.__timelines['<host-name>'] = tl;
 *     </script>
 *   </body>
 *
 * Naming convention inside per-card builders:
 *   - The dispatcher wraps the HTML with `<div id="<instanceId>" data-card-instance="<slug>">`.
 *   - Every selector in `attachBody` is prefixed with `#<instanceId>` so two
 *     instances of the same card on one timeline don't collide.
 *   - Card-internal CSS uses class names of the form `.card-<slug>__<part>`.
 */

import type { CardRenderInput } from './types';
import { CARD_BUILDERS } from './cards/index';

/**
 * Build the full HTML + GSAP block for a single card instance.
 * Returns `''` when the slug is unknown — callers should validate
 * upstream. The orchestrator typically validates against a registry
 * before reaching here.
 */
export function buildHfCardBlock(input: CardRenderInput): string {
  const builder = CARD_BUILDERS[input.slug];
  if (!builder) {
    // Unknown slug → emit a comment so the failure mode is visible
    // when the rendered HTML is inspected.
    return `<!-- buildHfCardBlock: unknown card slug "${input.slug}" -->`;
  }

  const instanceId = input.instanceId ?? 'EndCard';
  const { html, attachBody } = builder({ ...input, instanceId });

  // The wrapper covers the whole frame; its `data-start`/`data-duration`
  // attributes signal HF's clip-visibility tracker. `track-index=30`
  // keeps it on top of screenshot/captions/audio (which are 1-3).
  return `
<div
  id="${instanceId}"
  data-card-instance="${input.slug}"
  class="hf-card hf-card--${input.slug}"
  data-start="${input.cardStart}"
  data-duration="${input.cardDuration}"
  data-track-index="30"
  style="position:absolute;inset:0;overflow:hidden;opacity:0;will-change:opacity;z-index:30;pointer-events:none;"
>
  ${html}
</div>
<script>
  (function () {
    if (typeof window === 'undefined') return;
    window.__hfAttachCardInstances = window.__hfAttachCardInstances || {};
    window.__hfAttachCardInstances[${JSON.stringify(instanceId)}] = function (tl) {
      if (!tl || typeof tl.fromTo !== 'function') return;
      var instanceId = ${JSON.stringify(instanceId)};
      ${attachBody}
    };
  })();
</script>
`.trim();
}

/**
 * Per-mode default card slug. Picked when the caller doesn't supply
 * `endCard.cardSlug` and we want a sensible visual that fits the
 * mode's vibe. Anything not listed falls back to `shimmer` (the safest
 * universal animation).
 *
 * Tweak per-mode here; users override per-request via `endCard.cardSlug`.
 */
export const MODE_DEFAULT_CARD_SLUG: Record<string, string> = {
  'n8n-explainer': 'shimmer',
  'presenter-explainer': 'neon-sign',
  'talking-object': 'burst',
  'ai-tips': 'neon-circuit',
  'ai-short-film': 'spotlight',
  'ai-storytelling': 'spotlight',
  slideshow: 'shimmer',
  captions: 'shimmer',
  'zoom-reframe': 'shimmer',
  'hello-hf': 'wave-text',
};

const FALLBACK_CARD_SLUG = 'shimmer';

/**
 * Resolve which card-library slug to render for the end-card. Priority:
 *   1. Explicit `endCard.cardSlug` from caller.
 *   2. `MODE_DEFAULT_CARD_SLUG[mode]` if mode is known.
 *   3. `FALLBACK_CARD_SLUG` (`shimmer`).
 */
export function resolveEndCardSlug(
  endCardCardSlug: string | undefined,
  mode: string | undefined
): string {
  if (endCardCardSlug && CARD_BUILDERS[endCardCardSlug]) return endCardCardSlug;
  if (mode && MODE_DEFAULT_CARD_SLUG[mode]) return MODE_DEFAULT_CARD_SLUG[mode]!;
  return FALLBACK_CARD_SLUG;
}

/**
 * Build the end-card block for a finished reel. Wraps `buildHfCardBlock`
 * with the legacy `EndCardConfig` shape used by every module orchestrator
 * (n8n-explainer / slideshow / captions / presenter / …).
 *
 * `mode` lets the dispatcher pick a mode-appropriate default card slug
 * when the caller didn't specify one (e.g. presenter-explainer →
 * `neon-sign`); see `MODE_DEFAULT_CARD_SLUG` above.
 */
import type { EndCardConfig } from '../cta/cta-templates';

export function buildHfEndCardBlock(
  endCard: EndCardConfig | undefined,
  totalDurationSeconds: number,
  mode?: string
): string {
  if (!endCard || endCard.enabled === false || !endCard.headline) return '';

  const cardDuration = endCard.durationSeconds ?? 3;
  const cardStart = Math.max(0, totalDurationSeconds - cardDuration);
  const accent = endCard.accentColor ?? '#7c3aed';
  const background = endCard.backgroundColor ?? '#09090f';
  const slug = resolveEndCardSlug(endCard.cardSlug, mode);

  return buildHfCardBlock({
    slug,
    cardStart,
    cardDuration,
    totalDuration: totalDurationSeconds,
    mode: 'cta-outro',
    palette: {
      slug: 'custom',
      accent,
      background,
      text: '#ffffff',
      textMuted: 'rgba(255,255,255,0.78)',
      glow: accent,
    },
    data: {
      headline: endCard.headline,
      subheadline: endCard.subheadline,
      action: endCard.action,
    },
    instanceId: 'EndCard',
  });
}
