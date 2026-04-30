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
 * Backwards-compat shim: existing code (n8n-explainer / slideshow /
 * captions orchestrators) calls `buildHfEndCardBlock(endCard, totalDuration)`.
 * The shape is the legacy `EndCardConfig` (no slug — always shimmer).
 * We map it onto `buildHfCardBlock({ slug: 'shimmer', ... })`.
 *
 * Deprecation path: orchestrators can migrate to `buildHfCardBlock`
 * directly when callers want to pick a non-shimmer card. Until then
 * this shim preserves the existing wiring (host compositions still
 * read `__hfAttachCardInstances` regardless of how the block was built).
 */
import type { EndCardConfig } from '../cta/cta-templates';

export function buildHfEndCardBlock(
  endCard: EndCardConfig | undefined,
  totalDurationSeconds: number
): string {
  if (!endCard || endCard.enabled === false || !endCard.headline) return '';

  const cardDuration = endCard.durationSeconds ?? 3;
  const cardStart = Math.max(0, totalDurationSeconds - cardDuration);
  const accent = endCard.accentColor ?? '#7c3aed';
  const background = endCard.backgroundColor ?? '#09090f';

  return buildHfCardBlock({
    slug: 'shimmer',
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
