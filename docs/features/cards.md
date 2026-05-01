# HF cards library — 27 visual overlay variants

Pure HTML + CSS + GSAP cards rendered via the Hyperframes (HF) runtime.
Used as end-card animations and (in the future) inline overlays for any
HF composition. Ported 1:1 from a Remotion card library so visual
fidelity matches across runtimes.

## Catalog (27 slugs)

| Slug              | Vibe                                                    |
| ----------------- | ------------------------------------------------------- |
| `shimmer`         | Gradient mesh + spring + sweep (default outro).         |
| `glitch`          | Per-frame jitter + chromatic shift.                     |
| `typewriter`      | Char-by-char terminal reveal.                           |
| `burst`           | 80-particle radial explosion.                           |
| `liquid`          | Blob morph via noise2D.                                 |
| `flip`            | 3D card flip with before/after.                         |
| `glitch-blast`    | Aggressive 1 s chromatic shatter, 6-band slice jitter.  |
| `slot-machine`    | Reels lock in.                                          |
| `split-reveal`    | Two halves slide apart, content lands in the gap.       |
| `spotlight`       | Beam sweep across the headline.                         |
| `warp-speed`      | Hyperspace tunnel.                                      |
| `retro-vhs`       | Tape drift, jitter, scanlines.                          |
| `3d-frame`        | Rotating slab with CSS perspective.                     |
| `subscribe-bell`  | YouTube-style notify ring + bell.                       |
| `portal`          | Concentric ring iris-open.                              |
| `wave-text`       | Per-letter sinusoidal ripple.                           |
| `chromatic-pulse` | RGB heartbeat layers.                                   |
| `neon-sign`       | Vegas-style flicker + breath.                           |
| `ink-splash`      | Ink drop spread via clip-path.                          |
| `stamp-slam`      | Big stamp impact with shake.                            |
| `neon-circuit`    | SVG path-draw electric trace.                           |
| `stat-card`       | Count-up number with label.                             |
| `hologram`        | Marvel-style projection + scan-line + chromatic spikes. |
| `beat-pulse`      | Reactive ring (sine fallback, no real audio analysis).  |
| `quote-card`      | Centered pull-quote with attribution.                   |
| `countdown-punch` | 3 → 2 → 1 → GO punches.                                 |
| `emoji-burst`     | Unicode emoji confetti via physics.                     |

Demo: `bun run scripts/render-cards-demo.ts` → `/tmp/cards-demo.mp4`
(89 s, all 27 sequentially with title labels).

## API surface

### Direct call

```ts
import { buildHfCardBlock } from '@reelstack/agent';

const html = buildHfCardBlock({
  slug: 'neon-sign',
  cardStart: 60,        // seconds — when the card animates in
  cardDuration: 4,
  totalDuration: 65,
  mode: 'cta-outro',
  palette: { accent: '#7c3aed', background: '#09090f', text: '#ffffff', ... },
  data: { headline: 'Subscribe', subheadline: 'New videos every week', action: 'youtube.com/@you' },
  instanceId: 'EndCard',
});
```

### As an end-card via /generate

```json
"endCard": {
  "platform": "ig",
  "cardSlug": "neon-sign",
  "headline": "Skontaktuj się",
  "action": "DM 'INFO'"
}
```

`cardSlug` is optional; orchestrator picks a mode-appropriate default
(see `MODE_DEFAULT_CARD_SLUG` in `packages/agent/src/cards/build-hf-card.ts`).

### As a matrix dimension (visual A/B test)

```json
"dimensions": {
  "endCard.cardSlug": ["shimmer", "neon-sign", "burst", "wave-text", "glitch"]
}
```

5 cells × 1 base full pipeline + 4 free forks = test which card converts
best for the same script + voiceover.

## Per-mode defaults

| Mode                  | Default card   |
| --------------------- | -------------- |
| `n8n-explainer`       | `shimmer`      |
| `presenter-explainer` | `neon-sign`    |
| `talking-object`      | `burst`        |
| `ai-tips`             | `neon-circuit` |
| `ai-short-film`       | `spotlight`    |
| `ai-storytelling`     | `spotlight`    |
| `slideshow`           | `shimmer`      |
| `captions`            | `shimmer`      |
| `zoom-reframe`        | `shimmer`      |
| `hello-hf`            | `wave-text`    |

Tweak per-mode in `packages/agent/src/cards/build-hf-card.ts:MODE_DEFAULT_CARD_SLUG`.

## Architecture

`packages/agent/src/cards/`:

- `types.ts` — `CardRenderInput`, `CardBlockOutput`, `CardBuilder`
- `build-hf-card.ts` — top-level dispatcher + `buildHfEndCardBlock` shim +
  `MODE_DEFAULT_CARD_SLUG` map + `resolveEndCardSlug()`
- `cards/<slug>.ts` × 27 — per-card HTML + GSAP attach builders
- `cards/index.ts` — `CARD_BUILDERS` registry, `REGISTERED_SLUGS`
- `lib/escape-html.ts`, `lib/deterministic-random.ts` — shared utilities

Each card builder returns `{ html, attachBody }`:

- `html` — markup wrapped by the dispatcher in
  `<div id="<instanceId>" data-card-instance="<slug>" class="hf-card hf-card--<slug>">`
- `attachBody` — JS string attaching GSAP tweens, scoped to `#<instanceId>` selectors

The dispatcher emits a `<script>` that registers the per-instance attach
function under `window.__hfAttachCardInstances[<instanceId>]`. Host
compositions iterate this registry and splice each card's tweens onto
their main GSAP timeline:

```js
// In every HF host composition (n8n-explainer / slideshow / captions / …):
Object.values(window.__hfAttachCardInstances || {}).forEach((fn) => fn(tl));
window.__timelines['<host-name>'] = tl;
```

This pattern works because HF runtime only seeks the captured timeline
(matching the stage's `data-composition-id`); secondary timeline entries
get `play()`'d once but not seeked frame-by-frame.

## Adding a new card

1. Create `packages/agent/src/cards/cards/<slug>.ts` exporting
   `build<Pascal>Card: CardBuilder`.
2. Use `seededRandom()` for any per-frame randomness so the render is
   deterministic across retries.
3. Scope every CSS class with `.card-<slug>__<part>` to avoid collisions
   with other cards on the same composition.
4. Register in `cards/index.ts` `CARD_BUILDERS`.
5. Optionally add to `MODE_DEFAULT_CARD_SLUG` if it fits a specific mode.
6. Run `bun run scripts/render-cards-demo.ts` to see it in the contact
   sheet.

## Translation patterns (Remotion → HF)

Captured during the 1:1 port — reusable when adding new cards:

- `spring(damping, stiffness)` ≈ `back.out(1.2-1.5)` GSAP ease.
- `interpolate(frame, [a,b], [v1,v2])` → `tl.fromTo(target, {v: v1}, {v: v2, duration: (b-a)/fps, ease: 'none'}, a/fps)`.
- `Math.sin()` continuous loops → GSAP `yoyo + repeat`.
- Per-frame `random(seed)` jitter → pre-compute via `seededRandom()` +
  emit stepped `tl.set` calls (every N frames, not every frame).
- 80-particle burst → 1 `onUpdate` tween + DOM transforms inside the
  callback (cheaper than 80 GSAP tweens).
- `useAudioData` → sine-wave fallback (HF has no Web Audio at render time).
- `@remotion/three` 3D scenes → CSS `perspective` + `rotateY`.
- `@remotion/lottie` emojis → Unicode emoji glyphs.
- `fitText` auto-sizing → fixed font-sizes; brand data should stay short.

## Critical gotchas

- **GSAP `tl.fromTo` needs 4 args** (target, fromVars, toVars, position).
  Calling with 3 args treats the position-number as `toVars` and crashes.
  Use `tl.to({obj}, {...vars, position})` for `onUpdate`-driven tweens.
- **HF `injectVariables` HTML-escapes by default** — raw HTML/JS blocks
  need a `*Block` or `*Html` suffix to skip escaping. Caller responsible
  for escaping user input INSIDE the block.
- **HF runtime seeks only ONE captured timeline** — secondary
  `__timelines` entries don't get seeked frame-by-frame, only `play()`'d.
  End-card / overlay tweens MUST be spliced onto the host's main
  timeline via the `__hfAttachCardInstances` pattern.
- **SVG `<polygon>` `points` attribute requires absolute numbers**, not
  percentages. Use `viewBox` + integer coords.

## Related docs

- `docs/features/end-card.md` — end-card schema + per-platform CTA
  templates that copy/paste with the cards.
- `docs/features/matrix.md` — testing visual variants via matrix.
