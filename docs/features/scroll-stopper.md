# scrollStopper — intro attention grab

Visual animation applied to the entire composition root during the first
~0.6s to halt the viewer's scroll before narration starts. Works in any
module that wires the `useScrollStopperTransform()` hook into its root
`<AbsoluteFill>` (n8n-explainer already does).

## Request payload

```json
"scrollStopper": {
  "preset": "zoom-bounce",
  "durationSeconds": 0.6
}
```

- **Default:** `{ preset: "zoom-bounce", durationSeconds: 0.6 }` when omitted.
- **Disable:** `"preset": "none"`.

## Presets

| Preset          | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `zoom-bounce`   | Scale in from 0.8 → 1.05 → 1.0 with spring settle. Default.   |
| `flash-zoom`    | Quick punch zoom + white flash on impact.                     |
| `glitch-reveal` | Horizontal slice jitter + RGB split that resolves into place. |
| `impact-shake`  | Camera shake + clash zoom. Opinion/commentary reels.          |
| `tv-static`     | Old-CRT noise wipe into frame.                                |
| `swipe-in`      | Hard horizontal swipe — pairs with slide transitions.         |
| `none`          | No intro animation.                                           |

## Architecture

- Presets live in `packages/modules/src/private/remotion/scroll-stopper-presets.ts`
  (private repo source: `reelstack-modules/src/remotion/scroll-stopper-presets.ts`).
- Registered with `registerScrollStopperPreset()` (public registry in
  `packages/remotion/src/components/ScrollStopper.tsx`).
- A preset provides: `useContentTransform(frame, fps, totalFrames)` for
  root CSS + `Overlay` component for flash/noise layers.
- Compositions opt in by calling `useScrollStopperTransform()` + rendering
  `<ScrollStopper preset=... />` above the main content, below captions.

## Adding a preset

Drop a new `registerScrollStopperPreset({...})` call in the private
remotion dir, redeploy. Available to every module that consumes the hook.
