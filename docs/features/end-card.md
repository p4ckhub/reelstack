# endCard — closing CTA overlay

Dark gradient-mesh CTA card that slides over the last N seconds of a
reel. Spring-bounced headline with a one-shot shimmer, slide-up
subheadline, glowing monospace action line with accent bars.

## Request payload

```json
"endCard": {
  "headline": "Automate your content",
  "subheadline": "Open source video pipeline. Self-host for $5/mo.",
  "action": "reelstack.dev",
  "durationSeconds": 3,
  "accentColor": "#7c3aed",
  "backgroundColor": "#09090f"
}
```

Omit the whole object to render without a card.

## Fields

| Field             | Default   | Notes                                                                           |
| ----------------- | --------- | ------------------------------------------------------------------------------- |
| `headline`        | —         | Required when present. Spring-bounced, shimmer-swept.                           |
| `subheadline`     | _none_    | Slides up 0.55s after headline.                                                 |
| `action`          | _none_    | Monospace, continuous glow pulse, flanked by accent bars. Good for URLs.        |
| `durationSeconds` | `3`       | Tail length. Composition auto-extends by this much so narration finishes first. |
| `accentColor`     | `#7c3aed` | Used for glows, bars, and mesh highlights.                                      |
| `backgroundColor` | `#09090f` | Base vignette under the mesh.                                                   |

## Architecture

- Implemented as a private card preset (`shimmer`) in `reelstack-modules`
  — composition looks it up via `getCard('shimmer')` from
  `@reelstack/remotion/cards`.
- Pure transform + opacity animations (Lighthouse-safe, deterministic
  across render retries).
- Renders `null` outside its frame window, so the underlying composition
  plays untouched up to the trigger.

## Layout contract

The composition's orchestrator must **extend total duration** by
`endCard.durationSeconds` while keeping the last section's `endTime` at
the TTS audio duration. This guarantees narration doesn't overlap the
card entrance. `n8n-explainer-orchestrator` does this via
`audioDurationSeconds` + `durationSeconds = audio + tail`.
