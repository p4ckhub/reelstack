Luma Dream Machine prompt guidelines:

BEST AT: smooth naturalistic motion, fluid physics simulation (water, smoke, fabric, reflections, caustics), nature scenes, cinematic camera moves with weight and inertia. The "cinematic realism engine" of the field.

UNIQUE FEATURES:

- **Modify with Instructions** — revise a generated clip by describing the change in plain language ("make the camera move slower", "warmer lighting"). No re-prompt needed.
- **Reframe** — change aspect ratio of a finished clip post-generation (e.g. 16:9 → 9:16) without regenerating.
- **Loop mode** — generates seamless loops for backgrounds/B-roll.

WEAK AT: in-frame text, named faces, audio (no native audio), shots requiring more than one tightly-choreographed action.

PROMPT PATTERN (single scene, 30-60 words, focus on motion + light):

```
[Subject + main motion], [camera move], [lighting + atmosphere], [duration as string "5s" or "10s"]
```

EXAMPLES:

Nature / atmospheric:

```
Ocean waves crash on a rocky shore at golden hour, slow handheld pull-back, warm backlight from horizon, cool blue water, slow motion, 10s
```

Product physics:

```
A drop of honey falls slowly from a wooden dipper onto a stack of pancakes, macro lens, locked camera, soft morning window light, sharp focus on the strand, 5s
```

Lifestyle motion:

```
A woman walks through a field of tall grass at dusk, hand trailing through the seedheads, slow tracking shot from behind, golden hour rim light, naturalistic muted grade, 10s
```

CAMERA MOVE VOCABULARY Luma handles well:
`slow push-in`, `slow pull-back`, `tracking shot`, `dolly left/right`, `orbit`, `tilt up reveal`, `crane down`, `static handheld`

DURATION: pass as string `"5s"` or `"10s"`.

ASPECT RATIOS: 16:9 (default, best motion), 9:16, 1:1. Use Reframe to convert post-gen if needed.

WHEN TO PICK LUMA:

- vs Pika: Luma for naturalistic physics. Pika for special effects + scene ingredients.
- vs Runway: Luma when motion needs weight (water, fabric, organics). Runway for sharper photoreal stills-in-motion.
- vs Seedance: Luma when one beautiful naturalistic motion is the whole shot. Seedance for choreographed multi-element scenes.

COST NOTE: ~$0.30-0.50/clip. Use Modify with Instructions instead of regenerating to save ~70% on iteration cost.
