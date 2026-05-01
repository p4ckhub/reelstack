# endCard — closing CTA overlay

A 3-second visual card with platform-specific call-to-action that slides
over the last N seconds of any reel. The visual animation comes from the
HF cards library (27 options); the copy comes from per-platform CTA
templates that match each network's lead-capture mechanic.

## Request payload

Minimal — let the orchestrator pick everything:

```json
"endCard": { "platform": "ig" }
```

Full override:

```json
"endCard": {
  "platform": "ig",
  "cardSlug": "neon-sign",
  "keyword": "N8N",
  "headline": "Skomentuj \"N8N\"",
  "subheadline": "Wyślę Ci link w DM",
  "action": "↓ Komentarz pod rolką",
  "durationSeconds": 4,
  "accentColor": "#7c3aed",
  "backgroundColor": "#09090f"
}
```

Omit the whole object to render without a card.

## Fields

| Field             | Default           | Notes                                                                                                                                                                                    |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`         | `true`            | Set `false` to skip the card while keeping the rest of the request.                                                                                                                      |
| `platform`        | `universal`       | One of `ig`, `fb`, `tiktok`, `youtube`, `linkedin`, `universal`. Drives the per-network CTA template (comment-DM for IG/FB, link-in-bio for TT/LI, link-in-description for YT).          |
| `cardSlug`        | mode default      | Visual variant from the HF cards library (27 slugs). Mode defaults: n8n-explainer→`shimmer`, presenter→`neon-sign`, talking-object→`burst`, ai-tips→`neon-circuit`, slideshow→`shimmer`. |
| `keyword`         | module default    | IG/FB only. The narrator says "comment X to get the link"; `keyword` is X. Module passes its own default (n8n-explainer→`N8N`).                                                          |
| `headline`        | platform template | Override headline. Falls back to platform template formatted with `keyword`.                                                                                                             |
| `subheadline`     | platform template | Slides up 0.55s after headline.                                                                                                                                                          |
| `action`          | platform template | Monospace, continuous glow pulse. Good for URLs.                                                                                                                                         |
| `durationSeconds` | `3`               | Tail length. Composition auto-extends by this much so narration finishes first.                                                                                                          |
| `accentColor`     | `#7c3aed`         | Used for glows, bars, and mesh highlights.                                                                                                                                               |
| `backgroundColor` | `#09090f`         | Base vignette under the mesh.                                                                                                                                                            |

## Per-platform CTA templates

| Platform    | PL example headline | EN example headline   | Mechanic              |
| ----------- | ------------------- | --------------------- | --------------------- |
| `ig`        | `Skomentuj "N8N"`   | `Comment "N8N"`       | Comment → DM via Meta |
| `fb`        | `Skomentuj "N8N"`   | `Comment "N8N"`       | Comment → DM via Meta |
| `tiktok`    | `Link w bio`        | `Link in bio`         | Linktree-style        |
| `youtube`   | `Link w opisie`     | `Link in description` | Description link      |
| `linkedin`  | `Link w bio`        | `Link in bio`         | Profile link          |
| `universal` | `Sprawdź profil`    | `Check the profile`   | Fallback              |

Templates live in `packages/agent/src/cta/cta-templates.ts` (PL+EN).

## 27 cardSlug options (HF library)

`shimmer`, `glitch`, `typewriter`, `burst`, `liquid`, `flip`,
`glitch-blast`, `slot-machine`, `split-reveal`, `spotlight`,
`warp-speed`, `retro-vhs`, `3d-frame`, `subscribe-bell`, `portal`,
`wave-text`, `chromatic-pulse`, `neon-sign`, `ink-splash`, `stamp-slam`,
`neon-circuit`, `stat-card`, `hologram`, `beat-pulse`, `quote-card`,
`countdown-punch`, `emoji-burst`.

Demo all 27 sequentially: `bun run scripts/render-cards-demo.ts` →
`/tmp/cards-demo.mp4` (89 s, all cards back-to-back).

## A/B test card variants

Use `POST /api/v1/reel/matrix` with `endCard.cardSlug` as a dimension —
1 base full pipeline + N free forks, all with the same script + voiceover

- screenshot, only the closing card differs. See
  `bruno/reelstack/matrix-extra/matrix-cardslug-ab.bru`.

## Architecture

- Visual cards are pure HTML + CSS + GSAP (HF runtime). 27 builders
  registered in `packages/agent/src/cards/cards/index.ts`; dispatcher
  in `packages/agent/src/cards/build-hf-card.ts`.
- `buildHfEndCardBlock(endCard, totalDuration, mode)` resolves the
  effective slug via `resolveEndCardSlug()` (caller `cardSlug` →
  `MODE_DEFAULT_CARD_SLUG[mode]` → `shimmer`).
- All HF host compositions (n8n-explainer / slideshow / captions) drop
  the rendered block via `{{endCardBlock}}` and the worker iterates
  `window.__hfAttachCardInstances` to splice card animations onto the
  main GSAP timeline.

## Layout contract

The composition's orchestrator must **extend total duration** by
`endCard.durationSeconds` while keeping the last section's `endTime` at
the TTS audio duration. This guarantees narration doesn't overlap the
card entrance. `n8n-explainer-orchestrator` does this via
`audioDurationSeconds` + `durationSeconds = audio + tail`.
