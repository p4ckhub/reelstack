# captionPreset — premium caption renderers

Per-word highlight styles for `CaptionOverlay`. Every preset reserves
layout on **every** word (not just the active one) so the caption line
does not reflow as the highlight walks — no jitter.

## Request payload

```json
"brandPreset": {
  "captionPreset": "pop-word",
  "highlightColor": "#F59E0B",
  "backgroundColor": "#0E0E12"
}
```

On the `n8n-explainer` composition the same mode can be passed inline
via `captionStyle.highlightMode`. `brandPreset.captionPreset` is the
higher-level wrapper surfaced by the API.

## Presets

| Preset            | Look                                 | Notes                                                |
| ----------------- | ------------------------------------ | ---------------------------------------------------- |
| `pop-word`        | Scale 1.08x bounce on active         | **Default.** Bouncy, works on any background.        |
| `hormozi`         | Coloured + scaled active word        | Alex-Hormozi look; active inherits highlight color.  |
| `pill`            | Solid colour pill behind active word | Reserves padding + border radius on every word.      |
| `glow`            | Text-shadow glow on active           | Doesn't affect box size — always stable.             |
| `underline-sweep` | 4px accent underline on active       | Transparent border reserved on every word.           |
| `box-highlight`   | Translucent bg + left-border accent  | Useful on busy footage.                              |
| `single-word`     | One word on screen at a time         | Bypasses normal cue flow; uses global word timeline. |
| `text`            | Plain `seg.color`, no decoration     | Baseline / fallback.                                 |

## Architecture

- Registry: `packages/remotion/src/components/highlight-modes.ts`
  (public API). Renderers provide `activeStyle(opts)` + optional
  `baseStyle(opts)` which is applied to _every_ word for layout
  stability.
- Premium renderers are registered by
  `packages/modules/src/private/remotion/highlight-modes.ts`
  (private repo source:
  `reelstack-modules/src/remotion/highlight-modes.ts`).
- Composition consumers: `CaptionOverlay` picks the renderer via
  `getHighlightMode(captionStyle.highlightMode)`.

## Why no CSS transitions

Remotion renders each frame from scratch — CSS `transition:` snaps
instead of interpolating. All motion lives in frame-based scale values
(e.g. `pop-word` uses `scale(1.08)` with `transformOrigin: 'center
bottom'`). If you want smooth animation across the entry of the active
word, animate it in the composition (not via CSS).

## Adding a preset

Add another `registerHighlightMode({...})` call in the private
`highlight-modes.ts`, ensure `baseStyle` reserves the same footprint
the `activeStyle` will occupy (padding, borders, inline-block), redeploy.
