/**
 * Build the HTML + GSAP block that renders an end-card overlay in a
 * Hyperframes composition.
 *
 * Returns a single string that the orchestrator drops into a template
 * variable (`{{endCardBlock}}`). Each HF composition just needs:
 *
 *   <body>
 *     <!-- … -->
 *     {{endCardBlock}}
 *   </body>
 *
 * When `endCard` is `undefined` / disabled, the function returns `''`
 * — no DOM, no GSAP wiring, no end-card rendered.
 */

import type { EndCardConfig } from './cta-templates';

export function buildHfEndCardBlock(
  endCard: EndCardConfig | undefined,
  totalDurationSeconds: number
): string {
  if (!endCard || endCard.enabled === false || !endCard.headline) return '';

  const cardDuration = endCard.durationSeconds ?? 3;
  const cardStart = Math.max(0, totalDurationSeconds - cardDuration);
  const accent = endCard.accentColor ?? '#7c3aed';
  const background = endCard.backgroundColor ?? '#09090f';
  const headline = escapeHtml(endCard.headline);
  const subheadline = endCard.subheadline ? escapeHtml(endCard.subheadline) : '';
  const action = endCard.action ? escapeHtml(endCard.action) : '';

  // Inline GSAP wiring uses the same structure as the n8n-explainer
  // composition: card mounts at `cardStart` with a back.out overshoot,
  // then headline / sub / action drop in staggered for a layered reveal.
  return `
<div
  id="end-card"
  class="clip"
  data-start="${cardStart}"
  data-duration="${cardDuration}"
  data-track-index="30"
  style="position:absolute;inset:0;background:${background};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:140px 90px;text-align:center;opacity:0;will-change:opacity,transform;z-index:30;"
>
  <div id="end-card-headline" style="font-size:104px;font-weight:900;color:#ffffff;line-height:1.05;letter-spacing:-0.02em;margin-bottom:48px;">
    ${headline}
  </div>
  ${subheadline ? `<div id="end-card-subheadline" style="font-size:46px;font-weight:500;color:rgba(255,255,255,0.78);line-height:1.3;margin-bottom:96px;max-width:900px;">${subheadline}</div>` : ''}
  ${action ? `<div id="end-card-action" style="font-size:54px;font-weight:800;color:#ffffff;background:${accent};padding:36px 72px;border-radius:96px;box-shadow:0 16px 48px rgba(0,0,0,0.35);">${action}</div>` : ''}
</div>
<script>
  (function() {
    if (!window.__timelines) return;
    var tlKey = Object.keys(window.__timelines)[0];
    if (!tlKey) return;
    var tl = window.__timelines[tlKey];
    if (!tl || typeof tl.fromTo !== 'function') return;
    tl.fromTo('#end-card', { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.6)' }, ${cardStart});
    tl.fromTo('#end-card-headline', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, ${cardStart + 0.12});
    ${subheadline ? `tl.fromTo('#end-card-subheadline', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, ${cardStart + 0.24});` : ''}
    ${action ? `tl.fromTo('#end-card-action', { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }, ${cardStart + 0.36});` : ''}
  })();
</script>
`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
