/**
 * Plain text baseline card. Open-source default; no IP. Acts as a safety
 * net so an unbundled host (no private modules overlay) can still emit a
 * functional end-card with the headline text — premium animated cards
 * (shimmer, glitch, hormozi-style, …) live in the private overlay.
 */
import type { CardBuilder } from '../types';
import { escapeHtml } from '../lib/escape-html';
import { registerHfCard } from '../registry';

export const buildTextCard: CardBuilder = (input) => {
  const headline = escapeHtml(input.data.headline ?? '');
  const subheadline = input.data.subheadline ? escapeHtml(input.data.subheadline) : '';
  const action = input.data.action ? escapeHtml(input.data.action) : '';
  const accent = input.palette.accent;
  const text = input.palette.text;
  const muted = input.palette.textMuted;
  const bg = input.palette.background;
  const id = input.instanceId;

  const html = `
<div class="card-text" style="
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;
  background:${bg};padding:80px;
">
  <div class="card-text__headline" style="
    font-size:96px;font-weight:900;color:${text};
    margin-bottom:24px;line-height:1.1;
  ">${headline}</div>
  ${subheadline ? `<div class="card-text__subheadline" style="font-size:48px;color:${muted};margin-bottom:32px;line-height:1.3;">${subheadline}</div>` : ''}
  ${action ? `<div class="card-text__action" style="font-size:36px;color:${accent};font-weight:700;">${action}</div>` : ''}
</div>
`.trim();

  // Single fade-in at cardStart — minimal animation. Premium cards
  // override with their own GSAP timelines.
  const attachBody = `
    var root = document.querySelector('#' + instanceId);
    if (!root) return;
    tl.fromTo(
      root,
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: 'power2.out' },
      ${input.cardStart}
    );
  `.trim();

  return { html, attachBody };
};

registerHfCard('text', buildTextCard);
