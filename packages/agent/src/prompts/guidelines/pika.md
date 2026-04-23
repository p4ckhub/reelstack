Pika 2.2 prompt guidelines:

BEST AT: rapid creative variations (great for A/B testing social campaigns), special effects, product reveals, transitions, cinematic short clips up to 1080p / 10s.

UNIQUE FEATURES:

- **Scene Ingredients** (Pika 2.0+) — you can pin a character, object, or style as a persistent "ingredient" that appears in multiple shots without re-describing it.
- **Picaframes** — interpolate between two keyframe images for precise start/end control.
- **Pika Effects** library — preset transformations (squish, melt, explode, inflate, crush) applied to a subject.

WEAK AT: complex multi-person scenes, dialogue (no native audio sync), long continuous shots over 10s (use Veo 3.1 or Seedance for longer).

PROMPT PATTERN (lead with action, single moment, 20-50 words):

```
[Subject does ACTION], [camera motion hint], [lighting + atmosphere]
```

EXAMPLES:

Product reveal:

```
A coffee cup slides into frame on a marble surface, steam curling upward, slow zoom toward the rim, soft morning window light from camera-right, warm neutral grade
```

Action moment:

```
A drop of ink falls into clear water and blooms into a swirling cloud, macro shot, locked camera, single hard top light, dark dramatic background
```

Transition (entry):

```
A page of code text materializes letter-by-letter on a dark screen, soft blue monitor glow, locked close-up, then slow pull-back revealing the developer
```

CAMERA MOTION HINTS Pika respects:
`slow zoom`, `pan left`, `pan right`, `tracking shot`, `tilt up`, `tilt down`, `static`, `handheld`

DURATION: 5s or 10s clips at 1080p.

ASPECT RATIOS: 9:16, 1:1, 16:9.

WHEN TO PICK PIKA:

- vs Runway Gen-4: Pika for rapid iteration / variations / Pika Effects. Runway for cleaner photoreal scenes.
- vs Luma: Pika for special effects + scene ingredients. Luma for naturalistic motion + physics.
- vs Seedance: Pika for transitions/effects. Seedance for cinematic narrative shots.

COST NOTE: ~$0.10-0.30/clip. Cheap enough for generate-3-pick-1 workflow.
